# PocketBase Zod Migration

[![npm version](https://badge.fury.io/js/pocketbase-zod-schema.svg)](https://badge.fury.io/js/pocketbase-zod-schema)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

A powerful TypeScript-first migration generator for PocketBase that uses Zod schemas to create type-safe database migrations. Transform your schema definitions into PocketBase migrations automatically while maintaining full type safety across your application.

## Features

- 🔒 **Type-Safe**: Full TypeScript support with Zod schema validation
- 🚀 **Schema-Driven**: Define your database structure using Zod schemas
- 🔄 **Automatic Migrations**: Generate PocketBase migrations from schema changes
- 🌳 **Tree-Shakeable**: Modular exports for optimal bundle sizes
- 🛠️ **CLI Tools**: Command-line interface for migration management
- 📦 **Optional Utilities**: Type generation and data mutators
- 🔍 **Change Detection**: Smart diff engine with destructive change warnings
- 📊 **Status Reporting**: Check migration status without generating files

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

Create your PocketBase collections using Zod schemas:

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

### 2. Configure Migration Settings

Create a configuration file (optional):

```javascript
// pocketbase-migrate.config.js
export default {
  schema: {
    directory: './src/schema',
    exclude: ['*.test.ts', '*.spec.ts']
  },
  migrations: {
    directory: './pocketbase/pb_migrations',
    format: 'js'
  },
  snapshot: {
    path: './.migration-snapshot.json'
  },
  diff: {
    warnOnDelete: true,
    requireForceForDestructive: true
  }
};
```

### 3. Generate Migrations

Use the CLI to generate migrations:

```bash
# Generate migrations from schema changes
npx pocketbase-migrate generate

# Check migration status without generating files
npx pocketbase-migrate status

# Force generation even with destructive changes
npx pocketbase-migrate generate --force
```

### 4. Apply Migrations

Apply the generated migrations to your PocketBase instance:

```bash
# Start PocketBase and apply migrations
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

The migration tool supports multiple configuration formats:

### JavaScript Configuration

```javascript
// pocketbase-migrate.config.js
export default {
  schema: {
    directory: './src/schema',
    exclude: ['*.test.ts', '*.spec.ts']
  },
  migrations: {
    directory: './pocketbase/pb_migrations',
    format: 'js'
  },
  snapshot: {
    path: './.migration-snapshot.json',
    basePath: './pocketbase/pb_migrations'
  },
  diff: {
    warnOnDelete: true,
    requireForceForDestructive: true
  }
};
```

### JSON Configuration

```json
{
  "schema": {
    "directory": "./src/schema",
    "exclude": ["*.test.ts", "*.spec.ts"]
  },
  "migrations": {
    "directory": "./pocketbase/pb_migrations",
    "format": "js"
  },
  "snapshot": {
    "path": "./.migration-snapshot.json"
  },
  "diff": {
    "warnOnDelete": true,
    "requireForceForDestructive": true
  }
}
```

## Schema Utilities

### Base Schema Patterns

```typescript
import { baseSchema, baseImageFileSchema } from 'pocketbase-zod-schema/schema';

// Basic collection with standard PocketBase fields
const MySchema = baseSchema.extend({
  title: z.string(),
  content: z.string(),
});

// Collection with image file support
const PostSchema = baseImageFileSchema.extend({
  title: z.string(),
  image: z.string(), // File field for images
});
```

### Permission Templates

```typescript
import { withPermissions } from 'pocketbase-zod-schema/schema';

// Owner-only access
const PrivateSchema = withPermissions(MySchema, {
  listRule: '@request.auth.id != "" && author = @request.auth.id',
  viewRule: '@request.auth.id != "" && author = @request.auth.id',
  createRule: '@request.auth.id != ""',
  updateRule: '@request.auth.id != "" && author = @request.auth.id',
  deleteRule: '@request.auth.id != "" && author = @request.auth.id',
});

// Public read, authenticated write
const PublicSchema = withPermissions(MySchema, {
  listRule: '',
  viewRule: '',
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

### Migration Generation

```typescript
import { 
  SchemaAnalyzer, 
  DiffEngine, 
  MigrationGenerator,
  SnapshotManager 
} from 'pocketbase-zod-schema/migration';

// Analyze schemas
const analyzer = new SchemaAnalyzer();
const schemas = await analyzer.parseSchemaFiles('./src/schema');

// Load previous snapshot
const snapshotManager = new SnapshotManager();
const previousSnapshot = snapshotManager.loadSnapshotIfExists({
  path: './.migration-snapshot.json'
});

// Generate diff
const diffEngine = new DiffEngine();
const diff = diffEngine.compare(schemas, previousSnapshot);

// Generate migration
const generator = new MigrationGenerator();
const migrationPath = generator.generate(diff, './pocketbase/pb_migrations');

// Save new snapshot
snapshotManager.saveSnapshot(schemas, {
  path: './.migration-snapshot.json'
});
```

### Type Generation (Optional)

```typescript
import { generateTypes } from 'pocketbase-zod-schema/types';

const types = generateTypes(schemas, {
  outputDir: './src/types',
  fileNaming: 'kebab-case',
  includeInputTypes: true,
  includeDatabaseTypes: true,
  includeTypedPocketBase: true
});
```

### Data Mutators (Optional)

```typescript
import { createMutator } from 'pocketbase-zod-schema/mutator';

const userMutator = createMutator(UserSchema);

// Type-safe operations
const user = await userMutator.create({
  name: 'John Doe',
  email: 'john@example.com',
  role: 'user'
});

const updatedUser = await userMutator.update(user.id, {
  name: 'Jane Doe'
});
```

## Advanced Usage

### Custom Field Types

```typescript
import { z } from 'zod';

// JSON field
const ConfigSchema = z.object({
  settings: z.record(z.any()), // JSON field
});

// File field with validation
const DocumentSchema = z.object({
  file: z.string().refine(
    (val) => val.endsWith('.pdf'),
    'Only PDF files allowed'
  ),
});

// Relation with constraints
const PostSchema = z.object({
  author: z.string().min(1), // Required relation
  tags: z.array(z.string()).min(1).max(5), // 1-5 tags required
});
```

### Migration Hooks

```typescript
// Custom migration generation
const generator = new MigrationGenerator({
  beforeGenerate: (diff) => {
    console.log('Generating migration for:', diff.collectionsToCreate.length, 'new collections');
  },
  afterGenerate: (migrationPath) => {
    console.log('Migration generated at:', migrationPath);
  }
});
```

### Workspace Support

For monorepo setups, configure workspace-relative paths:

```javascript
// pocketbase-migrate.config.js
export default {
  schema: {
    directory: './packages/shared/src/schema',
  },
  migrations: {
    directory: './apps/backend/pocketbase/pb_migrations',
  },
  snapshot: {
    path: './apps/backend/.migration-snapshot.json'
  }
};
```

## Migration Best Practices

### 1. Schema Organization

```
src/schema/
├── index.ts          # Export all schemas
├── base.ts           # Base schema patterns
├── permissions.ts    # Permission templates
├── user.ts           # User collection
├── post.ts           # Post collection
└── tag.ts            # Tag collection
```

### 2. Naming Conventions

- Use `PascalCase` for schema names: `UserSchema`, `PostSchema`
- Use `camelCase` for field names: `firstName`, `createdAt`
- Use descriptive collection names: `users`, `blog_posts`, `user_sessions`

### 3. Migration Safety

- Always review generated migrations before applying
- Use `--dry-run` to preview changes
- Test migrations on development data first
- Keep backups before applying destructive changes

### 4. Version Control

```gitignore
# Include in version control
pocketbase/pb_migrations/
.migration-snapshot.json

# Exclude from version control
pocketbase/pb_data/
```

## Troubleshooting

### Common Issues

**Schema not found:**
```
Error: No schema files found in ./src/schema
```
- Ensure schema files end with `Schema.ts` or `InputSchema.ts`
- Check the configured schema directory path

**Migration conflicts:**
```
Error: Migration timestamp conflicts with existing migration
```
- Wait a moment and regenerate, or manually resolve timestamp conflicts

**Destructive changes blocked:**
```
Warning: Destructive changes detected. Use --force to proceed.
```
- Review the changes carefully
- Use `pocketbase-migrate status` to see what will change
- Add `--force` flag if changes are intentional

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
pocketbase-migrate generate --verbose
```

## API Reference

### Core Classes

- **SchemaAnalyzer**: Parses and analyzes Zod schemas
- **DiffEngine**: Compares schemas and detects changes
- **MigrationGenerator**: Generates PocketBase migration files
- **SnapshotManager**: Manages schema snapshots

### Utility Functions

- **withPermissions**: Adds API rules to schemas
- **baseSchema**: Standard PocketBase fields (id, created, updated)
- **baseImageFileSchema**: Base schema with image file support

### Type Definitions

All types are exported from their respective modules:

```typescript
import type { 
  SchemaDefinition, 
  CollectionSchema, 
  FieldDefinition 
} from 'pocketbase-zod-schema/types';

import type { 
  SchemaDiff, 
  DestructiveChange 
} from 'pocketbase-zod-schema/migration';
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/dastron/pocketbase-zod-schema.git
cd pocketbase-zod-schema

# Install dependencies
yarn install

# Run tests
yarn test

# Build the package
yarn build
```

### Release Process

This project uses [Release Please](https://github.com/googleapis/release-please) for automated releases:

- Releases are automatically created when commits are merged to `main`
- Version bumps are determined by [Conventional Commits](https://www.conventionalcommits.org/)
- Changelog is automatically generated from commit messages
- NPM publishing is automated via GitHub Actions

## License

MIT © [dastron](https://github.com/dastron)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Related Projects

- [PocketBase](https://pocketbase.io/) - Backend-as-a-Service with real-time subscriptions
- [Zod](https://zod.dev/) - TypeScript-first schema validation library
- [TypeScript](https://www.typescriptlang.org/) - Typed JavaScript at scale

---

**Made with ❤️ for the PocketBase community**