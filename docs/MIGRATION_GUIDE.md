# Migration Guide

How to adopt `pocketbase-zod-schema` in an existing project, convert schemas from other tools, and
upgrade between versions of the package.

## Table of Contents

- [Adopting the library on an existing PocketBase instance](#adopting-the-library-on-an-existing-pocketbase-instance)
- [Converting schemas from other tools](#converting-schemas-from-other-tools)
- [Version upgrade notes](#version-upgrade-notes)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Adopting the library on an existing PocketBase instance

The tool has no "import from a live database" step. It works out what to generate by **executing
the migration files on disk** and diffing the resulting state against your Zod schemas. So the job
is to get a migration file that describes your current collections, then write schemas that match
it.

### Step 1: Install

```bash
npm install pocketbase-zod-schema
```

### Step 2: Capture your current collections as a snapshot migration

PocketBase can write this for you:

```bash
./pocketbase migrate collections
```

That creates `pb_migrations/<timestamp>_collections_snapshot.js` containing every collection as it
exists right now. This file becomes the baseline the tool replays. (If `--automigrate` is on — it
is by default — PocketBase also writes a migration every time you change a collection in the admin
UI, so you may already have these.)

### Step 3: Configure

Create `pocketbase-migrate.config.js` at your project root:

```javascript
export default {
  schema: {
    directory: "./src/schema",
    exclude: ["*.test.ts", "*.spec.ts", "base.ts", "index.ts"],
  },
  migrations: {
    directory: "./pocketbase/pb_migrations",
  },
};
```

Every key is documented in [CONFIGURATION.md](./CONFIGURATION.md).

### Step 4: Write schemas that match the existing collections

One file per collection, singular lowercase filename, `export default defineCollection({...})`.
Use the field helpers rather than plain Zod so the PocketBase field type is explicit rather than
inferred:

```typescript
// src/schema/post.ts
import { z } from "zod";
import {
  defineCollection,
  TextField,
  EditorField,
  BoolField,
  RelationField,
} from "pocketbase-zod-schema";

export const PostSchema = z.object({
  title: TextField({ min: 1, max: 200 }),
  content: EditorField(),
  published: BoolField(),
  author: RelationField({ collection: "users" }),
});

export default defineCollection({
  collectionName: "posts",
  schema: PostSchema,
  permissions: {
    listRule: '@request.auth.id != ""',
    viewRule: "",
    createRule: '@request.auth.id != ""',
    updateRule: "author = @request.auth.id",
    deleteRule: "author = @request.auth.id",
  },
});
```

See [NAMING_CONVENTIONS.md](./NAMING_CONVENTIONS.md) and [TYPE_MAPPING.md](./TYPE_MAPPING.md).

### Step 5: Converge until `status` is clean

```bash
npx pocketbase-migrate status
```

`status` prints the diff between your schemas and the replayed state without writing anything.
Anything it reports is a place where your schema and the real collection disagree — adjust the
schema until nothing is reported. A clean `status` means the two sides match and future diffs will
only contain changes you actually made.

### Step 6: Work schema-first from here

```bash
# edit a schema file, then
npx pocketbase-migrate generate

# apply
./pocketbase migrate up
```

PocketBase also applies pending migrations on `serve`, so restarting the server is enough in
development.

## Converting schemas from other tools

There is no automated importer — the conversions below are worked examples you translate by hand.
In all of them, prefer field helpers over plain Zod: they carry explicit PocketBase field types
instead of relying on structural inference.

### From Prisma

```prisma
model Post {
  id        String   @id @default(cuid())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

```typescript
// src/schema/post.ts
import { z } from "zod";
import {
  defineCollection,
  TextField,
  EditorField,
  BoolField,
  AutodateField,
  RelationField,
} from "pocketbase-zod-schema";

export const PostSchema = z.object({
  title: TextField({ min: 1 }),
  content: EditorField().optional(),
  published: BoolField(),
  author: RelationField({ collection: "users" }),
  created: AutodateField({ onCreate: true }),
  updated: AutodateField({ onCreate: true, onUpdate: true }),
});

export default defineCollection({ collectionName: "posts", schema: PostSchema });
```

Notes:

- Drop the `id` column — PocketBase manages it, and `defineCollection` injects the system fields.
- `authorId` collapses into the relation field itself; PocketBase stores the id on `author`.
- `@default(now())` / `@updatedAt` become `AutodateField`, not a Zod default.

### From TypeORM

```typescript
@Entity()
export class User {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ unique: true }) email: string;
  @Column({ nullable: true }) name?: string;
  @OneToMany(() => Post, (post) => post.author) posts: Post[];
}
```

```typescript
// src/schema/user.ts
import { z } from "zod";
import { defineCollection, EmailField, TextField } from "pocketbase-zod-schema";

export const UserSchema = z.object({
  email: EmailField(),
  password: TextField({ min: 8 }),
  name: TextField({ max: 100 }).optional(),
});

export default defineCollection({
  collectionName: "users",
  type: "auth", // required — a schema with email/password fields is not detected automatically
  schema: UserSchema,
  indexes: ["CREATE UNIQUE INDEX idx_users_email ON users (email)"],
});
```

Notes:

- `type: "auth"` must be set explicitly. Having `email` and `password` fields does not make a
  collection an `auth` collection on its own.
- The inverse side of a one-to-many (`posts`) has no column in PocketBase — model it as a relation
  on `Post` only, and read it back with a back-relation filter or `expand`.
- `@Column({ unique: true })` becomes a unique index, not a field option.

### From Drizzle

```typescript
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
});
```

The result is the same as the TypeORM example above: unique constraints move into `indexes`,
`notNull` becomes a non-`.optional()` field, and the primary key disappears.

## Version upgrade notes

**Upgrading from 0.7.x?** Every breaking change landed across `1.0.0`–`1.0.2`. Only `1.0.0` carries
a `⚠ BREAKING CHANGES` note in [package/CHANGELOG.md](../package/CHANGELOG.md): `1.0.1` and `1.0.2`
were released from `fix:` commits, so the generated changelog files them as bug fixes even though
`1.0.2` removes import paths, exports, and schema inference. **This section is the authoritative
list** — the changelog undercounts.

| Version | Breaking change |
| --- | --- |
| [1.0.2](#102--import-paths-consolidated-inference-and-exports-removed-breaking) | Subpath imports (`/schema`, `/migration`, `/cli`, …) removed; `SingleSelectField`/`MultiSelectField` folded into `SelectField`; naming-convention inference removed; many exports deleted |
| [1.0.1](#101--field-constraints-are-read-from-chained-validators-and-removing-one-settles) | Chained validators (`.max()`, `.regex()`) on field helpers now reach the migration; relation names ending in a reference suffix are refused |
| [1.0.0](#100--the-static-migration-parser-is-gone) | Static migration parser removed — state is reconstructed by executing migrations |

### 1.0.2 — import paths consolidated, inference and exports removed (breaking)

This release trims the package to two entry points, deletes the naming-convention fallback
entirely, and stops guessing `auth` collections. Import-path and export changes are compile-time
breaks — you find them immediately. The inference removals are **not**: a schema that still relies
on them keeps compiling and changes what `generate` emits, so read
[Removed schema inference](#removed-schema-inference) before you next run `generate`.

#### Removed import paths

There are exactly two import paths left, plus the CLI binary:

| Import path | Contents | Environment |
| --- | --- | --- |
| `pocketbase-zod-schema` | `defineCollection`, `defineView`, field helpers, permission templates, metadata accessors, types | browser-safe |
| `pocketbase-zod-schema/server` | the above, plus the migration pipeline (analyzer, snapshot, diff, destructive-change detection, generator, engine) and the programmatic CLI API | Node only |

Every other subpath is gone from `package.json`'s `exports`, so importing one is a resolution error
(`ERR_PACKAGE_PATH_NOT_EXPORTED`), not a deprecation warning:

| Removed subpath | Import from instead |
| --- | --- |
| `pocketbase-zod-schema/schema` | `pocketbase-zod-schema` |
| `pocketbase-zod-schema/enums` | — deleted, no replacement (see [below](#other-removed-and-renamed-exports)) |
| `pocketbase-zod-schema/mutator` | — deleted, no replacement |
| `pocketbase-zod-schema/migration` | `pocketbase-zod-schema/server` |
| `pocketbase-zod-schema/migration/analyzer` | `pocketbase-zod-schema/server` |
| `pocketbase-zod-schema/migration/diff` | `pocketbase-zod-schema/server` |
| `pocketbase-zod-schema/migration/engine` (1.0.0–1.0.1 only) | `pocketbase-zod-schema/server` |
| `pocketbase-zod-schema/migration/generator` | `pocketbase-zod-schema/server` |
| `pocketbase-zod-schema/migration/snapshot` | `pocketbase-zod-schema/server` |
| `pocketbase-zod-schema/migration/utils` | `pocketbase-zod-schema/server` |
| `pocketbase-zod-schema/cli` | `pocketbase-zod-schema/server` (`generateMigration`, `getMigrationStatus`, `loadConfig`) |
| `pocketbase-zod-schema/cli/utils` | `pocketbase-zod-schema/server` (`loadConfig` only — the loggers are gone) |

```typescript
// before
import { defineCollection, TextField } from "pocketbase-zod-schema/schema";
import { parseSchemaFiles } from "pocketbase-zod-schema/migration/analyzer";
import { compare } from "pocketbase-zod-schema/migration/diff";
import { generate } from "pocketbase-zod-schema/migration/generator";
import { loadConfig } from "pocketbase-zod-schema/cli/utils";

// after
import { defineCollection, TextField } from "pocketbase-zod-schema";
import { compare, generate, loadConfig, parseSchemaFiles } from "pocketbase-zod-schema/server";
```

`pocketbase-zod-schema/server` re-exports everything the browser-safe entry point does, so a
server-side file can import from it alone. Keep schema files on the plain `pocketbase-zod-schema`
import if they are also bundled for the browser — `/server` pulls in `fs`, `path`, and `node:vm`.
The `pocketbase-migrate` binary is wired through `package.json`'s `bin`, so it is unaffected; it was
never an import path. `pocketbase-zod-schema/package.json` is still exported.

#### `SelectField` replaces `SingleSelectField` and `MultiSelectField`

`SingleSelectField` and `MultiSelectField` no longer exist. `SelectField` covers both through
overloads resolved by `maxSelect`:

```typescript
// before
import { MultiSelectField, SingleSelectField } from "pocketbase-zod-schema";

status: SingleSelectField(["draft", "published"]),      // ZodEnum
categories: MultiSelectField(["a", "b", "c"]),          // ZodArray<ZodEnum>, maxSelect 999
tags: MultiSelectField(["a", "b", "c"], { maxSelect: 3 }),

// after
import { SelectField } from "pocketbase-zod-schema";

status: SelectField(["draft", "published"]),            // ZodEnum  (maxSelect 1)
categories: SelectField(["a", "b", "c"], { maxSelect: 999 }),
tags: SelectField(["a", "b", "c"], { maxSelect: 3 }),
```

Two things to watch:

- **`MultiSelectField(values)` defaulted `maxSelect` to `999`; `SelectField(values)` means
  `maxSelect: 1`.** Carry the `999` over explicitly. Otherwise the field flips from multi- to
  single-select and the next `generate` emits an `updated_*` migration narrowing it — an option
  change, so it is **not** flagged as destructive and needs no `--force`, while records already
  holding several values no longer validate. Ported like-for-like, the swap produces **no**
  migration: both helpers wrote the same `select` metadata (`values` + `maxSelect`).
- **Pass `maxSelect` as a literal.** The overloads are selected at compile time, so a widened
  `number` (`const n: number = 1`) resolves to the array overload even when its runtime value is
  `1`, and `z.infer` disagrees with what the field actually holds.

See [TYPE_MAPPING.md](./TYPE_MAPPING.md#select-field) for the full option table.

#### Removed schema inference

These change what `generate` emits without any compile error to warn you. Convert the affected
schemas first, then run `pocketbase-migrate status` and confirm you see no unexpected type changes
or deletions before generating.

1. **Name-based relation detection is gone.** There is no more fallback that read an
   uppercase-first `z.string()`/`z.array(z.string())` field name as a relation target. Every
   relation must be declared with `RelationField({ collection })` / `RelationsField({ collection })`.
   **Convert these fields before regenerating** — an un-migrated field now falls through to the
   loose structural mapping (`text` for a string, `json` for an array), and the next `generate`
   emits a field **type-change** migration (`relation` → `text` or `relation` → `json`). PocketBase
   drops a relation's stored values when its type changes, so applying that migration destroys the
   relation data server-side. Run `pocketbase-migrate status` after converting and confirm it shows
   no unexpected type changes before you `generate`.
2. **Bare `z.array(z.string())` now maps to `json`, not `relation`.** If you had one relying on the
   old naming-convention fallback to become a relation, replace it with
   `RelationsField({ collection })`. A plain list of strings that was never meant to be a relation
   needs no change — it now maps the way `JSONField(z.array(z.string()))` always did. See
   [TYPE_MAPPING.md](./TYPE_MAPPING.md#basic-type-mappings).
3. **Auth auto-detection is removed.** A schema with `email` and `password` fields no longer becomes
   an `auth` collection on its own. **Add `type: "auth"` explicitly** in `defineCollection()` before
   regenerating. Collection *type* changes are never diffed, so an existing auth collection in the
   database will not be silently downgraded — but without the explicit `type`, the analyzer treats
   the schema as `base` when computing system fields and `manageRule`, which disagrees with the real
   collection.
4. **Discovery is metadata-based, and a file with none is skipped, not guessed.** A file contributes
   a collection only if one of its exports is a Zod object whose description carries
   `defineCollection()`/`defineView()` metadata — see
   [NAMING_CONVENTIONS.md](./NAMING_CONVENTIONS.md#which-export-the-analyzer-picks). A file that
   still uses a bare exported schema (no `defineCollection()` wrapper) now produces a console warning
   and contributes nothing; if that collection already exists in the database, the diff may propose
   **deleting it** (gated behind `--force`, since collection deletion is destructive). **Wrap every
   collection-bearing schema in `defineCollection()`/`defineView()`** before regenerating, and check
   `pocketbase-migrate status` for unexpected deletions.
5. **Unknown `defineCollection()` keys are now type errors.** The `[key: string]: unknown` escape
   hatch on `CollectionConfig` is gone, and field types embedded in `__pocketbase_field__` metadata
   are validated at analysis time — an unrecognized type throws instead of silently falling through.
   (Compile-time, unlike the four above.)

#### Other removed and renamed exports

| Removed | Replacement |
| --- | --- |
| `SingleSelectField` / `MultiSelectField` | `SelectField(values, { maxSelect })` — [details above](#selectfield-replaces-singleselectfield-and-multiselectfield) |
| `buildSchemaDefinition` | `parseSchemaFiles(config)` — object argument only, no string overload |
| `aggregateChanges` | `compare(current, previous, config?)` |
| `detectDestructiveChangesValidation` | `detectDestructiveChanges` |
| `requiresForceFlagValidation` | `requiresForceFlag` |
| `ValidationDestructiveChange` (type) | `DestructiveChange` (type) |
| `withPermissions()` / `withIndexes()` | `defineCollection({ permissions, indexes })` |

Also deleted outright, with no replacement: the snapshot JSON-file API (`saveSnapshot`,
`loadSnapshot`, `loadSnapshotIfExists`, `getSnapshotPath`, `snapshotExists`, `validateSnapshot`,
`getSnapshotVersion`, `mergeSnapshots`, `loadBaseMigration`); the OO wrapper classes
(`SchemaAnalyzer`, `DiffEngine`, `MigrationGenerator`, `SnapshotManager`); `mutator/`
(`BaseMutator`, `MutatorOptions`, `Expanded`); `enums.ts` (`StatusEnum`, `StatusEnumType`); the
image-file schema fragments (`baseImageFileSchema`, `inputImageFileSchema`,
`omitImageFilesSchema`, `baseSchemaWithTimestamps`); the permission validators (`isTemplateConfig`,
`isPermissionSchema`, `createPermissions`, `mergePermissions`, `validatePermissionConfig`,
`validateRuleExpression`, `PermissionValidationResult`); and the naming-convention internals
(`pluralize`/`singularize`/`toCollectionName`, `relation-detector.ts`). CLI loggers (`logInfo`,
`logError`, `formatChangeSummary`, `withProgress`, …) are no longer exported either.

The published surface is now pinned by `package/src/__tests__/public-exports.test.ts`, which asserts
both what each entry point exports and that the names above stay gone.

### 1.0.1 — field constraints are read from chained validators, and removing one settles

Three fixes to how a field's `min`/`max`/`pattern` travel from a Zod schema into a migration. Each
can produce one migration on the next `generate`, after which the schema and the database agree.

- **Validators chained onto a field helper are read.** `TextField().max(60).regex(/…/)` recorded only
  what was passed to `TextField()`, so the chained constraints were silently dropped. They now map
  the same way they do on bare Zod (see
  [TYPE_MAPPING.md](./TYPE_MAPPING.md#validation-constraint-mappings)), for `text`, `password`,
  `number`, `select`, and `file` fields. If you were relying on the constraints being ignored, move
  them off the field or set the option explicitly.
- **A RegExp `pattern` survives.** `TextField({ pattern: /^[a-z]+$/ })` stored the RegExp in the
  field metadata, which is JSON — the pattern serialized to `{}` and never reached the migration. It
  is now recorded as the pattern source, which is what PocketBase stores.
- **Dropping a constraint no longer re-emits forever.** Removing `max`/`pattern` from a schema
  emitted `field.max = null`, a state PocketBase cannot hold; replay read the removal back as still
  pending, so every `generate` produced the same `updated_*` migration. Removals are now written as
  PocketBase's zero value (`max = 0`, `pattern = ""`), and the diff treats a zero value — and a
  `null` from an older migration — as equivalent to a schema that never set the option.

### 1.0.1 — relation names ending in a reference suffix are refused

> **Superseded by 1.0.2.** The naming-convention fallback this entry describes no longer exists at
> all — see [the 1.0.2 entry above](#102--import-paths-consolidated-inference-and-exports-removed-breaking).
> Every relation is now declared with `RelationField()`/`RelationsField()`, so this specific error
> can no longer occur. Left here for anyone tracing history from an older version.

The naming-convention fallback (a `z.string()`/`z.array(z.string())` field with an uppercase-first
name and no `RelationField`) reads the last capitalized word as the target entity. For a name like
`WorkspaceRef` that word is `Ref`, so the target resolved to a pluralized `Reves` — a collection
nothing answers to, written into a migration without complaint.

Names whose trailing word is `Ref`, `Refs`, `Id`, `Ids`, `Uid`, `Uids`, `Uuid`, `Uuids`, `Fk`,
`Fks`, `Pk`, or `Pks` now raise a `SchemaParsingError` naming the field and the file:

```
Cannot infer the relation target for field "WorkspaceRef": the name ends in "Ref", which marks it
as a reference without naming the collection it points at. Declare the target explicitly, e.g.
WorkspaceRef: RelationField({ collection: "Workspaces" }).
```

**What to do:** declare the target with `RelationField({ collection: "..." })` /
`RelationsField({ collection: "..." })`, which is the recommended form regardless. Only the whole
trailing word is matched, so entity names that contain a suffix as a substring (`Referral`,
`UserIdentity`) are unaffected, as is every explicit declaration.

**Also in this release:** a select field's `values` is compared as a set, so reordering the options
alone no longer produces a migration. See [TYPE_MAPPING.md](./TYPE_MAPPING.md#select-field).

### 1.0.0 — the static migration parser is gone

The text-scanning migration reader has been removed. State reconstruction now has exactly one
implementation: execute the migration files in a simulated PocketBase JSVM
([EXECUTION_ENGINE.md](./EXECUTION_ENGINE.md)).

**What was removed**

| Removed | Replacement |
| --- | --- |
| `migrations.engine` config key | none — there is nothing to select |
| `MIGRATION_ENGINE` environment variable | none |
| `--engine` flag on `generate` and `status` | none |
| `SnapshotConfig.engine` | none |
| `parseMigrationOperations`, `convertPocketBaseMigration`, `applyMigrationOperations`, `findMigrationsAfterSnapshot` | `replayMigrations*` / `loadSnapshotWithMigrations` |

If you passed any of those, delete them — an unknown CLI flag is an error and an unknown config key
is ignored.

**Behaviour change:** a migration the engine cannot execute is now a **hard error**. The old reader
logged a `console.warn` and carried on, which silently reconstructed the wrong state and produced
wrong diffs. If you hit this, run `pocketbase-migrate lint <file>` to see what in the file is out
of reach; there is no lenient fallback to switch back to.

Most projects need no changes: hand-written data migrations still replay, because non-schema APIs
(`$dbx`, `$http`, record CRUD) are stubbed to inert no-ops by default rather than throwing.

**New in the same release**

- `pocketbase-migrate lint` — flags JavaScript that runs in the engine but not in PocketBase's goja
  runtime (`require`, `async`/`await`, `import`, class fields, …).
- `pocketbase-migrate status --verify [--pb-data <path>]` — reads PocketBase's `_migrations` table
  and fails on drift between disk and the database.
- `pocketbase-migrate generate --verify` (or `migrations.verify: true`) — executes `up()` and
  `down()` before writing and refuses a migration that does not roll back cleanly.

### 0.7.2 — `defineView()`

Read-only, SQL-backed view collections. Previously the only way to declare one was
`defineCollection({ type: "view", viewQuery })`, which is still supported;
`defineView()` turns the constraints (no write rules, no indexes) into compile errors. See
[VIEW_COLLECTIONS.md](./VIEW_COLLECTIONS.md).

### 0.7.0 — migration filtering

`generate` accepts positional filters restricting the diff to matching collection or field names
(regex supported), and skips destructive changes rather than aborting when `--force` is absent.

Full history: [package/CHANGELOG.md](../package/CHANGELOG.md).

## Best practices

### Schema organization

```
src/schema/
├── index.ts          # optional barrel; excluded from discovery
├── base.ts           # your own shared fragments; excluded from discovery
├── user.ts           # → Users
├── post.ts           # → Posts
├── comment.ts        # → Comments
└── projectStats.ts   # → ProjectStats (a view)
```

One collection per file, singular lowercase filename. Files that hold helpers rather than
collections belong in `schema.exclude`. Discovery is a flat `readdir` of `schema.directory` —
subdirectories are not scanned, so keep every schema file directly in that directory.

### Workflow

1. Edit a Zod schema.
2. `pocketbase-migrate status` — preview the diff.
3. `pocketbase-migrate generate` — one file per collection operation.
4. Read the generated file. It is ordinary JavaScript; check the `down()` too.
5. Apply to a development instance (`./pocketbase migrate up`, or just restart `serve`).
6. Commit the migration alongside the schema change, then apply in production.

Turn on `migrations.verify` if you want step 4's `down()` check enforced automatically.

### Version control

```gitignore
# Commit
pocketbase/pb_migrations/
src/schema/
pocketbase-migrate.config.js

# Ignore
pocketbase/pb_data/
node_modules/
dist/
```

Never edit or delete a migration that has already been applied anywhere. The tool reconstructs
state by replaying those files; changing one retroactively changes the state it reconstructs, and
the next diff will be wrong.

### Testing your schemas

```typescript
import { describe, expect, it } from "vitest";
import { PostSchema } from "../src/schema/post.js";

describe("PostSchema", () => {
  it("accepts a valid post", () => {
    expect(() => PostSchema.parse({ title: "Hi", content: "…", published: true, author: "abc" })).not.toThrow();
  });

  it("rejects an empty title", () => {
    expect(() => PostSchema.parse({ title: "", content: "…", published: true, author: "abc" })).toThrow();
  });
});
```

Note the export you validate against: `defineCollection()` returns a schema whose *description*
carries the collection metadata, so parsing works on either export — but keep the plain
`PostSchema` around for `z.infer`.

## Troubleshooting

### `generate` keeps emitting the same migration

The single most common symptom, and it always means the same thing: the engine replayed your
migrations and did **not** see the change the last migration was supposed to make, so the diff
still reports it.

1. Run `pocketbase-migrate status` and look at what it claims is missing.
2. Read the last generated migration for that collection. Does its `up()` actually apply that
   change?
3. For a view collection, check the query is applied with `unmarshal({ viewQuery: … }, collection)`
   and not `collection.viewQuery = …` — a direct assignment is silently dropped by PocketBase, so
   the migration reports success and changes nothing.

Anything the generator writes, the engine must be able to read back. A construct it cannot replay
produces exactly this loop.

### `SnapshotError: Failed to execute migration …`

The engine could not run a migration file. The message names the file and the phase (`evaluate`,
`up`, or `down`).

```bash
pocketbase-migrate lint pocketbase/pb_migrations/<file>.js
```

Common causes: Node-only globals (`require`, `process`, `fetch`, `setTimeout`), `async`/`await`,
`import`/`export`, or a PocketBase API the sandbox does not implement. The first three would also
fail in real PocketBase, so the lint findings are worth fixing regardless.

### Destructive changes blocked

```
Destructive changes detected. Use --force to proceed.
```

Review with `pocketbase-migrate status`, confirm the change is intended, then re-run with
`--force`. Deleting a *view* is not destructive — a view stores no data — so this never applies to
one.

### `status --verify` reports drift

`--verify` compares the files on disk against PocketBase's `_migrations` table:

- **pending** — on disk, never applied. Apply them (`./pocketbase migrate up`).
- **missing** — applied, no longer on disk. Restore the file, or run
  `./pocketbase migrate history-sync` to drop the dangling history rows.
- **out of order** — a pending file authored before an already-applied one. Usually a merge
  artifact; renaming the file to a later timestamp is the normal fix.

Reading the table needs **Node >= 22.5** (`node:sqlite`).

### Schema directory not found

```
ConfigurationError: Schema directory not found. Tried: …
```

`schema.directory` is resolved relative to the current working directory (and, for backward
compatibility, to a `shared/` subdirectory). Run the CLI from the project root, or pass
`--schema-dir`.

### No collections discovered

Check the console output for a per-file warning — the analyzer skips any file where no export's
Zod description carries `defineCollection()`/`defineView()` metadata, and logs which file it
skipped. Confirm the schema is wrapped in `defineCollection()`/`defineView()` and that the filename
is not caught by `schema.exclude`.

### Type errors on a field helper

Field helpers return real Zod types (`TextField()` → `z.ZodString`), so `.optional()`, `.nullable()`
and `z.infer` work as usual. `FileField()` and `FilesField()` are the exception: their input type
accepts `File`, and their output type is the stored filename string.

### Getting help

1. Check [GitHub Issues](https://github.com/dastron/pocketbase-zod-schema/issues)
2. Open a new issue with the schema, the generated migration, the command you ran, and your Node
   and PocketBase versions

## Additional Resources

- [API Reference](./API.md)
- [Execution Engine](./EXECUTION_ENGINE.md)
- [Configuration](./CONFIGURATION.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Changelog](../package/CHANGELOG.md)
- [PocketBase Documentation](https://pocketbase.io/docs/)
- [Zod Documentation](https://zod.dev/)
