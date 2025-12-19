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
// src/schema/user.ts
import { z } from 'zod';
import { baseSchema, withPermissions } from 'pocketbase-zod-schema/schema';

export const UserInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format"),
  avatar: z.string().optional(),
  role: z.enum(['user', 'admin']).default('user'),
});

export const UserSchema = withPermissions(
  baseSchema.extend(UserInputSchema.shape),
  {
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '',
    updateRule: '@request.auth.id = id',
    deleteRule: '@request.auth.id = id',
  }
);
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

## Schema Utilities

### Base Schema Patterns

```typescript
import { baseSchema, baseImageFileSchema } from 'pocketbase-zod-schema/schema';

// Basic collection with standard PocketBase fields
const MySchema = baseSchema.extend({
  title: z.string(),
  content: z.string(),
});
```

### Permission Templates

```typescript
import { withPermissions } from 'pocketbase-zod-schema/schema';

const PrivateSchema = withPermissions(MySchema, {
  listRule: '@request.auth.id != "" && author = @request.auth.id',
  viewRule: '@request.auth.id != "" && author = @request.auth.id',
  createRule: '@request.auth.id != ""',
  updateRule: '@request.auth.id != "" && author = @request.auth.id',
  deleteRule: '@request.auth.id != "" && author = @request.auth.id',
});
```

### Relation Fields

```typescript
// Single relation
const PostSchema = z.object({
  title: z.string(),
  author: z.string(), // Single relation to users collection
});

// Multiple relations
const PostSchema = z.object({
  title: z.string(),
  tags: z.array(z.string()), // Multiple relation to tags collection
});
```

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
