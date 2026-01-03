# PocketBase Zod Migration

[![npm version](https://badge.fury.io/js/pocketbase-zod-schema.svg)](https://badge.fury.io/js/pocketbase-zod-schema)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

A TypeScript-first migration generator for PocketBase that uses Zod schemas to create type-safe database migrations.

## Features

- 🔒 **Type-Safe**: Full TypeScript support with Zod schema validation
- 🚀 **Schema-Driven**: Define your database structure using Zod schemas
- 🔄 **Automatic Migrations**: Generate PocketBase migrations from schema changes
- 🔍 **Change Detection**: Smart diff engine with destructive change warnings
- 📋 **Status Reporting**: Check migration status without generating files
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

### 3. Apply Migrations

```bash
./pocketbase migrate
```

## CLI Commands

### `generate`

Generate PocketBase migrations from schema changes.

```bash
pocketbase-migrate generate [options]

Options:
  -c, --config <path>     Configuration file path
  -f, --force            Force generation even with destructive changes
  -v, --verbose          Enable verbose logging
  --dry-run              Show what would be generated without writing files
```

### `status`

Check migration status without generating files.

```bash
pocketbase-migrate status [options]

Options:
  -c, --config <path>     Configuration file path
  -v, --verbose          Enable verbose logging
```

## Configuration

Create a `pocketbase-migrate.config.js` file:

```javascript
export default {
  schema: {
    directory: './src/schema',
    exclude: ['*.test.ts', '*.spec.ts']
  },
  migrations: {
    directory: './pocketbase/pb_migrations',
    format: 'js'
  },
  diff: {
    warnOnDelete: true,
    requireForceForDestructive: true
  }
};
```

Snapshots are automatically managed within the migrations directory - no separate configuration needed.

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
| `JSONField(schema?)` | json | `metadata: JSONField()` |
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
- `"owner-only"` - Only the owner can perform operations

## Programmatic Usage

```typescript
import { 
  parseSchemaFiles,
  compare,
  generate,
  loadSnapshotIfExists 
} from 'pocketbase-zod-schema/migration';

const migrationsDir = './pocketbase/pb_migrations';

// Analyze schemas
const currentSchema = await parseSchemaFiles('./src/schema');

// Load previous snapshot from migrations directory
const previousSnapshot = loadSnapshotIfExists({
  migrationsPath: migrationsDir
});

// Generate diff
const diff = compare(currentSchema, previousSnapshot);

// Generate migration (includes snapshot)
const migrationPath = generate(diff, migrationsDir);
```

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

- [API Reference](docs/API.md)
- [Configuration Guide](docs/CONFIGURATION.md)
- [Migration Guide](docs/MIGRATION_GUIDE.md)
- [Type Mapping](docs/TYPE_MAPPING.md)
- [Naming Conventions](docs/NAMING_CONVENTIONS.md)

## Development (repo contributors)

This repo is a Yarn workspace / monorepo:

- The **published package** lives in `package/`
- The root `package.json` proxies common commands to that workspace

### Setup

```bash
corepack enable
yarn install --immutable
```

### Common commands

```bash
# run tests
yarn test

# typecheck
yarn typecheck

# lint
yarn lint

# build
yarn build

# watch/dev mode (if configured)
yarn dev
```

## Deployment / Release (maintainers)

Releases are automated with [Release Please](https://github.com/googleapis/release-please).

- **Release PRs**: A push/merge to `main` will prompt Release Please to open/update a release PR based on Conventional Commits.
- **Publishing**: When the release PR is merged, GitHub Actions creates the GitHub release/tag and publishes to NPM.

### Requirements

- **Conventional Commits**: use `feat:`, `fix:`, `perf:`, etc. (see `docs/RELEASE.md`)
- **NPM token**: repo secret `NPM_TOKEN` must be set for publishing

### Manual publish (emergency)

If CI publishing is blocked and you need to publish manually, use the **same command as CI**. It only requires `NPM_TOKEN`:

```bash
export NPM_TOKEN="***"
yarn publish:npm
```

### Files that control releases

- `release-please-config.json`: release configuration (changelog sections, package path, etc.)
- `.release-please-manifest.json`: last released versions (manifest mode)
- `.github/workflows/release.yml`: runs release-please + publishes to NPM

## Contributing

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for development setup and guidelines.

## License

MIT © [dastron](https://github.com/dastron)

## Changelog

See [CHANGELOG.md](docs/CHANGELOG.md) for release history.
