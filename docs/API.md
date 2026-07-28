# API Reference

API documentation for `pocketbase-zod-schema`.

Everything here is verified against the source in `package/src/`. Where a function's behaviour is
subtle (`loadSnapshotIfExists` vs `loadSnapshotWithMigrations`, `generate()`'s return type), the
subtlety is called out rather than smoothed over.

## Table of Contents

- [Entry Points](#entry-points)
- [Schema Definition](#schema-definition)
- [Field Helpers](#field-helpers)
- [Permissions](#permissions)
- [Migration Pipeline](#migration-pipeline)
- [Execution Engine](#execution-engine)
- [CLI Commands](#cli-commands)
- [Type Definitions](#type-definitions)
- [Error Classes](#error-classes)
- [Utility Functions](#utility-functions)
- [Examples](#examples)

## Entry Points

The package is split so the schema half stays browser-safe and the migration half (which needs
`fs`, `path`, `node:vm`) is Node-only.

| Import path | Contents | Environment |
| --- | --- | --- |
| `pocketbase-zod-schema` | enums, mutator, schema helpers | browser-safe |
| `pocketbase-zod-schema/schema` | `defineCollection`, `defineView`, field helpers, permissions | browser-safe |
| `pocketbase-zod-schema/enums` | shared enums | browser-safe |
| `pocketbase-zod-schema/mutator` | data mutation helpers | browser-safe |
| `pocketbase-zod-schema/server` | everything above plus `migration/*` and CLI utilities | Node only |
| `pocketbase-zod-schema/migration` | analyzer, diff, generator, snapshot, engine, errors | Node only |
| `pocketbase-zod-schema/migration/analyzer` | schema parsing only | Node only |
| `pocketbase-zod-schema/migration/diff` | diffing only | Node only |
| `pocketbase-zod-schema/migration/generator` | generation only | Node only |
| `pocketbase-zod-schema/migration/snapshot` | state reconstruction only | Node only |
| `pocketbase-zod-schema/migration/engine` | the JSVM simulation | Node only |
| `pocketbase-zod-schema/migration/utils` | pluralize, type mapping, relation detection | Node only |
| `pocketbase-zod-schema/cli` | `loadConfig`, loggers, `generateMigration`, `getMigrationStatus` | Node only |

## Schema Definition

### `defineCollection(config: CollectionConfig): z.ZodObject<any>`

The primary way to declare a collection. Returns the schema with all collection metadata
serialized into its `.describe()` string — there is no registry, so **`defineCollection()` must
wrap the schema, not the other way round**; calling `.describe()` afterwards overwrites the
metadata.

```typescript
import { z } from "zod";
import { defineCollection, TextField, RelationField } from "pocketbase-zod-schema/schema";

export default defineCollection({
  collectionName: "posts",
  schema: z.object({
    title: TextField({ min: 1, max: 200 }),
    author: RelationField({ collection: "users" }),
  }),
  permissions: { template: "owner-only", ownerField: "author" },
  indexes: ["CREATE INDEX idx_posts_author ON posts (author)"],
});
```

**`CollectionConfig`:**

| Field | Type | Notes |
| --- | --- | --- |
| `collectionName` | `string` (required) | PocketBase collection name |
| `schema` | `z.ZodObject<any>` (required) | The Zod shape |
| `permissions` | `PermissionTemplateConfig \| PermissionSchema` | Template or explicit rules |
| `indexes` | `string[]` | Raw `CREATE INDEX` statements |
| `type` | `"base" \| "auth" \| "view"` | Auto-detected when omitted |
| `viewQuery` | `string` | Required when `type: "view"`; ignored (with a warning) otherwise |

When `type` is omitted, a collection is detected as `auth` only if its fields include **both**
`email` and `password` (case-insensitive); otherwise it is `base`.

### `defineView(config: ViewCollectionConfig): z.ZodObject<any>`

Declares a read-only collection backed by SQL. Equivalent to
`defineCollection({ type: "view", viewQuery })`, but the types reject write rules and indexes at
compile time instead of failing when PocketBase applies the migration.

```typescript
import { z } from "zod";
import { baseSchema, defineView, sql } from "pocketbase-zod-schema/schema";

export default defineView({
  collectionName: "ProjectStats",
  schema: z.object({ OwnerUser: z.string(), projectCount: z.number() }).extend(baseSchema),
  viewQuery: sql`
    SELECT p.OwnerUser AS id,
           p.OwnerUser AS OwnerUser,
           COUNT(*)    AS projectCount
      FROM Projects p
     GROUP BY p.OwnerUser
  `,
  permissions: { listRule: "OwnerUser = @request.auth.id", viewRule: "OwnerUser = @request.auth.id" },
});
```

`permissions` accepts only `listRule` and `viewRule`. PocketBase derives a view's fields by running
the query, so the generated migration contains `viewQuery` and no `fields`/`indexes` array. See
[VIEW_COLLECTIONS.md](./VIEW_COLLECTIONS.md).

### `sql(strings, ...values): string`

Tagged template that interpolates values, strips common leading indentation, and trims blank
leading/trailing lines. Returns a plain string — a normal string literal works too. Re-indenting a
query produces no migration, because queries are compared with whitespace normalized.

### `dedentSql(value: string): string`

The de-indentation half of `sql`, exported for reading a query back out of a migration.

### `validateViewQuery(collectionName: string, viewQuery: unknown): asserts viewQuery is string`

Throws when a view collection has a missing or non-string query.

### Base schema fragments

These are **plain objects of Zod fields**, not `ZodObject`s. Spread them or pass them to
`.extend()`; `baseSchema.extend(...)` is not a thing.

```typescript
import { baseSchema, baseImageFileSchema } from "pocketbase-zod-schema/schema";

const PostSchema = z.object({ title: z.string() }).extend(baseSchema);
// or
const PostSchema = z.object({ ...baseSchema, title: z.string() });
```

| Export | Fields |
| --- | --- |
| `baseSchema` | `id`, `collectionId`, `collectionName`, `expand`, `created`, `updated` |
| `baseSchemaWithTimestamps` | `baseSchema` (the timestamps are already in it) |
| `baseImageFileSchema` | `baseSchema` plus `thumbnailURL`, `imageFiles` |
| `inputImageFileSchema` | `imageFiles: z.array(z.instanceof(File))` — form input |
| `omitImageFilesSchema` | `{ imageFiles: true }`, for `.omit()` |

### `withPermissions<T>(schema: T, permissions: PermissionSchema | PermissionTemplateConfig): T`

Attaches API rules to a schema without `defineCollection()`. Kept for backward compatibility.

### `withIndexes<T>(schema: T, indexes: string[]): T`

Attaches index statements to a schema. Kept for backward compatibility.

## Field Helpers

All are exported from `pocketbase-zod-schema/schema`. They return ordinary Zod types with
PocketBase metadata in the description, so `.optional()`, `.nullable()` and `z.infer` behave
normally. Full option tables are in [TYPE_MAPPING.md](./TYPE_MAPPING.md).

| Helper | PocketBase type | Returns |
| --- | --- | --- |
| `BoolField()` | `bool` | `z.ZodBoolean` |
| `NumberField(options?)` | `number` | `z.ZodNumber` |
| `TextField(options?)` | `text` | `z.ZodString` |
| `EmailField()` | `email` | `z.ZodString` |
| `URLField()` | `url` | `z.ZodString` |
| `EditorField()` | `editor` | `z.ZodString` |
| `DateField(options?)` | `date` | `z.ZodString` |
| `AutodateField(options?)` | `autodate` | `z.ZodString` |
| `SelectField(values, options?)` | `select` | enum, or array of enum when `maxSelect > 1` |
| `SingleSelectField(values)` | `select` | enum (`maxSelect: 1`) |
| `MultiSelectField(values, options?)` | `select` | array of enum |
| `FileField(options?)` | `file` | `z.ZodType<string, File \| string>` |
| `FilesField(options?)` | `file` | `z.ZodType<string[], (File \| string)[]>` |
| `JSONField(schema?, options?)` | `json` | the passed schema, or `z.ZodRecord<z.ZodString, z.ZodAny>` |
| `GeoPointField()` | `geoPoint` | `z.ZodObject<{ lon, lat }>` |
| `RelationField(config)` | `relation` | `z.ZodString` (`maxSelect: 1`) |
| `RelationsField(config)` | `relation` | `z.ZodArray<z.ZodString>` |

`RelationConfig`: `collection` (required), `cascadeDelete?`, `displayFields?`.
`RelationsConfig` adds `minSelect?` (default `0`) and `maxSelect?` (default `999`).

`JSONFieldOptions`: `maxSize?` — a `ByteSize` (bytes as a number, or `"200K"`/`"5M"`/`"1G"`),
normalized to bytes in the emitted migration. PocketBase caps a `json` field at 1MB when this is
unset, so a field holding more has to declare its own limit. Both arguments are optional and either
may be given alone: `JSONField({ maxSize: "5M" })` is an untyped JSON field with a 5MB cap.
`FileFieldOptions.maxSize` takes the same `ByteSize` (ceiling `8G`; a `json` field's ceiling is
2^53-1 bytes).

### Metadata accessors

- `extractFieldMetadata(description?: string): FieldMetadata | null`
- `extractRelationMetadata(description?: string)` — returns the relation config or `null`
- `FIELD_METADATA_KEY` — `"__pocketbase_field__"`, the JSON key field metadata rides under

## Permissions

### `PermissionTemplates`

An object of factory functions, each returning a `PermissionSchema`:

| Function | Behaviour |
| --- | --- |
| `PermissionTemplates.public()` | every rule `""` |
| `PermissionTemplates.authenticated()` | every rule `'@request.auth.id != ""'` |
| `PermissionTemplates.ownerOnly(ownerField = "User")` | owner may read/write their own records |
| `PermissionTemplates.adminOnly(roleField = "role")` | requires `@request.auth.<roleField> = "admin"` |
| `PermissionTemplates.readPublic()` | public read, authenticated write |
| `PermissionTemplates.locked()` | every rule `null` (superusers only) |
| `PermissionTemplates.readOnlyAuthenticated()` | authenticated read, writes `null` |

### `resolveTemplate(config: PermissionTemplateConfig): PermissionSchema`

Resolves a `template` name into concrete rules and applies `customRules` on top. Accepted template
names — note these are the **kebab-case** strings, which differ from the `PermissionTemplates`
function names above:

`"public"` · `"authenticated"` · `"owner-only"` · `"admin-only"` · `"read-public"` · `"custom"`

`"custom"` starts from an empty rule set, so `customRules` supplies everything.

`PermissionTemplates.locked()` and `readOnlyAuthenticated()` have no template-name equivalent —
call them directly.

### Other helpers

- `isTemplateConfig(config)` / `isPermissionSchema(config)` — discriminators
- `createPermissions(partial)` / `mergePermissions(...partials)`
- `validatePermissionConfig(config)` / `validateRuleExpression(expression)` → `PermissionValidationResult`

## Migration Pipeline

The flow is **Zod schemas → analyzer → `SchemaDefinition` → diff → filter → generator → one `.js`
file per collection operation**. `package/src/cli/commands/generate.ts` runs it end to end.

### Analyzer

```typescript
import { parseSchemaFiles, SchemaAnalyzer } from "pocketbase-zod-schema/migration";
```

- `parseSchemaFiles(schemaDir: string): Promise<SchemaDefinition>` — parse every schema file in a
  directory. Throws `SchemaParsingError`.
- `discoverSchemaFiles(schemaDir: string): string[]`
- `convertZodSchemaToCollectionSchema(name: string, schema: z.ZodObject<any>): CollectionSchema`
- `buildFieldDefinition(fieldName: string, zodType: z.ZodTypeAny): FieldDefinition`
- `isAuthCollection(fields): boolean` — true only when both `email` and `password` are present
- `getCollectionNameFromFile(filePath)`, `selectSchemaForCollection(module)`,
  `extractFieldDefinitions`, `extractIndexes`, `extractSchemaDefinitions`, `importSchemaModule`
- `new SchemaAnalyzer(config?: SchemaAnalyzerConfig)` — the same operations as a stateful object

Export selection order per file: default export, then `*Collection`, then `*Schema`.

### Snapshot / state reconstruction

```typescript
import { loadSnapshotWithMigrations } from "pocketbase-zod-schema/migration";
```

There is no snapshot JSON file. "Current database state" means *the state produced by executing
the migration files*.

##### `loadSnapshotWithMigrations(config?: SnapshotConfig): SchemaSnapshot | null`

**This is the one you want.** Executes the newest `*_collections_snapshot.js` plus every migration
after it, in timestamp order, through the [execution engine](#execution-engine). Returns `null`
when there is nothing to replay. A migration that cannot be executed throws `SnapshotError`
(wrapping `MigrationExecutionError`) — it is a hard failure by design, because continuing would
reconstruct a state the database was never in.

`SnapshotConfig` fields used here: `migrationsPath` (required in practice), `engineOptions`,
`appliedMigrations`. Passing a *file* path instead of a directory executes just that file.

##### `loadSnapshotIfExists(config?: SnapshotConfig): SchemaSnapshot | null`

Executes **only** the newest snapshot file and ignores every migration after it, and swallows
failures with a `console.warn`. That is almost never the current state — use it only when you
genuinely want the snapshot baseline alone.

Also exported: `findLatestSnapshot`, `getSnapshotPath`, `getSnapshotVersion`, `loadBaseMigration`,
`loadSnapshot`, `mergeSnapshots`, `saveSnapshot`, `snapshotExists`, `validateSnapshot`, and the
`SnapshotManager` class wrapping them.

### Diff

```typescript
import { compare, DiffEngine } from "pocketbase-zod-schema/migration";
```

- `compare(current: SchemaDefinition, previous: SchemaSnapshot | null, config?: DiffEngineConfig): SchemaDiff`
- `new DiffEngine(config?: DiffEngineConfig)` — `.compare()`, `.detectDestructiveChanges()`,
  `.categorizeChangesBySeverity()`
- `detectDestructiveChanges(diff): DestructiveChange[]`, `requiresForceFlag(diff): boolean`
- `filterDiff(diff, options: FilterOptions)` — restrict a diff to `options.patterns` (matching
  collection or field names, regex allowed), optionally dropping destructive changes with
  `options.skipDestructive`
- `filterSystemCollections`, `isSystemCollection`, `getUsersSystemFields`
- Field-level: `detectFieldChanges`, `compareFieldTypes`, `compareFieldConstraints`,
  `compareFieldOptions`, `compareRelationConfigurations`, `matchFieldsByName`
- Collection-level: `findNewCollections`, `findRemovedCollections`, `matchCollectionsByName`,
  `findNewFields`, `findRemovedFields`
- Reporting: `aggregateChanges`, `categorizeChangesBySeverity`, `generateChangeSummary`

Collection **ids are assigned in the diff**, not the generator: a random `pb_` + 15 characters
(`generateCollectionId()`), except `users`, which is pinned to `_pb_users_auth_`. Field ids are
deterministic (sha256 of the name). Regenerating from scratch therefore yields different collection
ids — idempotency depends on the replay path above, not on reproducible ids.

Changing an existing collection's **type** is not diffed and produces no migration.

> Two destructive-change implementations exist: `diff/destructiveness.ts` (used by `DiffEngine`)
> and `migration/validation.ts` (used by the CLI, re-exported as
> `detectDestructiveChangesValidation` / `requiresForceFlagValidation`). A policy change usually
> needs both.

### Generator

```typescript
import { generate, planMigrations } from "pocketbase-zod-schema/migration";
```

##### `generate(diff: SchemaDiff, config: MigrationGeneratorConfig | string): string[]`

Writes one migration file **per collection operation** and returns **an array of the paths
written** — empty when the diff is empty. Passing a string is shorthand for `{ migrationDir }`.

```typescript
const paths = generate(diff, "./pocketbase/pb_migrations");
console.log(`Wrote ${paths.length} migration(s):`, paths);
```

##### `planMigrations(diff, config): PlannedMigration[]`

The same planning step without touching disk — `{ filename, content, ... }` per operation. Pair
with `writePlannedMigrations(planned, migrationDir): string[]` to write them later.

`MigrationGeneratorConfig`: `migrationDir` (required), `workspaceRoot?`, `timestampGenerator?`,
`template?` (`{{UP_CODE}}` / `{{DOWN_CODE}}` placeholders), `includeTypeReference?`.

Also exported: `generateUpMigration`, `generateDownMigration`, `generateMigrationFilename`,
`generateMigrationDescription`, `generateTimestamp`, `generateCollectionCreation`,
`generateCollectionRules`, `generateCollectionPermissions`, `generatePermissionUpdate`,
`generateFieldAddition`, `generateFieldDeletion`, `generateFieldModification`,
`generateFieldDefinitionObject`, `generateFieldsArray`, `generateIndexesArray`,
`createMigrationFileStructure`, `writeMigrationFile`, and the `MigrationGenerator` class.

Generated filenames follow `<unix-timestamp>_<description>.js`, where the description is
`created_<Name>`, `updated_<Name>`, `deleted_<Name>`, or `<verb>_<n>_collections` when one
migration covers several.

> **Round-trip contract:** anything the generator writes, the engine must be able to read back. A
> construct the engine cannot replay makes `generate` emit the same migration forever. New emitted
> constructs need a test alongside `__tests__/integration/generated-migration-replay.test.ts`.

## Execution Engine

The engine reconstructs state by executing migration files in a `node:vm` sandbox that emulates
PocketBase's goja JSVM. Full guide: [EXECUTION_ENGINE.md](./EXECUTION_ENGINE.md).

```typescript
import {
  replayMigrationsDirectory,
  replayMigrations,
  executeMigrationFile,
  CollectionStore,
} from "pocketbase-zod-schema/migration/engine";

const result = replayMigrationsDirectory("pocketbase/pb_migrations", {
  strictness: "lenient",
  timeoutMs: 5000,
  onWarning: (w) => console.warn(w.message),
});
// result.snapshot / result.store / result.warnings
```

Grouped by job:

- **Replay**: `replayMigrations`, `replayMigrationsDirectory`, `executeMigrationFile`,
  `executeMigrationSource`, `executeMigrationDownFile`, `executeMigrationDownSource`,
  `discoverMigrations`, `extractTimestampFromFilename`, `CollectionStore`
- **Applied migrations**: `readAppliedMigrations`, `readAppliedMigrationsIfPresent`,
  `appliedMigrationsFromList`, `planMigrationReplay`, `resolveDatabasePath`,
  `defaultDataDirectory`, `APPLIED_MIGRATIONS_TABLE`, `POCKETBASE_DATABASE_FILENAME`
- **Verification**: `verifyMigrationRoundTrip`, `verifyMigrationFileRoundTrip`,
  `verifyMigrationFiles`, `verifyMigrationSources`, `compareStores`, `describeStateDifferences`
- **goja lint**: `lintMigrationSource`, `lintMigrationFile`, `lintMigrationFiles`,
  `formatGojaLintFinding`, `gojaFindingsFromWarnings`, `availableGlobals`
- **Record simulation** (opt-in via `records: "simulate"`): `RecordModel`, `RecordStore`,
  `createDbx`, `isDbxExpression`, `parseCondition`
- **Errors**: `AppliedMigrationsError`, `ExpressionError`, `UnsupportedQueryError`

Reading the `_migrations` table uses Node's built-in `node:sqlite` and therefore needs
**Node >= 22.5**; on older runtimes pass the applied list explicitly with
`appliedMigrationsFromList`.

## CLI Commands

```bash
pocketbase-migrate <command> [options]
```

### Global options

| Option | Description |
| --- | --- |
| `-c, --config <path>` | Path to configuration file |
| `-v, --version` | Print the version (**`-v` is version, not verbose**) |
| `--verbose` | Verbose output |
| `--quiet` | Suppress non-essential output (also hides the banner) |
| `--no-color` | Disable colored output |

### `generate [filters...]`

Generate migrations from schema changes. Positional `filters` restrict the diff to matching
collection or field names (regex supported).

| Option | Description |
| --- | --- |
| `-o, --output <directory>` | Output directory for migration files |
| `-f, --force` | Generate even with destructive changes or duplicates |
| `--dry-run` | Show what would be generated without writing files |
| `--schema-dir <directory>` | Directory containing Zod schema files |
| `--verify` | Execute `up()` and `down()` before writing; refuse migrations that do not roll back |
| `--no-verify` | Skip verification even when enabled in the config file |

### `status`

Show current migration status without generating files.

| Option | Description |
| --- | --- |
| `--schema-dir <directory>` | Directory containing Zod schema files |
| `--json` | Output status as JSON |
| `--verify` | Compare files on disk against PocketBase's `_migrations` table; exit non-zero on drift |
| `--pb-data <path>` | PocketBase data directory or `data.db` file (defaults to `pb_data` next to the migrations directory) |

Reading the database adds an **Applied Migrations** section (drift, plus what the pending files
will do once applied). The schema comparison is unaffected — it always diffs against the migration
files on disk, so `status` and `generate` report the same pending work. In `--json` output the
extra information appears under `migrations`, including `migrations.unapplied` counts.

### `generate-types`

Generate TypeScript definitions from your Zod schemas.

| Option | Description |
| --- | --- |
| `-o, --output <path>` | Output file path (default `pocketbase-types.ts`) |
| `--schema-dir <directory>` | Directory containing Zod schema files |

### `lint [files...]`

Check migration files for JavaScript that runs in the engine but not in PocketBase's goja runtime.
Defaults to every file in the migrations directory. Exits non-zero on any error-severity finding.

| Option | Description |
| --- | --- |
| `-o, --output <directory>` | Directory containing migration files |
| `--no-execute` | Static checks only — skips the stubbed-API warnings that only exist once a file has run |

### Programmatic CLI use

```typescript
import { loadConfig, generateMigration, getMigrationStatus } from "pocketbase-zod-schema/cli";
```

`loadConfig(options?): Promise<MigrationConfig>` merges, in priority order: CLI args >
environment variables > config file > defaults. See [CONFIGURATION.md](./CONFIGURATION.md).

Loggers: `logSuccess`, `logError`, `logWarning`, `logInfo`, `logDebug`, `logSection`, `logStep`,
`logBox`, `logList`, `logTable`, `logKeyValue`, `logTimed`, `logTimestamp`, `withProgress`,
`createSpinner`, `createProgressBar`, `formatChangeSummary`, `formatDuration`, `formatStatusJson`,
`setVerbosity`, `getVerbosity`.

## Type Definitions

### Core types

```typescript
interface SchemaDefinition {
  collections: Map<string, CollectionSchema>;
}

interface SchemaSnapshot {
  version: string;
  timestamp: string;
  collections: Map<string, CollectionSchema>;
}

interface CollectionSchema {
  name: string;
  type: "base" | "auth" | "view";
  id?: string;          // pb_ + 15 chars, or _pb_users_auth_
  viewQuery?: string;   // view collections only
  fields: FieldDefinition[];
  indexes?: string[];
  rules?: PermissionSchema;
  permissions?: PermissionSchema;
}

interface FieldDefinition {
  name: string;
  id: string;           // deterministic: sha256 of the name
  type: PocketBaseFieldType;
  required: boolean;
  zodType?: z.ZodTypeAny;
  unique?: boolean;
  options?: Record<string, any>;
  relation?: {
    collection: string;
    cascadeDelete?: boolean;
    maxSelect?: number;
    minSelect?: number;
    displayFields?: string[] | null;
  };
}
```

### Diff types

```typescript
interface SchemaDiff {
  collectionsToCreate: CollectionSchema[];
  collectionsToDelete: any[];
  collectionsToModify: CollectionModification[];
  existingCollectionIds?: Map<string, string>;
}

interface CollectionModification {
  collection: string;
  fieldsToAdd: FieldDefinition[];
  fieldsToRemove: any[];
  fieldsToModify: FieldModification[];
  indexesToAdd: string[];
  indexesToRemove: string[];
  rulesToUpdate: RuleUpdate[];
  permissionsToUpdate: PermissionChange[];
  viewQueryUpdate?: ViewQueryUpdate;   // view collections only
}

interface FieldModification {
  fieldName: string;
  currentDefinition: any;
  newDefinition: FieldDefinition;
  changes: FieldChange[];              // { property, oldValue, newValue }
}

interface RuleUpdate {
  ruleType: "listRule" | "viewRule" | "createRule" | "updateRule" | "deleteRule" | "manageRule";
  oldValue: string | null;
  newValue: string | null;
}

interface ViewQueryUpdate {
  oldValue: string | null;
  newValue: string;
}
```

### Permission types

```typescript
type RuleExpression = string | null;   // null = superusers only, "" = public

interface PermissionSchema {
  listRule?: RuleExpression;
  viewRule?: RuleExpression;
  createRule?: RuleExpression;
  updateRule?: RuleExpression;
  deleteRule?: RuleExpression;
  manageRule?: RuleExpression;         // auth collections only
}

type PermissionTemplate =
  | "public" | "authenticated" | "owner-only" | "admin-only" | "read-public" | "custom";

interface PermissionTemplateConfig {
  template: PermissionTemplate;
  ownerField?: string;   // owner-only, default "User"
  roleField?: string;    // admin-only, default "role"
  customRules?: Partial<PermissionSchema>;
}
```

### Configuration type

```typescript
interface MigrationConfig {
  schema: {
    directory: string;
    exclude: string[];
  };
  migrations: {
    directory: string;
    format: string;        // accepted but currently unused
    verify: boolean;
    dataDirectory: string; // "" means pb_data next to the migrations directory
  };
  diff: {
    warnOnDelete: boolean;
    requireForceForDestructive: boolean;
  };
  typeGen: {
    outPath: string;
  };
}
```

## Error Classes

All extend `MigrationError`, which extends `Error`. Every subclass exposes a
`getDetailedMessage(): string` that appends its context fields.

```typescript
import {
  MigrationError,
  SchemaParsingError,
  SnapshotError,
  MigrationExecutionError,
  MigrationGenerationError,
  FileSystemError,
  ConfigurationError,
  CLIUsageError,
} from "pocketbase-zod-schema/migration";
```

| Class | Constructor | Public fields |
| --- | --- | --- |
| `MigrationError` | `(message)` | — |
| `SchemaParsingError` | `(message, filePath?, originalError?)` | `filePath`, `originalError` |
| `SnapshotError` | `(message, snapshotPath?, operation?, originalError?)` | `snapshotPath`, `operation` (`"read" \| "write" \| "parse" \| "validate"`), `originalError` |
| `MigrationExecutionError` | `(message, filePath?, phase?, originalError?)` | `filePath`, `phase` (`"evaluate" \| "up" \| "down"`), `originalError` |
| `MigrationGenerationError` | `(message, migrationPath?, originalError?)` | `migrationPath`, `originalError` |
| `FileSystemError` | `(message, path?, operation?, code?, originalError?)` | `path`, `operation`, `code`, `originalError` |
| `ConfigurationError` | `(message, configPath?, invalidFields?, originalError?)` | `configPath`, `invalidFields`, `originalError` |
| `CLIUsageError` | `(message, command?, suggestion?)` | `command`, `suggestion` |

The engine adds `AppliedMigrationsError`, `ExpressionError` and `UnsupportedQueryError`, exported
from `pocketbase-zod-schema/migration/engine`.

## Utility Functions

```typescript
import {
  mapZodTypeToPocketBase,
  isRelationField,
  pluralize,
  singularize,
} from "pocketbase-zod-schema/migration/utils";
```

### Type mapping

- `mapZodTypeToPocketBase(zodType: z.ZodTypeAny, fieldName: string): PocketBaseFieldType` — note
  the **two** parameters
- `getFieldTypeInfo(zodType, fieldName): { type, isMultiple, options }`
- `extractFieldOptions(zodType)`, `extractComprehensiveFieldOptions(zodType)`,
  `filterSupportedFieldOptions(type, options)`,
  `getSupportedFieldOptionKeys(type?)` — the option keys the generator may emit
  for a field type, and the same list the engine's reader reads back
- `isFieldRequired`, `unwrapZodType`, `getDefaultValue`, `isArrayType`, `getArrayElementType`,
  `isGeoPointType`
- Per-type mappers: `mapZodStringType`, `mapZodNumberType`, `mapZodBooleanType`, `mapZodEnumType`,
  `mapZodArrayType`, `mapZodDateType`, `mapZodRecordType`
- `POCKETBASE_FIELD_TYPES`, `FIELD_TYPE_INFO`

### Relation detection (naming-convention fallback)

- `isRelationField(fieldName, zodType): boolean`
- `isSingleRelationField(fieldName, zodType)` / `isMultipleRelationField(fieldName, zodType)`
- `resolveTargetCollection(fieldName): string`
- `getMaxSelect(fieldName, zodType)` / `getMinSelect(fieldName, zodType)`

Used only when a field carries no `RelationField`/`RelationsField` metadata. See
[NAMING_CONVENTIONS.md](./NAMING_CONVENTIONS.md) for the exact rule.

### Strings and ids

- `pluralize(singular)`, `singularize(plural)`, `toCollectionName(entityName)`
- `generateCollectionId(): string`, `generateFieldId(type, name?): string`

## Examples

### Full pipeline

```typescript
import {
  parseSchemaFiles,
  compare,
  generate,
  loadSnapshotWithMigrations,
  detectDestructiveChanges,
} from "pocketbase-zod-schema/migration";

const schemaDir = "./src/schema";
const migrationsDir = "./pocketbase/pb_migrations";

// 1. Parse the Zod schemas
const currentSchema = await parseSchemaFiles(schemaDir);

// 2. Reconstruct current DB state by executing the existing migrations
const previousSnapshot = loadSnapshotWithMigrations({ migrationsPath: migrationsDir });

// 3. Diff
const diff = compare(currentSchema, previousSnapshot);

// 4. Guard destructive changes
const destructive = detectDestructiveChanges(diff);
if (destructive.length > 0) {
  console.warn("Destructive changes:", destructive);
}

// 5. Write one file per collection operation
const paths = generate(diff, migrationsDir);
console.log(paths.length ? `Wrote:\n${paths.join("\n")}` : "No changes detected");
```

### Replaying only what the database has actually applied

```typescript
import {
  readAppliedMigrationsIfPresent,
  planMigrationReplay,
} from "pocketbase-zod-schema/migration/engine";
import { loadSnapshotWithMigrations } from "pocketbase-zod-schema/migration";

const applied = readAppliedMigrationsIfPresent("pocketbase/pb_data");
const plan = planMigrationReplay("pocketbase/pb_migrations", { applied: applied ?? undefined });

if (!plan.inSync) {
  console.warn("pending:", plan.pending, "missing:", plan.missing, "out of order:", plan.outOfOrder);
}

const state = loadSnapshotWithMigrations({
  migrationsPath: "pocketbase/pb_migrations",
  appliedMigrations: applied ?? undefined,
});
```

### Error handling

```typescript
import {
  SchemaParsingError,
  SnapshotError,
  MigrationExecutionError,
} from "pocketbase-zod-schema/migration";

try {
  const schemas = await parseSchemaFiles("./src/schema");
  const state = loadSnapshotWithMigrations({ migrationsPath: "./pocketbase/pb_migrations" });
} catch (error) {
  if (error instanceof SchemaParsingError) {
    console.error(error.getDetailedMessage());
  } else if (error instanceof SnapshotError) {
    // A migration the engine could not execute surfaces here, wrapping
    // MigrationExecutionError with the offending file and phase.
    const cause = error.originalError;
    if (cause instanceof MigrationExecutionError) {
      console.error(`${cause.filePath} failed during ${cause.phase}`);
    }
    console.error(error.getDetailedMessage());
  } else {
    throw error;
  }
}
```

## See Also

- [Execution Engine](./EXECUTION_ENGINE.md) — how migrations are read back
- [Configuration](./CONFIGURATION.md) — every config key and environment variable
- [Type Mapping](./TYPE_MAPPING.md) — Zod → PocketBase field rules
- [View Collections](./VIEW_COLLECTIONS.md) — SQL-backed read-only collections
- [Naming Conventions](./NAMING_CONVENTIONS.md) — files, collections, relation detection
