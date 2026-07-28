# Test Helpers

This directory contains helper utilities for the migration test suite.

## Implemented Helpers

### migration-executor.ts

Reads migrations by **executing** them — the only way to know what a migration
actually does, since loops, helper functions and computed values do not exist
until the code has run. This is how tests reconstruct state.

**Functions:**

- `executeMigrationFiles(files, options)` / `executeMigrationSources(sources, options)` -
  execute in order and report `{ snapshot, store, created, updated, deleted, warnings }`,
  where `created`/`updated`/`deleted` are a before/after diff of the store
- `snapshotFromMigrationFiles(files)` / `snapshotFromMigrationSources(sources)` -
  just the resulting `SchemaSnapshot`
- `createBaselineStore(options)` - the prior state a migration runs against
  (`baseline` raw collections, `baselineFiles`, `baselineSources`)
- `requireCollection(snapshot, name)` - lookup that throws instead of returning
  `undefined`, so a typo cannot silently pass

An update migration reaches for `app.findCollectionByNameOrId(...)`, which
throws when the collection is absent — give it a `baseline` or `baselineFiles`.

### migration-parser.ts

Parses PocketBase migration JavaScript files into structured data, for asserting
on what the generator **wrote** (emitted field literals, operation calls, the
up/down closure shapes). It reads syntax, not behavior — never use it to
reconstruct state; use `migration-executor.ts` for that.

**Functions:**

- `parseMigrationFile(filePath: string): ParsedMigration` - Parse complete migration file
- `parseCollectionDefinition(code: string): ParsedCollection` - Extract collection schema from JSON
- `extractOperations(code: string): MigrationOperation[]` - Identify migration operations (addAt, removeById, etc.)

**Implementation Details:**

- Uses `@babel/parser` for AST-based parsing of JavaScript migration files
- Extracts both up and down functions from migrate() calls
- Identifies collection creation, field operations, and rule updates
- Handles Collection and Field constructor calls

### schema-builder.ts

Programmatically builds schema definitions for testing with a fluent API.

**Classes:**

- `SchemaBuilder` - Main builder for creating test schemas with multiple collections
- `CollectionBuilder` - Builder for individual collection schemas with fluent API

**Convenience Methods:**

- `addTextField()` - Add text fields with min/max/pattern options
- `addNumberField()` - Add number fields with min/max/onlyInt options
- `addBoolField()` - Add boolean fields
- `addEmailField()` - Add email fields with domain restrictions
- `addUrlField()` - Add URL fields with domain restrictions
- `addDateField()` - Add date fields with min/max constraints
- `addSelectField()` - Add select fields with values and maxSelect
- `addFileField()` - Add file fields with size/mime/thumbs options
- `addRelationField()` - Add relation fields with cascade options
- `addJsonField()` - Add JSON fields with maxSize
- `addIndex()` - Add index SQL statements
- `setPermissions()` - Set collection permissions/rules

**Example Usage:**

```typescript
const schema = new SchemaBuilder()
  .addCollection("posts", "base")
  .addTextField("title", { required: true, max: 200 })
  .addRelationField("author", "users", { cascadeDelete: true })
  .setPermissions({ listRule: "", createRule: '@request.auth.id != ""' })
  .build()
  .build();
```

### diff-matcher.ts

Compares generated migrations with reference migrations and provides detailed diffs.

**Functions:**

- `compareMigrations(generated, reference): MigrationComparison` - Compare complete migrations
- `compareCollections(generated, reference): Difference[]` - Compare collection definitions
- `compareFields(generated, reference): Difference[]` - Compare field arrays
- `formatDifferences(differences): string` - Format differences for display

**Features:**

- Semantic comparison with whitespace normalization
- Path-based difference tracking (e.g., "upFunction.collections[0].fields[1].type")
- Severity levels: critical, warning, info
- Deep equality checking for nested objects and arrays
- Index SQL normalization for comparison
- Detailed error messages with expected vs actual values

## Usage

These helpers are used by integration tests to:

1. Parse reference migrations into comparable structures
2. Build test schema definitions programmatically
3. Compare generated output against expected output
4. Generate detailed diff reports for test failures

## Testing

Run the helper tests:

```bash
npm test -- helpers.test.ts --run
```

All helpers are fully tested and verified to work correctly.
