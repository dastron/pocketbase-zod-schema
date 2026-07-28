# API Reference

API documentation for `pocketbase-zod-schema`.

Everything here is verified against the source in `package/src/`. Where a function's behaviour is
subtle (`loadSnapshotWithMigrations` vs. replaying a single file, `generate()`'s return type), the
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
- [Examples](#examples)

## Entry Points

The package is split so the schema half stays browser-safe and the migration half (which needs
`fs`, `path`, `node:vm`) is Node-only. There are exactly two import paths, plus the CLI binary.

| Import path | Contents | Environment |
| --- | --- | --- |
| `pocketbase-zod-schema` | `defineCollection`, `defineView`, field helpers, permission templates, metadata accessors, and their types | browser-safe |
| `pocketbase-zod-schema/server` | Everything above, plus the migration pipeline (analyzer, snapshot, diff, destructive-change detection, generator, execution engine, errors) and the programmatic CLI API | Node only |

The `pocketbase-migrate` CLI binary (`dist/cli/migrate.js`) is wired through `package.json`'s `bin`
field, not through `exports` — it isn't an import path. Install the package and run
`pocketbase-migrate` (or `npx pocketbase-migrate`).

Every other subpath that used to exist is gone: `/schema`, `/enums`, `/mutator`, `/migration`,
`/migration/analyzer`, `/migration/diff`, `/migration/engine`, `/migration/generator`,
`/migration/snapshot`, `/migration/utils`, `/cli`, `/cli/utils`. Rewrite any import from one of
these to `pocketbase-zod-schema` or `pocketbase-zod-schema/server`.

## Schema Definition

### `defineCollection(config: CollectionConfig): z.ZodObject<any>`

The primary way to declare a collection. Returns the schema with all collection metadata
serialized into its `.describe()` string — there is no registry, so **`defineCollection()` must
wrap the schema, not the other way round**; calling `.describe()` afterwards overwrites the
metadata.

```typescript
import { z } from "zod";
import { defineCollection, TextField, RelationField } from "pocketbase-zod-schema";

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
| `type` | `"base" \| "auth" \| "view"` | Defaults to `"base"`; auth requires explicit `type: "auth"` |
| `viewQuery` | `string` | Required when `type: "view"`; ignored (with a warning) otherwise |

`type` is never inferred from fields — a collection with `email` and `password` fields does **not**
become `type: "auth"` on its own; set `type: "auth"` explicitly. Unknown keys in `CollectionConfig`
are TypeScript excess-property errors — there is no `[key: string]: unknown` escape hatch, so a
mistyped option name fails to compile instead of silently doing nothing.

### `defineView(config: ViewCollectionConfig): z.ZodObject<any>`

Declares a read-only collection backed by SQL. Equivalent to
`defineCollection({ type: "view", viewQuery })`, but the types reject write rules and indexes at
compile time instead of failing when PocketBase applies the migration.

```typescript
import { z } from "zod";
import { baseSchema, defineView, sql } from "pocketbase-zod-schema";

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

### Base schema fields

`baseSchema` is a **plain object of Zod fields**, not a `ZodObject`. Spread it or pass it to
`.extend()`; `baseSchema.extend(...)` is not a thing.

```typescript
import { baseSchema } from "pocketbase-zod-schema";

const PostSchema = z.object({ title: z.string() }).extend(baseSchema);
// or
const PostSchema = z.object({ ...baseSchema, title: z.string() });
```

| Export | Fields |
| --- | --- |
| `baseSchema` | `id`, `collectionId`, `collectionName`, `expand`, `created`, `updated` |

## Field Helpers

All are exported from `pocketbase-zod-schema`. They return ordinary Zod types with PocketBase
metadata in the description, so `.optional()`, `.nullable()` and `z.infer` behave normally. Full
option tables are in [TYPE_MAPPING.md](./TYPE_MAPPING.md).

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
| `SelectField(values, options?)` | `select` | `EnumFromArray<T>` (no options, or `maxSelect: 1`); `z.ZodArray<EnumFromArray<T>>` (`maxSelect: N > 1`) |
| `FileField(options?)` | `file` | `z.ZodType<string, File \| string>` |
| `FilesField(options?)` | `file` | `z.ZodType<string[], (File \| string)[]>` |
| `JSONField(schema?, options?)` | `json` | the passed schema, or `z.ZodRecord<z.ZodString, z.ZodAny>` |
| `GeoPointField()` | `geoPoint` | `z.ZodObject<{ lon, lat }>` |
| `RelationField(config)` | `relation` | `z.ZodString` (`maxSelect: 1`) |
| `RelationsField(config)` | `relation` | `z.ZodArray<z.ZodString>` |

`RelationConfig`: `collection` (required), `cascadeDelete?`, `displayFields?`.
`RelationsConfig` adds `minSelect?` (default `0`) and `maxSelect?` (default `999`).

**`SelectField` is folded**: `SingleSelectField`/`MultiSelectField` no longer exist.
`SelectField(values)` or `SelectField(values, { maxSelect: 1 })` resolves to `EnumFromArray<T>` (a
`z.ZodEnum`); `SelectField(values, { maxSelect: N })` with a literal `N > 1` resolves to
`z.ZodArray<EnumFromArray<T>>`. The overloads only resolve on a **literal** `maxSelect` — a widened
`number` variable (`const n: number = 1`) always resolves to the array overload, even when its
runtime value is `1`.

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

## Migration Pipeline

The flow is **Zod schemas → analyzer → `SchemaDefinition` → diff → filter → generator → one `.js`
file per collection operation**. `package/src/cli/commands/generate.ts` runs it end to end. The
whole pipeline is a set of plain functions — there are no `SchemaAnalyzer`, `DiffEngine`,
`MigrationGenerator` or `SnapshotManager` classes; the functional API is the API.

### Analyzer

```typescript
import { parseSchemaFiles } from "pocketbase-zod-schema/server";
```

- `parseSchemaFiles(config: SchemaAnalyzerConfig): Promise<SchemaDefinition>` — parses every schema
  file discovered in `config.schemaDir`. Object argument only — the old `parseSchemaFiles(schemaDir:
  string)` overload is gone. Throws `SchemaParsingError`.
- `discoverSchemaFiles(config: SchemaAnalyzerConfig): string[]` — also object-only now.
- `convertZodSchemaToCollectionSchema(name: string, schema: z.ZodObject<any>): CollectionSchema`

**`SchemaAnalyzerConfig`:**

| Field | Type | Default |
| --- | --- | --- |
| `schemaDir` | `string` (required) | — |
| `workspaceRoot` | `string` | `process.cwd()` |
| `excludePatterns` | `string[]` | `["base.ts", "index.ts", "permissions.ts", "permission-templates.ts"]` (and their `.js` equivalents) |
| `includeExtensions` | `string[]` | `[".ts", ".js"]` |
| `useCompiledFiles` | `boolean` | `true` |
| `pathTransformer` | `(sourcePath: string) => string` | — |

There is no `schemaPatterns` option.

**Discovery is metadata-based, not name-based.** A file contributes a collection iff one of its
exports is a Zod object whose `.describe()` carries collection metadata — a JSON `collectionName`,
which is what `defineCollection()`/`defineView()` produce:

- Export **names** carry no meaning. The old default-export → `*Collection` → `*Schema` preference
  order is gone; candidates are deduplicated by object reference, so
  `export default X; export { X }` counts once.
- A file with no qualifying export is **skipped with a `console.warn`**, not an error — but if that
  file previously produced a collection, the next diff may propose deleting it.
- **One collection per file.** A second, distinct metadata-carrying export in the same file throws.
- The same `collectionName` declared in two different files throws `SchemaParsingError`.
- `discoverSchemaFiles` is a flat `readdirSync` over `schemaDir` — **subdirectories are never
  scanned**.

### Snapshot / state reconstruction

```typescript
import { loadSnapshotWithMigrations } from "pocketbase-zod-schema/server";
```

There is no snapshot JSON file. "Current database state" means *the state produced by executing
the migration files*.

##### `loadSnapshotWithMigrations(config?: SnapshotConfig): SchemaSnapshot | null`

Executes the newest `*_collections_snapshot.js` plus every migration after it, in timestamp order,
through the [execution engine](#execution-engine). Returns `null` when there is nothing to replay.
A migration that cannot be executed throws `SnapshotError` (wrapping `MigrationExecutionError`) —
it is a hard failure by design, because continuing would reconstruct a state the database was
never in.

`SnapshotConfig` fields: `migrationsPath` (required in practice), `engineOptions`,
`appliedMigrations`. Passing a *file* path instead of a directory executes just that file. There is
no JSON-file snapshot API any more — `saveSnapshot`, `loadSnapshot`, `loadSnapshotIfExists`,
`getSnapshotPath`, `snapshotExists`, `validateSnapshot`, `getSnapshotVersion`, `mergeSnapshots`,
`loadBaseMigration` and the `SnapshotManager` class are all gone. State reconstruction is only
`loadSnapshotWithMigrations` (replays migration files in the `node:vm` engine) plus:

##### `findLatestSnapshot(migrationsPath: string): string | null`

Finds the newest `*_collections_snapshot.js` (or `*_snapshot.js`) file in a migrations directory, by
filename sort. Does not execute anything.

### Diff

```typescript
import { compare, filterDiff, categorizeChangesBySeverity } from "pocketbase-zod-schema/server";
```

- `compare(current: SchemaDefinition, previous: SchemaSnapshot | null, config?: DiffEngineConfig): SchemaDiff`
- `filterDiff(diff: SchemaDiff, options: FilterOptions): SchemaDiff` — restrict a diff to
  `options.patterns` (matching collection or field names, regex allowed), optionally dropping
  destructive changes with `options.skipDestructive`
- `categorizeChangesBySeverity(diff, config?): { destructive: string[]; nonDestructive: string[] }`

**`DiffEngineConfig`:**

| Field | Type | Default |
| --- | --- | --- |
| `systemCollections` | `string[]` | `["_mfas", "_otps", "_externalAuths", "_authOrigins", "_superusers"]` |
| `usersSystemFields` | `string[]` | `["id", "password", "tokenKey", "email", "emailVisibility", "verified", "created", "updated"]` |

`severityThreshold`, `requireForceForDestructive` and `warnOnDelete` no longer exist on
`DiffEngineConfig` — they only ever fed the deleted `diff/destructiveness.ts` implementation. See
[Destructive changes](#destructive-changes) for the one that remains.

**`FilterOptions`:** `patterns?: string[]`, `skipDestructive?: boolean`.

This is the entire public diff surface — `filterSystemCollections`, `isSystemCollection`,
`getUsersSystemFields`, the field-level helpers (`detectFieldChanges`, `compareFieldTypes`, ...),
the collection-level helpers (`findNewCollections`, `matchCollectionsByName`, ...),
`aggregateChanges` and `generateChangeSummary` are internal to `migration/diff/` and are not
exported.

Collection **ids are assigned in the diff**, not the generator: a random `pb_` + 15 characters
(`generateCollectionId()`), except `users`, which is pinned to `_pb_users_auth_`. Field ids are
deterministic (sha256 of the name). Regenerating from scratch therefore yields different collection
ids — idempotency depends on the replay path above, not on reproducible ids.

Changing an existing collection's **type** is not diffed and produces no migration.

### Destructive changes

```typescript
import {
  detectDestructiveChanges,
  hasDestructiveChanges,
  requiresForceFlag,
  formatDestructiveChanges,
  summarizeDestructiveChanges,
} from "pocketbase-zod-schema/server";
```

There is a single destructive-change implementation, `migration/validation.ts`, used by both the
CLI and these exports. The parallel `diff/destructiveness.ts` implementation and its
`detectDestructiveChangesValidation` / `requiresForceFlagValidation` aliases are gone.

- `detectDestructiveChanges(diff: SchemaDiff): DestructiveChange[]` — collection deletions (except
  views, which store no data), field deletions, field type changes, and optional→required field
  changes.
- `hasDestructiveChanges(diff: SchemaDiff): boolean`
- `requiresForceFlag(changes: DestructiveChange[]): boolean` — true when any change is `"high"` or
  `"medium"` severity.
- `formatDestructiveChanges(changes: DestructiveChange[]): string` — a grouped, human-readable
  report.
- `summarizeDestructiveChanges(changes): { total: number; high: number; medium: number; low: number }`

```typescript
enum DestructiveChangeType {
  COLLECTION_DELETION = "collection_deletion",
  FIELD_DELETION = "field_deletion",
  FIELD_TYPE_CHANGE = "field_type_change",
  FIELD_REQUIRED_CHANGE = "field_required_change",
}

interface DestructiveChange {
  type: DestructiveChangeType;
  description: string;
  collection: string;
  field?: string;
  details?: { oldValue?: any; newValue?: any };
  severity: "high" | "medium" | "low";
  warning: string;
}
```

### Generator

```typescript
import { generate, planMigrations, writePlannedMigrations } from "pocketbase-zod-schema/server";
```

##### `generate(diff: SchemaDiff, config: MigrationGeneratorConfig | string): string[]`

Writes one migration file **per collection operation** and returns **an array of the paths
written** — empty when the diff is empty. Passing a string is shorthand for `{ migrationDir }`.

```typescript
const paths = generate(diff, "./pocketbase/pb_migrations");
console.log(`Wrote ${paths.length} migration(s):`, paths);
```

##### `planMigrations(diff: SchemaDiff, config: MigrationGeneratorConfig | string): PlannedMigration[]`

The same planning step without touching disk — one `{ filename, content, operation }` per
collection operation. Also accepts a bare directory string.

##### `writePlannedMigrations(planned: PlannedMigration[], migrationDir: string): string[]`

Writes migrations produced by `planMigrations()`. Unlike `generate`/`planMigrations`, this one
always takes a plain directory string — there is no config-object overload.

**`MigrationGeneratorConfig`:**

| Field | Type | Default |
| --- | --- | --- |
| `migrationDir` | `string` (required) | — |
| `workspaceRoot` | `string` | `process.cwd()` |
| `timestampGenerator` | `() => string` | Unix timestamp in seconds |
| `template` | `string` (`{{UP_CODE}}` / `{{DOWN_CODE}}` placeholders) | built-in `migrate((app) => {...}, (app) => {...})` template |
| `includeTypeReference` | `boolean` | `true` |
| `typesPath` | `string` | `"../pb_data/types.d.ts"` |
| `force` | `boolean` | `false` — write even if an identical migration already exists |

This is a deliberate asymmetry, worth keeping straight: `generate`/`planMigrations` **keep** their
`(diff, migrationDir: string)` convenience overload for ergonomics, while the analyzer's
`parseSchemaFiles`/`discoverSchemaFiles` **dropped** their equivalent string overload and now
require the config object.

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
} from "pocketbase-zod-schema/server";

const result = replayMigrationsDirectory("pocketbase/pb_migrations", {
  strictness: "lenient",
  timeoutMs: 5000,
  onWarning: (w) => console.warn(w.message),
});
// result.snapshot / result.store / result.warnings
```

The engine's full internal surface is large (field constructors, `FieldsList`, the `Collection`
runtime class, `unmarshal`, the `$dbx`/expression grammar, `SimulatedApp`, per-file verification
helpers, ...), but only a curated subset is re-exported from `pocketbase-zod-schema/server`:

- **Replay**: `replayMigrations`, `replayMigrationsDirectory`, `executeMigrationFile`,
  `discoverMigrations`, `CollectionStore`
- **Applied migrations**: `readAppliedMigrations`, `readAppliedMigrationsIfPresent`,
  `appliedMigrationsFromList`, `planMigrationReplay`, `defaultDataDirectory`,
  `AppliedMigrationsError`
- **Verification**: `verifyMigrationSources` — the sequence-level entry point. The per-file/
  single-round-trip helpers (`verifyMigrationFiles`, `verifyMigrationRoundTrip`,
  `verifyMigrationFileRoundTrip`) are internal to `migration/engine/verify.ts` and not part of the
  public surface; build a `MigrationSourceRef[]` (`{ source, file? }`) and call
  `verifyMigrationSources` instead (see [EXECUTION_ENGINE.md](./EXECUTION_ENGINE.md#down-migration-verification)).
- **goja lint**: `lintMigrationSource`, `lintMigrationFile`, `formatGojaLintFinding`
- **Record simulation** (opt-in via `records: "simulate"`): `RecordModel`

Also exported: engine option/result types — `EngineOptions`, `EngineRecordMode`,
`EngineStrictness`, `EngineWarning`, `MigrationDirection`, `MigrationExecutionResult`,
`MigrationPlan`, `DiscoveredMigration`, `PlanOptions`, `ReplayResult`, `AppliedMigration`,
`AppliedMigrationsSource`, `GojaLintFinding`, `GojaLintOptions`, `GojaLintResult`, `GojaLintRule`,
`GojaLintSeverity`, `MigrationRoundTripResult`, `MigrationSourceRef`, `MigrationVerificationReport`.

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
import { loadConfig, generateMigration, getMigrationStatus } from "pocketbase-zod-schema/server";
```

`loadConfig(options?): Promise<MigrationConfig>` merges, in priority order: CLI args >
environment variables > config file > defaults. See [CONFIGURATION.md](./CONFIGURATION.md).

`generateMigration(filters, options)` and `getMigrationStatus(options)` are the same code paths as
the `generate`/`status` CLI commands, callable directly.

CLI loggers (`logInfo`, `logError`, `formatChangeSummary`, `withProgress`, ...) are **no longer
exported** — they are an internal detail of the CLI's terminal output.

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

interface PermissionChange {
  ruleType: APIRuleType;
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
} from "pocketbase-zod-schema/server";
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

The engine adds `AppliedMigrationsError`, exported from `pocketbase-zod-schema/server` alongside
the rest of the [engine surface](#execution-engine).

## Examples

### Full pipeline

```typescript
import {
  parseSchemaFiles,
  compare,
  generate,
  loadSnapshotWithMigrations,
  detectDestructiveChanges,
} from "pocketbase-zod-schema/server";

const schemaDir = "./src/schema";
const migrationsDir = "./pocketbase/pb_migrations";

// 1. Parse the Zod schemas
const currentSchema = await parseSchemaFiles({ schemaDir });

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
  loadSnapshotWithMigrations,
} from "pocketbase-zod-schema/server";

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
  parseSchemaFiles,
  loadSnapshotWithMigrations,
  SchemaParsingError,
  SnapshotError,
  MigrationExecutionError,
} from "pocketbase-zod-schema/server";

try {
  const schemas = await parseSchemaFiles({ schemaDir: "./src/schema" });
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
- [Naming Conventions](./NAMING_CONVENTIONS.md) — files and collections
