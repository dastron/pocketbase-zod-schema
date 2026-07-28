# PocketBase Zod Migration

[![npm version](https://badge.fury.io/js/pocketbase-zod-schema.svg)](https://badge.fury.io/js/pocketbase-zod-schema)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

A TypeScript-first migration generator for PocketBase that uses Zod schemas to create type-safe database migrations.

## Features

- 🔒 **Type-Safe**: Full TypeScript support with Zod schema validation
- 🚀 **Schema-Driven**: Define your database structure using Zod schemas
- 🔄 **Automatic Migrations**: Generate PocketBase migrations from schema changes
- 👁️ **View Collections**: Define read-only SQL views alongside your regular collections
- 🔍 **Change Detection**: Smart diff engine with destructive change warnings
- ⚙️ **Execution Engine**: Reconstructs current state by *executing* your migrations in a simulated
  PocketBase JSVM — no fragile text parsing, so loops and helper functions are understood
  ([details](docs/EXECUTION_ENGINE.md))
- ✅ **Verification & Linting**: Round-trip `up()`/`down()` before writing, and catch JavaScript
  that PocketBase's goja runtime cannot run
- 📋 **Status Reporting**: Check migration status without generating files, including drift against
  PocketBase's `_migrations` table
- 🛠️ **CLI Tools**: Command-line interface for migration management

## Installation

```bash
npm install pocketbase-zod-schema
# or
yarn add pocketbase-zod-schema
# or
pnpm add pocketbase-zod-schema
```

## Quick Start

### 1. Define Your Schemas

```typescript
// src/schema/post.ts
import { z } from 'zod';
import {
  defineCollection,
  TextField,
  EditorField,
  BoolField,
  SelectField,
  RelationField,
  RelationsField,
} from 'pocketbase-zod-schema/schema';

// Define the Zod schema with field helpers
const PostSchema = z.object({
  title: TextField({ min: 1, max: 200 }),
  slug: TextField({ pattern: /^[a-z0-9-]+$/ }),
  content: EditorField(),
  published: BoolField(),
  status: SelectField(['draft', 'published', 'archived']),
  
  // Relations
  author: RelationField({ collection: 'users' }),
  tags: RelationsField({ collection: 'tags', maxSelect: 10 }),
});

// Define the collection with permissions
export const PostCollection = defineCollection({
  collectionName: 'posts',
  schema: PostSchema,
  permissions: {
    listRule: 'published = true || author = @request.auth.id',
    viewRule: 'published = true || author = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: 'author = @request.auth.id',
    deleteRule: 'author = @request.auth.id',
  },
});
```

### 2. Generate Migrations

```bash
# Generate migrations from schema changes
npx pocketbase-migrate generate

# Check migration status without generating files
npx pocketbase-migrate status

# Force generation even with destructive changes
npx pocketbase-migrate generate --force
```

### 3. Generate TypeScript Types

Generate type-safe TypeScript definitions from your schemas:

```bash
# Generate types to pocketbase-types.ts
npx pocketbase-migrate generate-types

# Or specify a custom output path
npx pocketbase-migrate generate-types --output ./src/types/pocketbase.ts
```

This creates a `pocketbase-types.ts` file with:
- Type-safe record interfaces for each collection
- Response types with expand support
- A `TypedPocketBase` interface for type-safe PocketBase client usage

**Usage:**

```typescript
import PocketBase from "pocketbase";
import { TypedPocketBase } from "./pocketbase-types";

const pb = new PocketBase("http://localhost:8090") as TypedPocketBase;

// Full type safety with autocomplete!
const post = await pb.collection("posts").getOne("post-id");
```

### 4. Apply Migrations

```bash
./pocketbase migrate up
```

PocketBase also applies pending migrations on `serve`, so restarting the server is enough in
development.

## CLI Commands

Global options, available on every command:

```
  -c, --config <path>    Configuration file path
  -v, --version          Print the version   ← note: -v is version, not verbose
      --verbose          Enable verbose logging
      --quiet            Suppress non-essential output
      --no-color         Disable colored output
```

### `generate`

Generate PocketBase migrations from schema changes. One file is written per collection operation.

```bash
pocketbase-migrate generate [filters...] [options]

Arguments:
  filters                   Restrict the diff to matching collection or field names (regex supported)

Options:
  -o, --output <directory>  Output directory for migration files
  -f, --force               Force generation even with destructive changes or duplicates
  --dry-run                 Show what would be generated without writing files
  --schema-dir <directory>  Directory containing Zod schema files
  --verify                  Execute up() and down() before writing; refuse migrations that
                            do not roll back cleanly
  --no-verify               Skip verification even when enabled in the config file
```

### `status`

Check migration status without generating files.

```bash
pocketbase-migrate status [options]

Options:
  --schema-dir <directory>  Directory containing Zod schema files
  --json                    Output status as JSON
  --verify                  Compare files on disk against PocketBase's _migrations table
                            and exit non-zero on any drift
  --pb-data <path>          PocketBase data directory or data.db file
                            (defaults to pb_data next to the migrations directory)
```

`--verify` needs Node >= 22.5, since it reads the database with `node:sqlite`.

### `lint`

Check migration files for JavaScript that runs in Node but not in PocketBase's goja runtime —
`require`, `process`, `fetch`, `setTimeout`, `async`/`await`, `import`/`export`, class fields.
Exits non-zero on any error-severity finding.

```bash
pocketbase-migrate lint [files...] [options]

Options:
  -o, --output <directory>  Directory containing migration files
  --no-execute              Static checks only, skipping stubbed-API warnings
```

### `generate-types`

Generate TypeScript definitions from your Zod schemas. This creates a `pocketbase-types.ts` file with type-safe interfaces for all your collections.

```bash
pocketbase-migrate generate-types [options]

Options:
  -o, --output <path>       Output file path (default: pocketbase-types.ts)
  --schema-dir <directory>  Directory containing Zod schema files
```

**Example:**

```bash
# Generate types to the default location (pocketbase-types.ts)
npx pocketbase-migrate generate-types

# Generate types to a custom location
npx pocketbase-migrate generate-types --output ./src/types/pocketbase.ts
```

The generated file includes:
- Type-safe record interfaces for each collection
- Response types with expand support
- A `TypedPocketBase` interface for type-safe PocketBase client usage

**Usage in your application:**

```typescript
import { TypedPocketBase } from "./pocketbase-types";

const pb = new PocketBase("http://localhost:8090") as TypedPocketBase;

// Now you get full type safety!
const post = await pb.collection("posts").getOne("post-id");
// post is typed as PostsResponse with full autocomplete
```

## Configuration

Create a `pocketbase-migrate.config.js` file:

```javascript
export default {
  schema: {
    directory: './src/schema',
    exclude: ['*.test.ts', '*.spec.ts', 'base.ts', 'index.ts']
  },
  migrations: {
    directory: './pocketbase/pb_migrations',
    verify: false,        // round-trip up()/down() before writing
    dataDirectory: ''     // '' = pb_data next to the migrations directory
  },
  diff: {
    warnOnDelete: true,
    requireForceForDestructive: true
  },
  typeGen: {
    outPath: 'pocketbase-types.ts'
  }
};
```

There is no snapshot file to configure. The current database state is reconstructed by
**executing** the migration files in the migrations directory — the newest
`*_collections_snapshot.js` plus everything after it. Every option is documented in
[docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Schema Definition

### Field Helpers

The library provides explicit field helper functions for all PocketBase field types:

```typescript
import {
  BoolField,
  NumberField,
  TextField,
  EmailField,
  URLField,
  EditorField,
  DateField,
  AutodateField,
  SelectField,
  FileField,
  FilesField,
  JSONField,
  GeoPointField,
  RelationField,
  RelationsField,
} from 'pocketbase-zod-schema/schema';
```

**Available Field Helpers:**

| Field Helper | PocketBase Type | Example |
|--------------|-----------------|---------|
| `BoolField()` | bool | `active: BoolField()` |
| `NumberField(options?)` | number | `price: NumberField({ min: 0 })` |
| `TextField(options?)` | text | `name: TextField({ min: 1, max: 200 })` |
| `EmailField()` | email | `email: EmailField()` |
| `URLField()` | url | `website: URLField()` |
| `EditorField()` | editor | `content: EditorField()` |
| `DateField(options?)` | date | `birthdate: DateField()` |
| `AutodateField(options?)` | autodate | `createdAt: AutodateField({ onCreate: true })` |
| `SelectField(values, options?)` | select | `status: SelectField(['draft', 'published'])` |
| `FileField(options?)` | file | `avatar: FileField({ mimeTypes: ['image/*'] })` |
| `FilesField(options?)` | file | `images: FilesField({ maxSelect: 5 })` |
| `JSONField(schema?, options?)` | json | `metadata: JSONField({ maxSize: '5M' })` |
| `GeoPointField()` | geoPoint | `location: GeoPointField()` |
| `RelationField(config)` | relation | `author: RelationField({ collection: 'users' })` |
| `RelationsField(config)` | relation | `tags: RelationsField({ collection: 'tags' })` |

### Defining Collections

Use `defineCollection()` to create collections with schema, permissions, and indexes:

```typescript
import { z } from 'zod';
import {
  defineCollection,
  TextField,
  NumberField,
  BoolField,
  FileField,
  RelationField,
} from 'pocketbase-zod-schema/schema';

const ProductSchema = z.object({
  name: TextField({ min: 1, max: 200 }),
  sku: TextField({ autogeneratePattern: '[A-Z]{3}-[0-9]{6}' }),
  price: NumberField({ min: 0 }),
  quantity: NumberField({ min: 0, noDecimal: true }),
  active: BoolField(),
  thumbnail: FileField({ 
    mimeTypes: ['image/*'], 
    maxSize: 5242880 // 5MB
  }),
  vendor: RelationField({ collection: 'vendors' }),
});

export const ProductCollection = defineCollection({
  collectionName: 'products',
  schema: ProductSchema,
  permissions: {
    listRule: '',
    viewRule: '',
    createRule: '@request.auth.id != ""',
    updateRule: 'vendor.owner = @request.auth.id',
    deleteRule: 'vendor.owner = @request.auth.id',
  },
  indexes: [
    'CREATE INDEX idx_products_vendor ON products (vendor)',
    'CREATE INDEX idx_products_sku ON products (sku)',
  ],
});
```

### Defining View Collections

Use `defineView()` for read-only [view collections](docs/VIEW_COLLECTIONS.md) backed by a SQL
query. PocketBase runs the query and derives the collection's fields from it, so the Zod schema
describes the row shape for TypeScript only:

```typescript
import { z } from 'zod';
import { baseSchema, defineView, sql } from 'pocketbase-zod-schema/schema';

const ProductStatsSchema = z
  .object({
    vendor: z.string(),
    productCount: z.number(),
  })
  .extend(baseSchema);

export default defineView({
  collectionName: 'ProductStats',
  schema: ProductStatsSchema,
  viewQuery: sql`
    SELECT p.vendor AS id,
           p.vendor AS vendor,
           COUNT(*) AS productCount
      FROM products p
     GROUP BY p.vendor
  `,
  permissions: {
    listRule: 'vendor.owner = @request.auth.id',
    viewRule: 'vendor.owner = @request.auth.id',
  },
});
```

Views are read-only, so `defineView()` accepts only `listRule` and `viewRule`, and rejects
indexes. Editing the SQL produces an in-place update migration that keeps the collection id
stable. Re-indenting the query produces no migration at all. See
[docs/VIEW_COLLECTIONS.md](docs/VIEW_COLLECTIONS.md) for the rules PocketBase places on view
queries.

### Permission Templates

Use permission templates for common access patterns:

```typescript
export const PostCollection = defineCollection({
  collectionName: 'posts',
  schema: PostSchema,
  permissions: {
    template: 'owner-only',
    ownerField: 'author',
    customRules: {
      listRule: 'published = true || author = @request.auth.id',
      viewRule: 'published = true || author = @request.auth.id',
    },
  },
});
```

**Available Templates:**
- `"public"` - All operations are public
- `"authenticated"` - All operations require authentication
- `"owner-only"` - Only the owner can perform operations (uses `ownerField`, default `"User"`)
- `"admin-only"` - Requires `@request.auth.<roleField> = "admin"` (default `roleField` is `"role"`)
- `"read-public"` - Public read, authenticated write
- `"custom"` - No base rules; `customRules` supplies everything

`PermissionTemplates.locked()` (superusers only) and `PermissionTemplates.readOnlyAuthenticated()`
have no template name — call them directly and pass the result as `permissions`. See
[docs/PERMISSIONS_USAGE.md](docs/PERMISSIONS_USAGE.md).

## Programmatic Usage

```typescript
import {
  parseSchemaFiles,
  compare,
  generate,
  loadSnapshotWithMigrations,
} from 'pocketbase-zod-schema/migration';

const migrationsDir = './pocketbase/pb_migrations';

// Analyze schemas
const currentSchema = await parseSchemaFiles('./src/schema');

// Reconstruct the current database state by executing the existing migrations
const previousSnapshot = loadSnapshotWithMigrations({
  migrationsPath: migrationsDir
});

// Generate diff
const diff = compare(currentSchema, previousSnapshot);

// Write one migration file per collection operation; returns the paths written
const migrationPaths = generate(diff, migrationsDir);
```

Use `loadSnapshotWithMigrations`, not `loadSnapshotIfExists` — the latter executes only the
snapshot file and ignores every migration after it, which is almost never the current state. Full
API in [docs/API.md](docs/API.md).

## Complete Example

Here's a complete example showing all major features:

```typescript
// src/schema/blog.ts
import { z } from 'zod';
import {
  defineCollection,
  TextField,
  EditorField,
  BoolField,
  DateField,
  AutodateField,
  SelectField,
  FileField,
  RelationField,
  RelationsField,
} from 'pocketbase-zod-schema/schema';

// Blog post collection
const PostSchema = z.object({
  // Text fields
  title: TextField({ min: 1, max: 200 }),
  slug: TextField({ pattern: /^[a-z0-9-]+$/ }),
  excerpt: TextField({ max: 500 }).optional(),
  content: EditorField(),
  
  // Boolean and select fields
  published: BoolField(),
  status: SelectField(['draft', 'review', 'published', 'archived']),
  
  // Date fields
  publishedAt: DateField().optional(),
  createdAt: AutodateField({ onCreate: true }),
  updatedAt: AutodateField({ onUpdate: true }),
  
  // File field
  featuredImage: FileField({ 
    mimeTypes: ['image/*'],
    maxSize: 5242880, // 5MB
    thumbs: ['100x100', '400x300'],
  }).optional(),
  
  // Relations
  author: RelationField({ collection: 'users' }),
  category: RelationField({ collection: 'categories' }),
  tags: RelationsField({ collection: 'tags', maxSelect: 10 }),
});

export const PostCollection = defineCollection({
  collectionName: 'posts',
  schema: PostSchema,
  permissions: {
    listRule: 'published = true || author = @request.auth.id',
    viewRule: 'published = true || author = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: 'author = @request.auth.id',
    deleteRule: 'author = @request.auth.id',
  },
  indexes: [
    'CREATE INDEX idx_posts_author ON posts (author)',
    'CREATE INDEX idx_posts_published ON posts (published)',
    'CREATE INDEX idx_posts_slug ON posts (slug)',
  ],
});

// Category collection
const CategorySchema = z.object({
  name: TextField({ min: 1, max: 100 }),
  slug: TextField({ pattern: /^[a-z0-9-]+$/ }),
  description: TextField({ max: 500 }).optional(),
});

export const CategoryCollection = defineCollection({
  collectionName: 'categories',
  schema: CategorySchema,
  permissions: {
    template: 'public',
    customRules: {
      createRule: '@request.auth.role = "admin"',
      updateRule: '@request.auth.role = "admin"',
      deleteRule: '@request.auth.role = "admin"',
    },
  },
});
```

## Documentation

- [API Reference](docs/API.md) — every exported function, type and CLI flag
- [Execution Engine](docs/EXECUTION_ENGINE.md) — how migrations are read back, verification, goja lint
- [Configuration Guide](docs/CONFIGURATION.md) — config keys, CLI options, environment variables
- [Migration Guide](docs/MIGRATION_GUIDE.md) — adoption, upgrade notes, troubleshooting
- [Type Mapping](docs/TYPE_MAPPING.md) — Zod → PocketBase field rules
- [View Collections](docs/VIEW_COLLECTIONS.md) — read-only SQL-backed collections
- [Naming Conventions](docs/NAMING_CONVENTIONS.md) — files, collections, relation detection
- [Permissions](docs/PERMISSIONS_USAGE.md) — templates and API rules
- [Contributing](docs/CONTRIBUTING.md) · [Release Process](docs/RELEASE.md)

## Development (repo contributors)

This repo is a Yarn workspace / monorepo:

- The **published package** lives in `package/`
- The root `package.json` proxies common commands to that workspace

The root `package.json` also drives a demo host workspace: `package/src/schema/*.ts` doubles as the
library's example schemas *and* the schema directory `pocketbase-migrate.config.js` points at, with
the generated migrations in `pocketbase/pb_migrations/`.

### Setup

```bash
corepack enable
yarn install --immutable
```

### Common commands

```bash
# library (proxied to the package/ workspace)
yarn test          # vitest run
yarn typecheck     # tsc --noEmit
yarn lint          # eslint src --fix
yarn build         # tsup (esm + cjs + dts)
yarn precommit     # lint + typecheck + test

# host workspace (drives the demo schemas in package/src/schema)
yarn db:status                     # preview changes without writing
yarn db:generate                   # schemas -> migration files
yarn db:typegen                    # regenerate pocketbase-types.ts
yarn db:download && yarn db:start  # fetch + run PocketBase (applies migrations on start)
yarn db:stop

# end-to-end against a real PocketBase binary (slow)
yarn test:e2e
```

Requires Node 20+; `status --verify` additionally needs Node 22.5+ for `node:sqlite`.

## Deployment / Release (maintainers)

Releases are automated with [Release Please](https://github.com/googleapis/release-please).

- **Release PRs**: A push/merge to `main` will prompt Release Please to open/update a release PR based on Conventional Commits.
- **Publishing**: When the release PR is merged, GitHub Actions creates the GitHub release/tag and publishes to NPM.

### Requirements

- **Conventional Commits**: use `feat:`, `fix:`, `perf:`, etc. (see `docs/RELEASE.md`)
- **npm trusted publishing**: the publish job authenticates with OIDC (`id-token: write`), not a
  token. Configure this package as a trusted publisher on npmjs.com, pointing at this repository
  and `release.yml`. There is no `NPM_TOKEN` secret in the CI publish path.

### Manual publish (emergency)

If CI publishing is blocked:

```bash
yarn publish:npm    # runs `npm publish --access public` in package/
```

This needs a local `npm login` (or `NPM_TOKEN` in your environment) — OIDC only works inside GitHub
Actions. The root workspace is private, so publishing must happen from `package/`.

### Files that control releases

- `release-please-config.json`: release configuration (changelog sections, package path, etc.)
- `.release-please-manifest.json`: last released versions (manifest mode)
- `.github/workflows/release.yml`: runs release-please + publishes to NPM

## Contributing

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for development setup and guidelines.

## License

MIT © [dastron](https://github.com/dastron)

## Changelog

See [package/CHANGELOG.md](package/CHANGELOG.md) for release history.
