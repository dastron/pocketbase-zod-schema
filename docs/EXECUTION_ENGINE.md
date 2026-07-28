# Migration Execution Engine

The execution engine reconstructs the current database schema by **executing**
PocketBase JS migration files in a simulated PocketBase JSVM. It is the only
way migrations are read. Migrations that use loops, helper functions,
conditionals, variable indirection, or computed values are reconstructed
correctly.

## Why

PocketBase runs migrations with [goja](https://github.com/dop251/goja), a Go
implementation of JavaScript (ES5.1 + most of ES6). Migration files are real
programs: they can loop over field definitions, build names dynamically, and
call helper functions. Reading the file text can only recognize an enumerated
list of literal statement shapes; everything else is invisible, which silently
reconstructs the wrong state and produces incorrect diffs. Executing the file
is the only way to know what it does.

The engine mirrors what PocketBase itself does on `migrate up`:

1. Evaluate the file in an isolated context. The file's `migrate(up, down)`
   call registers its closures.
2. Run `up(app)` against the current state **transactionally**: state is
   cloned, the migration is applied to the clone, and the clone is committed
   only if `up()` completes without throwing.
3. `down()` closures are captured. State reconstruction never runs them —
   only [verification](#down-migration-verification) does, on request.

State reconstruction = execute the latest `*_collections_snapshot.js`
(native snapshot files call `app.importCollections(snapshot, ...)`, which
the engine implements natively), then execute every later migration in
timestamp order.

## Architecture

`package/src/migration/engine/`:

| Module | Responsibility |
| --- | --- |
| `globals.ts` | Builds the sandbox global surface a migration sees |
| `runner.ts` | Evaluates one file in a `node:vm` context, runs `up()` (or `down()`) transactionally |
| `replayer.ts` | Folds an ordered file list (or a pb_migrations directory) into a final state |
| `store.ts` | `CollectionStore` — in-memory state keyed by collection id, with clone/commit transaction support |
| `app.ts` | `SimulatedApp` — the `app` handed to `up()` |
| `collection.ts` | Runtime `Collection` class (live `fields` list, real `indexes` array) |
| `fields-list.ts` | `FieldsList` — add/addAt/removeById/removeByName/getById/getByName with PocketBase semantics |
| `fields.ts` | `Field` + the 14 typed field constructors |
| `unmarshal.ts` | `unmarshal(data, dst)` with Go `json.Unmarshal` merge semantics (arrays replace wholesale) |
| `verify.ts` | Round-trip verification: up, then down, then compare against the baseline |
| `state-compare.ts` | Structural comparison of two states, naming each divergence |
| `applied-migrations.ts` | Reads PocketBase's `_migrations` table out of `pb_data/data.db` |
| `migration-plan.ts` | Chooses the files to replay; names pending / missing / out-of-order ones |
| `records.ts` | `Record` + the in-memory row store (opt-in record simulation) |
| `expression.ts` | One condition grammar for PocketBase filters and SQL `WHERE` |
| `dbx.ts` | `$dbx` builders and the `app.db()` SQL subset |
| `data-api.ts` | The record finders installed on `app` when records are simulated |
| `goja-lint.ts` | Static check for JavaScript that runs here but not in goja |

The final store converts to the existing internal model
(`rawCollectionsToSnapshot` → `CollectionSchema`), so the diff and generator
pipelines are unchanged.

The sandbox is a `node:vm` context with **no Node globals** — no `require`,
`process`, or `fs` — approximating goja, where none of those exist either.
Node's JavaScript is a superset of goja's, so any goja-valid migration
executes identically for schema-shaped code.

## Supported API surface

Implemented with real semantics:

- `migrate(up, down)` (down is captured; executed only by verification)
- `new Collection({...})`, property assignment (`collection.listRule = ...`),
  `collection.indexes` as a real array (`push`, `findIndex`, `splice`)
- `new Field({...})` and typed constructors: `TextField`, `EmailField`,
  `URLField`, `NumberField`, `BoolField`, `DateField`, `SelectField`,
  `RelationField`, `FileField`, `JSONField`, `EditorField`, `GeoPointField`,
  `AutodateField`, `PasswordField`
- `collection.fields`: `add`, `addAt` (position preserved; an existing id is
  moved), `removeById`, `removeByName`, `getById`, `getByName` (returns the
  live object), iteration
- `unmarshal(data, dst)` — objects merge key by key, arrays replace
  wholesale (`unmarshal({indexes: []}, collection)` clears indexes)
- `app.findCollectionByNameOrId(nameOrId)` — matches by id, then name, with
  `_pb_users_auth_` ↔ `users` aliasing; **throws** on a miss, like real
  PocketBase
- `app.save(collection)` — upsert by id; assigns missing field ids
- `app.delete(collection)`
- `app.importCollections(rawArray, deleteMissing)` — what native snapshot
  migrations call
- `$app` — bound to the same transactional app while `up()` runs
- `console.*` — captured as warnings, not printed

Stubbed (strictness-controlled): `$os`, `$dbx`, `$security`, `$filesystem`,
`$http`, `$mails`, `$template`, `Record`, `DateTime`, and any data-layer
`app.*` method (`findRecordById`, `db()`, ...).

- `strictness: "lenient"` (default): the call records a warning and returns
  an inert chainable no-op, so schema-only replay of hand-written data
  migrations still succeeds.
- `strictness: "strict"`: the call throws.

`Record`, `$dbx` and the data-layer `app.*` methods stop being stubs when
[record simulation](#record-and-dbx-simulation) is turned on.

## Configuration

The engine is the only reader; there is nothing to select. What remains
configurable is verification, the data directory, and the engine's own
options.

| Source | Setting |
| --- | --- |
| Config file | `migrations.verify: boolean`, `migrations.dataDirectory: string` |
| Environment | `MIGRATION_VERIFY=true\|false`, `MIGRATION_DATA_DIR=<path>` |
| CLI | `pocketbase-migrate generate --verify`, `pocketbase-migrate status --verify [--pb-data <path>]`, `pocketbase-migrate lint` |
| Programmatic | `loadSnapshotWithMigrations({ migrationsPath, engineOptions, appliedMigrations })` |

Programmatic API (also exported from `pocketbase-zod-schema/migration/engine`):

```ts
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
// result.snapshot  -> SchemaSnapshot (same shape the diff engine consumes)
// result.store     -> CollectionStore for further execution
// result.warnings  -> stubbed API calls, console output, etc.
```

## Applied migrations and partial replay

By default replay assumes every file on disk has been applied. That is right
most of the time and wrong in exactly the cases that matter: a migration
written but not yet run, or a file deleted from disk after it ran. Both
reconstruct a state the database was never in, and therefore a wrong diff.

PocketBase records what it has run in an internal `_migrations` table. The
engine can read it — from `pb_data/data.db`, read-only, with Node's built-in
`node:sqlite` (Node >= 22.5) — and replay only the applied prefix, starting
from the newest snapshot that was itself applied:

```ts
import {
  readAppliedMigrations,
  planMigrationReplay,
  replayMigrationsDirectory,
} from "pocketbase-zod-schema/migration/engine";

const applied = readAppliedMigrations("pocketbase/pb_data");
const plan = planMigrationReplay("pocketbase/pb_migrations", { applied });
// plan.filesToReplay -> applied files, in order, from the applied snapshot on
// plan.pending       -> on disk, never applied
// plan.missing       -> applied, no longer on disk
// plan.outOfOrder    -> pending files authored before an already-applied one
// plan.inSync        -> disk and the database agree exactly

const result = replayMigrationsDirectory("pocketbase/pb_migrations", { applied });
```

`readAppliedMigrations` accepts a pb_data directory or a `data.db` path, and
separates PocketBase's own Go core migrations (`*.go`) from JS ones, so a file
that never existed on disk is not reported as missing.
`appliedMigrationsFromList(["1712345678_created_Posts.js"])` builds the same
structure from an explicit list when there is no database to read.

`loadSnapshotWithMigrations({ appliedMigrations })` threads it through the
normal state reconstruction, and `readAppliedMigrationsIfPresent` returns null
instead of throwing when there simply is no database yet.

### `status --verify`

The CLI side. `--verify` reads the table, reconstructs state from the applied
set rather than from disk, prints the drift, and exits non-zero if there is
any:

```
🧾 Applied Migrations
─────────────────────

  Database: pocketbase/pb_data/data.db
  Applied: 12
  Replaying: 12

  1 migration(s) on disk not applied to the database:
    + 1712345999_created_Comments.js
```

`--pb-data <path>` points at another location (or `migrations.dataDirectory` /
`MIGRATION_DATA_DIR`); without it, the pb_data directory next to the
migrations directory is used. Passing `--pb-data` without `--verify` still
reconstructs from the applied set, it just does not fail on drift.

## Record and `$dbx` simulation

Schema reconstruction does not need rows: a migration that seeds or rewrites
data does not change the shape of a collection. What rows are for is the other
job — running a hand-written data migration and seeing what it actually does,
before it touches production.

`records: "simulate"` replaces the `Record`/`$dbx`/data-layer stubs with an
in-memory row store per collection:

```ts
executeMigrationFile("pb_migrations/1712345678_backfill_slugs.js", store, {
  records: "simulate",
});

store.records.list(collectionId); // the rows the migration left behind
```

Implemented with real semantics:

- `new Record(collection)`, `record.get/set`, `getString`/`getBool`/`getInt`/
  `getFloat`/`getDateTime`/`getStringSlice`, `load`, `publicExport`,
  `originalCopy`, `setPassword`/`validatePassword`
- `app.save(record)` (assigns a 15-character id), `app.delete(record)`
- `app.findRecordById`, `findRecordsByIds`, `findAllRecords`,
  `findFirstRecordByData`, `findAuthRecordByEmail`, `findRecordsByFilter`,
  `findFirstRecordByFilter`, `countRecords`, `runInTransaction`
- PocketBase filter syntax with `{:param}` bindings, `sort`/`limit`/`offset`
- `$dbx.exp`, `hashExp`, `and`, `or`, `not`, `in`, `notIn`, `like`, `notLike`,
  `orLike`, `between`, `notBetween`
- `app.db().newQuery(sql).bind(params).execute()/all()/one()/row()` over a
  single-table `SELECT` / `INSERT` / `UPDATE` / `DELETE` subset

Rows live on `CollectionStore`, so they inherit the runner's transaction
semantics: a migration that throws halfway through a data rewrite leaves
neither schema nor records behind. Deleting a collection drops its rows.

Anything outside the SQL subset — joins, CTEs, aggregates — is reported rather
than guessed at: a warning in lenient mode, a throw in strict mode. The same
holds for a filter expression the grammar does not cover.

Record simulation is **off by default**. Turning it on changes behavior for
data migrations that currently no-op: `app.findRecordById` starts throwing
`sql: no rows in result set` against an empty store, exactly as it would
against an empty database.

## goja-compatibility lint

The engine runs Node's JavaScript, a superset of goja's. A migration can
replay here, pass round-trip verification, and still fail when PocketBase
reaches it. `lintMigrationSource`/`File`/`Files` parse the file with acorn and
report what would not survive the trip:

| Rule | What it catches |
| --- | --- |
| `unknown-global` | A free identifier that is neither declared in the file nor part of the PocketBase JSVM surface or the ECMAScript library goja implements — `require`, `process`, `Buffer`, `fetch`, `setTimeout`, `window` |
| `unsupported-syntax` | Class fields, private members, static blocks, BigInt literals, `import.meta`, and anything acorn only parses past ES2022 |
| `module-syntax` | `import`/`export` and dynamic `import()` — migrations run as scripts |
| `async` | `async`, `await`, `for await`, `Promise` — goja runs migrations synchronously and nothing drains the job queue |
| `unsupported-api` | Folded in from execution warnings: a call that resolved to an inert stub did nothing here and will do something in production. Reported as a warning, not an error |

The accepted global list is derived from the sandbox itself, so it cannot
drift from what the engine actually provides; `allowedGlobals` extends it for
a PocketBase build with its own bindings.

```bash
pocketbase-migrate lint                              # every file in the migrations directory
pocketbase-migrate lint pb_migrations/1712_seed.js   # one file
pocketbase-migrate lint --no-execute                 # static checks only, no stub warnings
```

`lint` exits non-zero when any file has an error-severity finding. Because
stubbed-API warnings only exist once a file has run, `lint` executes each
migration first (failures there are ignored — that is generate/status's job).

`generate --verify` runs the same lint over the migrations it is about to
write and refuses to write one that would not run in goja.

## Down-migration verification

A `down()` that does not actually roll back is invisible until someone runs
`pocketbase migrate down` on a real database — state reconstruction only ever
runs `up()`. Verification closes that gap by executing both directions:

1. `up()` runs against a baseline state.
2. `down()` runs against the result, from a **fresh evaluation of the file** —
   the way PocketBase runs it, as a separate invocation that cannot observe
   anything `up()` left in the file's module scope.
3. The resulting state is compared against the baseline. Anything left behind
   (a field not restored, an index still present, a rule not reverted) is
   reported per difference.

```ts
import { verifyMigrationFiles, verifyMigrationRoundTrip } from "pocketbase-zod-schema/migration/engine";

const report = verifyMigrationFiles(["pb_migrations/1712345678_created_Posts.js"]);
// report.ok        -> every migration applied and reversed cleanly
// report.failures  -> the results that did not
// report.store     -> state after every up(), as replay would build it

for (const failure of report.failures) {
  console.log(failure.file, failure.differences.map((d) => d.message));
}
```

A sequence is verified the way it will be applied: each file is round-tripped
against the state its predecessors leave behind, then its `up()` is committed
before moving on. Failures are returned rather than thrown — the caller
decides whether an unreversible migration is fatal.

Two states are compared structurally, not semantically, because a rollback
that leaves the schema *semantically* equal but structurally different is
exactly what verification exists to catch. Normalization is limited to
differences PocketBase itself does not make:

- An undeclared option and one set to its Go zero value (`""`, `0`, `false`,
  `[]`) express the same constraint. Two *declared* values are always compared.
- API rules are exempt: `null` (superuser only) and `""` (public) are
  different permissions, so only absent ≡ `null` holds.
- Index order is not meaningful; index lists are compared as sets.
- Field order is compared only under `strictFieldOrder`.

### Verifying at generate time

`generate --verify` (or `migrations.verify: true`) runs the pass over the
migrations it is about to write, starting from the state the existing
migrations reconstruct. Nothing is written if a migration fails to apply or
fails to roll back:

```
🔁 Verifying Migration
──────────────────────
✗ Migration verification failed - no files were written.

  1712345678_updated_Posts.js: down() did not restore the previous state
    [Posts] index missing from state after down(): CREATE INDEX `idx_posts_title` ...
```

It is off by default: verification executes every existing migration to build
the baseline, which costs a full replay, and a rollback you never intend to
run is not a reason to block generating one that works forward. `--no-verify`
overrides the config file for a single run.

## Failures are hard failures

The reader this replaced swallowed every failure with a `console.warn` and
kept going, which silently reconstructed the wrong state. A migration that
cannot be executed now **fails hard** with a `MigrationExecutionError`
(wrapped in `SnapshotError`) naming the file and phase (`evaluate`, `up` or
`down`). This is intentional: a state reconstruction you cannot trust is
worse than an error.

If you hit a migration the engine will not run, `pocketbase-migrate lint`
reports what in the file is out of reach, and there is no lenient fallback to
fall back to — please open an issue describing the file that would not
execute.

## Caveats

- **The engine is not goja.** It executes migrations with Node's JavaScript
  engine, a superset of goja's. A migration that uses Node-only APIs or
  post-goja syntax will execute in the engine but fail in real PocketBase —
  which is what the [goja lint](#goja-compatibility-lint) exists to catch. The
  lint is static, so it cannot see an API reached only through a computed
  name.
- **Not a security boundary.** The vm context has no Node globals, but
  `node:vm` is not a hardened sandbox. Migration files are executed as
  trusted first-party code — the same trust the previous
  `new Function`-based parser (and PocketBase itself) already placed
  in them.
- **Data operations are opt-in and partial.** Without `records: "simulate"`,
  record CRUD and raw SQL are inert no-ops and only schema state is tracked.
  With it, rows are real but the SQL is a single-table subset and the store
  starts empty — it models what a migration *does*, not the production data
  it will do it to.
- **Applied-migration reading needs Node >= 22.5** for `node:sqlite`. On older
  runtimes, pass the applied list explicitly with `appliedMigrationsFromList`.
- **Field id generation differs.** PocketBase derives field ids from
  crc32(name); the engine uses a random suffix when a migration saves a
  field without an id. Diffing matches fields by name, so this is benign.
- **Auth defaults are bounded.** Auth collections get the five system
  fields the converter tracks (`email`, `emailVisibility`, `verified`,
  `password`, `tokenKey`) when a migration omits them; other server-side
  auth defaults (token durations, templates) are kept only if the migration
  or snapshot declares them.
- `collection.fields[0]` numeric indexing is not supported — use
  `fields.at(0)` / `getById` / `getByName`. Neither the generator nor any
  observed native migration uses numeric indexing.

## Testing

- `engine/__tests__/` — unit suites for FieldsList, unmarshal, the store,
  the runner in both directions (transactions, timeouts, strictness, `$app`
  binding, reverse-order rollback), the state comparison, and the
  verification API.
- `engine/__tests__/applied-migrations.test.ts` — reading a real SQLite
  `_migrations` table, the replay plan in every drift shape (pending, missing,
  out-of-order, an unapplied snapshot on disk), and partial replay producing
  a smaller state than a full one.
- `engine/__tests__/record-simulation.test.ts` — Record semantics, the
  finders, the filter grammar, `$dbx` builders, the `app.db()` subset,
  rollback of record changes, and the proof that stub mode still no-ops.
- `engine/__tests__/goja-lint.test.ts` — every rule, the false-positive cases
  that matter (locals, destructuring, property names shadowing Node globals),
  and a pass over every captured fixture migration.
- `engine/__tests__/reference-fixtures.test.ts` — executes every captured
  native-PocketBase migration and asserts the resulting state, including that
  each creation fixture converts cleanly into the diff engine's model.
- `engine/__tests__/dynamic-migrations.test.ts` +
  `__tests__/fixtures/dynamic-migrations/` — loops, helper functions,
  conditionals, indirection, `removeById`, computed `unmarshal` — none of
  which exist until the code has run.
- `__tests__/integration/engine-loop-detection.test.ts` — the round-trip
  idempotency contract via execution: schema → generate → execute → compare
  → zero diff.
- `__tests__/integration/generated-migration-replay.test.ts` — anything the
  generator writes, the engine must read back: every construct the generator
  emits (create base/auth/view, field add/remove/update, index add/remove,
  rule updates, view-query updates, deletes) is replayed through
  `loadSnapshotWithMigrations` and must reconstruct the state it was
  generated for, with a zero follow-up diff.
- `engine/__tests__/down-verification.test.ts` — every captured native
  fixture must undo itself, verified in sequence. The two dynamic fixtures
  whose `down()` is deliberately a no-op are the ground truth that
  verification detects a rollback that does not roll back.
- `__tests__/integration/down-migration-round-trip.test.ts` — the reverse
  contract for generated migrations: creation, every kind of modification,
  and deletion must each return to the state they were generated against.
- `tests/e2e/components/engine-state-comparator.ts` — the e2e harness
  executes the native-captured and library-generated migrations and diffs
  the resulting states (semantic equivalence instead of text similarity).
- `tests/e2e/components/real-apply-verifier.ts` — the oracle: applies the
  library-generated migration with a **real PocketBase binary**
  (`pocketbase migrate up`), reads the collections back through
  `GET /api/collections`, and diffs that real state against the engine's
  simulation of the same files. Both sides start from the collections a
  freshly-initialized instance has, so a simulation that drifts from
  reality — or a migration PocketBase refuses to apply — fails the e2e
  workflow. This is what keeps the [caveats](#caveats) above honest.
