# Migration Execution Engine

The execution engine reconstructs the current database schema by **executing**
PocketBase JS migration files in a simulated PocketBase JSVM, instead of
statically parsing them with regexes. Migrations that use loops, helper
functions, conditionals, variable indirection, or computed values are
reconstructed correctly — constructs the legacy static parser silently
drops.

## Why

PocketBase runs migrations with [goja](https://github.com/dop251/goja), a Go
implementation of JavaScript (ES5.1 + most of ES6). Migration files are real
programs: they can loop over field definitions, build names dynamically, and
call helper functions. A static parser can only recognize an enumerated list
of literal statement shapes; everything else is invisible, which silently
reconstructs the wrong state and produces incorrect diffs.

The engine mirrors what PocketBase itself does on `migrate up`:

1. Evaluate the file in an isolated context. The file's `migrate(up, down)`
   call registers its closures.
2. Run `up(app)` against the current state **transactionally**: state is
   cloned, the migration is applied to the clone, and the clone is committed
   only if `up()` completes without throwing.
3. `down()` closures are captured but never executed.

State reconstruction = execute the latest `*_collections_snapshot.js`
(native snapshot files call `app.importCollections(snapshot, ...)`, which
the engine implements natively), then execute every later migration in
timestamp order.

## Architecture

`package/src/migration/engine/`:

| Module | Responsibility |
| --- | --- |
| `globals.ts` | Builds the sandbox global surface a migration sees |
| `runner.ts` | Evaluates one file in a `node:vm` context, runs `up()` transactionally |
| `replayer.ts` | Folds an ordered file list (or a pb_migrations directory) into a final state |
| `store.ts` | `CollectionStore` — in-memory state keyed by collection id, with clone/commit transaction support |
| `app.ts` | `SimulatedApp` — the `app` handed to `up()` |
| `collection.ts` | Runtime `Collection` class (live `fields` list, real `indexes` array) |
| `fields-list.ts` | `FieldsList` — add/addAt/removeById/removeByName/getById/getByName with PocketBase semantics |
| `fields.ts` | `Field` + the 14 typed field constructors |
| `unmarshal.ts` | `unmarshal(data, dst)` with Go `json.Unmarshal` merge semantics (arrays replace wholesale) |

The final store converts to the existing internal model
(`rawCollectionsToSnapshot` → `CollectionSchema`), so the diff and generator
pipelines are unchanged.

The sandbox is a `node:vm` context with **no Node globals** — no `require`,
`process`, or `fs` — approximating goja, where none of those exist either.
Node's JavaScript is a superset of goja's, so any goja-valid migration
executes identically for schema-shaped code.

## Supported API surface

Implemented with real semantics:

- `migrate(up, down)` (down is captured, never executed)
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

## Configuration

The engine is the **default**. The legacy static parser remains available as
an explicit escape hatch.

| Source | Setting |
| --- | --- |
| Config file | `migrations.engine: "runtime" \| "static"` |
| Environment | `MIGRATION_ENGINE=runtime\|static` |
| CLI | `pocketbase-migrate generate --engine static`, `pocketbase-migrate status --engine static` |
| Programmatic | `loadSnapshotWithMigrations({ migrationsPath, engine, engineOptions })` |

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

## Behavior change vs. the static parser

The static parser swallowed every failure with a `console.warn` and kept
going, which silently reconstructed the wrong state. In runtime mode a
migration that cannot be executed **fails hard** with a
`MigrationExecutionError` (wrapped in `SnapshotError`) naming the file and
phase (`evaluate` or `up`). This is intentional: a state reconstruction you
cannot trust is worse than an error.

If you hit a failing migration you cannot fix immediately, `--engine static`
(or `migrations.engine: "static"`) restores the legacy lenient behavior.

## Caveats

- **The engine is not goja.** It executes migrations with Node's JavaScript
  engine, a superset of goja's. A migration that uses Node-only APIs or
  post-goja syntax will execute in the engine but fail in real PocketBase.
  (A goja-compatibility lint is on the roadmap.)
- **Not a security boundary.** The vm context has no Node globals, but
  `node:vm` is not a hardened sandbox. Migration files are executed as
  trusted first-party code — the same trust the previous
  `new Function`-based parser (and PocketBase itself) already placed
  in them.
- **Data operations are not simulated.** Record CRUD and raw SQL through
  `$dbx`/`app.db()` are inert no-ops in lenient mode; only schema state is
  tracked.
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
  and the runner (transactions, timeouts, strictness, `$app` binding).
- `engine/__tests__/reference-fixtures.test.ts` — executes every captured
  native-PocketBase migration and asserts the resulting state, plus parity
  with the static parser on literal-only fixtures.
- `engine/__tests__/dynamic-migrations.test.ts` +
  `__tests__/fixtures/dynamic-migrations/` — loops, helper functions,
  conditionals, indirection, `removeById`, computed `unmarshal`; includes a
  test documenting that the static parser misses these.
- `__tests__/integration/engine-loop-detection.test.ts` — the round-trip
  idempotency contract via execution: schema → generate → execute → compare
  → zero diff.
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
  workflow. This is what keeps the caveats below honest.

See `EXECUTION_ENGINE_ROADMAP.md` for planned work.
