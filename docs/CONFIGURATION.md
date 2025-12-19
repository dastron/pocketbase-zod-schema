# Migration Configuration Reference

This document describes all configuration options available for the schema-driven migration system.

## Configuration File

The migration system can be configured using a `pocketbase-migrate.config.js` file.

### Default Configuration

If no configuration file is present, the system uses these defaults:

```javascript
// pocketbase-migrate.config.js (default values)
export default {
  schema: {
    directory: 'src/schema',
    exclude: ['base.ts', 'index.ts', 'permissions.ts', 'permission-templates.ts'],
  },
  migrations: {
    directory: 'pocketbase/pb_migrations',
    format: 'timestamp_description',
  },
  diff: {
    warnOnDelete: true,
    requireForceForDestructive: true,
  },
};
```

## Configuration Options

### schema

Configuration for schema file discovery and parsing.

#### schema.directory

**Type:** `string`  
**Default:** `'src/schema'`  
**Description:** Directory containing Zod schema files

#### schema.exclude

**Type:** `string[]`  
**Default:** `['base.ts', 'index.ts', 'permissions.ts', 'permission-templates.ts']`  
**Description:** Files to exclude from schema parsing

### migrations

Configuration for migration file generation.

#### migrations.directory

**Type:** `string`  
**Default:** `'pocketbase/pb_migrations'`  
**Description:** Directory where migration files are written. Snapshots are automatically stored in this directory.

#### migrations.format

**Type:** `string`  
**Default:** `'timestamp_description'`  
**Description:** Format for migration filenames

**Supported formats:**
- `'timestamp_description'` - `[timestamp]_[description].js` (recommended)
- `'timestamp'` - `[timestamp].js` (minimal)

### diff

Configuration for schema comparison and change detection.

#### diff.warnOnDelete

**Type:** `boolean`  
**Default:** `true`  
**Description:** Show warnings for destructive operations (field/collection deletion)

#### diff.requireForceForDestructive

**Type:** `boolean`  
**Default:** `true`  
**Description:** Require `--force` flag for destructive changes

**Destructive changes include:**
- Deleting collections
- Deleting fields
- Changing field types (may cause data loss)
- Reducing field size constraints

## Snapshot Management

Snapshots are automatically managed within the migrations directory. The system:

1. Looks for the most recent `*_collections_snapshot.js` file in the migrations directory
2. Uses this as the baseline for detecting schema changes
3. Generates new snapshot migrations when changes are detected

No separate snapshot configuration is needed.

## CLI Options

CLI options override configuration file settings.

### Global Options

```bash
pocketbase-migrate generate [options]
```

#### --output, -o

**Type:** `string`  
**Description:** Override migrations output directory

```bash
pocketbase-migrate generate --output ./custom/migrations
```

#### --force, -f

**Type:** `boolean`  
**Description:** Skip confirmation for destructive changes

```bash
pocketbase-migrate generate --force
```

#### --schema-dir

**Type:** `string`  
**Description:** Override schema directory

```bash
pocketbase-migrate generate --schema-dir ./src/models
```

## Environment Variables

```bash
# Override schema directory
MIGRATION_SCHEMA_DIR=src/models

# Override schema exclude patterns (comma-separated)
MIGRATION_SCHEMA_EXCLUDE=base.ts,index.ts,helpers.ts

# Override migration directory
MIGRATION_OUTPUT_DIR=database/migrations

# Skip force requirement
MIGRATION_REQUIRE_FORCE=false
```

## Complete Configuration Example

```javascript
// pocketbase-migrate.config.js
export default {
  schema: {
    directory: 'src/schema',
    exclude: [
      'base.ts',
      'index.ts',
      'permissions.ts',
      '*.test.ts',
    ],
  },
  migrations: {
    directory: process.env.MIGRATION_DIR || 'pocketbase/pb_migrations',
    format: 'timestamp_description',
  },
  diff: {
    warnOnDelete: process.env.NODE_ENV === 'production',
    requireForceForDestructive: process.env.NODE_ENV === 'production',
  },
};
```

## Best Practices

### Version Control

✅ **DO:**
- Commit configuration file
- Commit migration files (including snapshots)
- Use consistent paths across team

❌ **DON'T:**
- Use absolute paths
- Change configuration frequently
- Use different configs per developer

### Safety

✅ **DO:**
- Enable warnings in production
- Require force for destructive changes
- Review generated migrations before applying

❌ **DON'T:**
- Disable all safety features
- Use force flag by default
- Skip migration review

## See Also

- [Migration Guide](./MIGRATION_GUIDE.md) - Complete migration documentation
- [Type Mapping Reference](./TYPE_MAPPING.md) - Type conversion rules
- [Naming Conventions](./NAMING_CONVENTIONS.md) - Naming guidelines
