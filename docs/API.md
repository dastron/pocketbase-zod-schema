# API Reference

This document provides comprehensive API documentation for the PocketBase Zod Migration package.

## Table of Contents

- [Core Classes](#core-classes)
- [Schema Utilities](#schema-utilities)
- [CLI Commands](#cli-commands)
- [Type Definitions](#type-definitions)
- [Error Classes](#error-classes)
- [Utility Functions](#utility-functions)

## Core Classes

### SchemaAnalyzer

Analyzes and parses Zod schemas from the filesystem.

```typescript
import { SchemaAnalyzer } from 'pocketbase-zod-schema/migration';
```

#### Constructor

```typescript
new SchemaAnalyzer(config?: SchemaAnalyzerConfig)
```

#### Methods

##### `parseSchemaFiles(schemaDir: string): Promise<SchemaDefinition>`

Parses all schema files in the specified directory.

**Parameters:**
- `schemaDir` - Directory containing schema files

**Returns:** Promise resolving to parsed schema definitions

**Throws:** `SchemaParsingError` if parsing fails

##### `discoverSchemaFiles(schemaDir: string): string[]`

Discovers schema files in the directory.

**Parameters:**
- `schemaDir` - Directory to search

**Returns:** Array of schema file paths

##### `convertZodSchemaToCollectionSchema(name: string, schema: z.ZodObject<any>): CollectionSchema`

Converts a Zod schema to PocketBase collection schema.

**Parameters:**
- `name` - Collection name
- `schema` - Zod schema object

**Returns:** PocketBase collection schema

### DiffEngine

Compares schemas and detects changes.

```typescript
import { DiffEngine } from 'pocketbase-zod-schema/migration';
```

#### Constructor

```typescript
new DiffEngine(config?: DiffEngineConfig)
```

#### Methods

##### `compare(current: SchemaDefinition, previous: SchemaSnapshot | null): SchemaDiff`

Compares current schemas against previous snapshot.

**Parameters:**
- `current` - Current schema definitions
- `previous` - Previous schema snapshot (null for initial migration)

**Returns:** Schema differences

##### `detectDestructiveChanges(diff: SchemaDiff): DestructiveChange[]`

Detects potentially destructive changes in the diff.

**Parameters:**
- `diff` - Schema differences

**Returns:** Array of destructive changes

##### `categorizeChangesBySeverity(diff: SchemaDiff): { destructive: string[], nonDestructive: string[] }`

Categorizes changes by severity level.

**Parameters:**
- `diff` - Schema differences

**Returns:** Categorized changes

### MigrationGenerator

Generates PocketBase migration files.

```typescript
import { MigrationGenerator } from 'pocketbase-zod-schema/migration';
```

#### Constructor

```typescript
new MigrationGenerator(config?: MigrationGeneratorConfig)
```

#### Methods

##### `generate(diff: SchemaDiff, outputDir: string): string`

Generates migration file from schema differences.

**Parameters:**
- `diff` - Schema differences
- `outputDir` - Output directory for migration file

**Returns:** Path to generated migration file

**Throws:** `MigrationGenerationError` if generation fails

##### `generateUpMigration(diff: SchemaDiff): string`

Generates the up migration code.

**Parameters:**
- `diff` - Schema differences

**Returns:** Migration code string

##### `generateDownMigration(diff: SchemaDiff): string`

Generates the down migration code.

**Parameters:**
- `diff` - Schema differences

**Returns:** Migration code string

### SnapshotManager

Manages schema snapshots for diff comparison.

```typescript
import { SnapshotManager } from 'pocketbase-zod-schema/migration';
```

#### Methods

##### `loadSnapshot(config: SnapshotConfig): SchemaSnapshot`

Loads schema snapshot from file.

**Parameters:**
- `config` - Snapshot configuration

**Returns:** Schema snapshot

**Throws:** `FileSystemError` if file cannot be read

##### `saveSnapshot(schema: SchemaDefinition, config: SnapshotConfig): void`

Saves schema snapshot to file.

**Parameters:**
- `schema` - Schema definitions to save
- `config` - Snapshot configuration

**Throws:** `FileSystemError` if file cannot be written

##### `loadSnapshotIfExists(config: SnapshotConfig, migrationsPath?: string): SchemaSnapshot | null`

Loads snapshot if it exists, otherwise returns null.

**Parameters:**
- `config` - Snapshot configuration
- `migrationsPath` - Optional migrations directory path

**Returns:** Schema snapshot or null

## Schema Utilities

### Base Schemas

Pre-defined schema patterns for common PocketBase collections.

```typescript
import { baseSchema, baseImageFileSchema } from 'pocketbase-zod-schema/schema';
```

#### `baseSchema`

Standard PocketBase fields (id, created, updated).

```typescript
const MySchema = baseSchema.extend({
  title: z.string(),
  content: z.string(),
});
```

#### `baseImageFileSchema`

Base schema with image file field support.

```typescript
const PostSchema = baseImageFileSchema.extend({
  title: z.string(),
  image: z.string(), // File field
});
```

### Permission Helpers

#### `withPermissions<T>(schema: T, permissions: PermissionSchema): T`

Adds API rules to a schema.

```typescript
import { withPermissions } from 'pocketbase-zod-schema/schema';

const UserSchema = withPermissions(baseSchema.extend({
  name: z.string(),
  email: z.string().email(),
}), {
  listRule: '@request.auth.id != ""',
  viewRule: '@request.auth.id != ""',
  createRule: '',
  updateRule: '@request.auth.id = id',
  deleteRule: '@request.auth.id = id',
});
```

#### `withIndexes<T>(schema: T, indexes: string[]): T`

Adds database indexes to a schema.

```typescript
import { withIndexes } from 'pocketbase-zod-schema/schema';

const UserSchema = withIndexes(MySchema, [
  'CREATE UNIQUE INDEX idx_users_email ON users (email)',
  'CREATE INDEX idx_users_created ON users (created)',
]);
```

### Permission Templates

Pre-defined permission configurations.

```typescript
import { 
  ownerOnlyPermissions,
  publicReadPermissions,
  authenticatedPermissions 
} from 'pocketbase-zod-schema/schema';
```

#### `ownerOnlyPermissions`

Only the record owner can access their records.

#### `publicReadPermissions`

Public read access, authenticated write access.

#### `authenticatedPermissions`

Only authenticated users can access records.

## CLI Commands

### Generate Command

```bash
pocketbase-migrate generate [options]
```

**Options:**
- `-c, --config <path>` - Configuration file path
- `-f, --force` - Force generation even with destructive changes
- `-v, --verbose` - Enable verbose logging
- `--dry-run` - Show what would be generated without writing files

### Status Command

```bash
pocketbase-migrate status [options]
```

**Options:**
- `-c, --config <path>` - Configuration file path
- `-v, --verbose` - Enable verbose logging

## Type Definitions

### Core Types

```typescript
interface SchemaDefinition {
  collections: Map<string, CollectionSchema>;
}

interface CollectionSchema {
  name: string;
  type: "base" | "auth";
  fields: FieldDefinition[];
  indexes?: string[];
  rules?: PermissionSchema;
  permissions?: PermissionSchema;
}

interface FieldDefinition {
  name: string;
  type: PocketBaseFieldType;
  required: boolean;
  unique?: boolean;
  options?: Record<string, any>;
  relation?: RelationConfig;
}

interface RelationConfig {
  collection: string;
  cascadeDelete?: boolean;
  maxSelect?: number;
  minSelect?: number;
}
```

### Migration Types

```typescript
interface SchemaDiff {
  collectionsToCreate: CollectionSchema[];
  collectionsToDelete: CollectionSchema[];
  collectionsToModify: CollectionModification[];
}

interface CollectionModification {
  collection: string;
  fieldsToAdd: FieldDefinition[];
  fieldsToRemove: FieldDefinition[];
  fieldsToModify: FieldModification[];
  indexesToAdd: string[];
  indexesToRemove: string[];
  rulesToUpdate: RuleUpdate[];
  permissionsToUpdate: PermissionChange[];
}

interface DestructiveChange {
  type: 'collection_delete' | 'field_delete' | 'field_type_change' | 'constraint_add';
  collection: string;
  field?: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}
```

### Configuration Types

```typescript
interface MigrationConfig {
  schema: {
    directory: string;
    exclude: string[];
  };
  migrations: {
    directory: string;
    format: string;
  };
  snapshot: {
    path: string;
    basePath?: string;
  };
  diff: {
    warnOnDelete: boolean;
    requireForceForDestructive: boolean;
  };
}
```

## Error Classes

### SchemaParsingError

Thrown when schema parsing fails.

```typescript
class SchemaParsingError extends Error {
  constructor(
    message: string,
    public readonly file?: string,
    public readonly cause?: Error
  );
}
```

### MigrationGenerationError

Thrown when migration generation fails.

```typescript
class MigrationGenerationError extends Error {
  constructor(
    message: string,
    public readonly diff?: SchemaDiff,
    public readonly cause?: Error
  );
}
```

### FileSystemError

Thrown when file system operations fail.

```typescript
class FileSystemError extends Error {
  constructor(
    message: string,
    public readonly path?: string,
    public readonly operation?: string,
    public readonly cause?: Error
  );
}
```

### ConfigurationError

Thrown when configuration is invalid.

```typescript
class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly configPath?: string,
    public readonly cause?: Error
  );
}
```

### ValidationError

Thrown when validation fails.

```typescript
class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: any,
    public readonly cause?: Error
  );
}
```

## Utility Functions

### Type Mapping

```typescript
import { 
  mapZodTypeToPocketBase,
  detectRelationField,
  isFileField 
} from 'pocketbase-zod-schema/migration/utils';
```

#### `mapZodTypeToPocketBase(zodType: z.ZodTypeAny): PocketBaseFieldType`

Maps Zod types to PocketBase field types.

#### `detectRelationField(fieldName: string, zodType: z.ZodTypeAny): RelationConfig | null`

Detects if a field is a relation field.

#### `isFileField(fieldName: string, zodType: z.ZodTypeAny): boolean`

Determines if a field is a file field.

### String Utilities

```typescript
import { pluralize, singularize } from 'pocketbase-zod-schema/migration/utils';
```

#### `pluralize(word: string): string`

Converts singular word to plural.

#### `singularize(word: string): string`

Converts plural word to singular.

### Configuration Loading

```typescript
import { loadConfig } from 'pocketbase-zod-schema/cli';
```

#### `loadConfig(configPath?: string): Promise<MigrationConfig>`

Loads configuration from file or uses defaults.

**Parameters:**
- `configPath` - Optional path to configuration file

**Returns:** Promise resolving to configuration object

### Logging Utilities

```typescript
import { 
  logSuccess,
  logError,
  logWarning,
  logInfo,
  withProgress 
} from 'pocketbase-zod-schema/cli';
```

#### `logSuccess(message: string): void`

Logs success message with green color.

#### `logError(message: string): void`

Logs error message with red color.

#### `logWarning(message: string): void`

Logs warning message with yellow color.

#### `logInfo(message: string): void`

Logs info message with blue color.

#### `withProgress<T>(message: string, fn: () => Promise<T>): Promise<T>`

Wraps async operation with progress indicator.

## Examples

### Basic Usage

```typescript
import { 
  SchemaAnalyzer,
  DiffEngine,
  MigrationGenerator,
  SnapshotManager 
} from 'pocketbase-zod-schema/migration';

// Parse schemas
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

// Check for destructive changes
const destructiveChanges = diffEngine.detectDestructiveChanges(diff);
if (destructiveChanges.length > 0) {
  console.warn('Destructive changes detected:', destructiveChanges);
}

// Generate migration
const generator = new MigrationGenerator();
const migrationPath = generator.generate(diff, './pocketbase/pb_migrations');

// Save new snapshot
snapshotManager.saveSnapshot(schemas, {
  path: './.migration-snapshot.json'
});
```

### Custom Configuration

```typescript
import { SchemaAnalyzer, DiffEngine } from 'pocketbase-zod-schema/migration';

const analyzer = new SchemaAnalyzer({
  excludePatterns: ['*.test.ts', '*.spec.ts'],
  includePatterns: ['*Schema.ts', '*InputSchema.ts']
});

const diffEngine = new DiffEngine({
  warnOnDelete: true,
  requireForceForDestructive: true
});
```

### Error Handling

```typescript
import { 
  SchemaParsingError,
  MigrationGenerationError,
  FileSystemError 
} from 'pocketbase-zod-schema/migration';

try {
  const schemas = await analyzer.parseSchemaFiles('./src/schema');
} catch (error) {
  if (error instanceof SchemaParsingError) {
    console.error(`Schema parsing failed in ${error.file}: ${error.message}`);
  } else if (error instanceof FileSystemError) {
    console.error(`File system error at ${error.path}: ${error.message}`);
  } else {
    console.error('Unexpected error:', error);
  }
}
```