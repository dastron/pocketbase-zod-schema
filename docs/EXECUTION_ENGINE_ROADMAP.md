# Execution Engine Roadmap

Future steps for the migration execution engine, ordered by expected value.
The engine (see `EXECUTION_ENGINE.md`) currently executes migrations in a
simulated PocketBase JSVM for state reconstruction and e2e state comparison;
these items extend it toward full-fidelity verification against real
PocketBase.

> **Done:** the e2e "real apply" stage
> (`tests/e2e/components/real-apply-verifier.ts`). Every scenario now applies
> its library-generated migration with a real PocketBase binary
> (`pocketbase migrate up`), reads the collections back through
> `GET /api/collections`, and diffs that against the engine's simulation of
> the same files. Applying cleanly is a hard gate; the state agreement is
> reported as `realApplyScore`.

> **Done:** down-migration verification (`engine/verify.ts`,
> `engine/state-compare.ts`). The runner executes `down()` on request
> (`executeMigrationDownSource`/`File`, reverse registration order, same
> transactional semantics as `up`), and `verifyMigrationSources`/`Files` runs
> up → down → compare-against-baseline over a sequence. Wired into the
> reference and dynamic fixture suites and into a generated-migration
> round-trip suite; `generate --verify` (`migrations.verify`,
> `MIGRATION_VERIFY`) runs the pass before writing and refuses to write a
> migration that does not roll back. See `EXECUTION_ENGINE.md`.

> **Done:** the e2e equivalence scores are gates.
> `stateEquivalenceScore` (native vs library, both executed) and
> `realApplyScore` (real PocketBase vs the engine) are asserted per scenario
> against `minimumStateEquivalenceScore` / `minimumRealApplyScore`, both
> defaulting to 100. Scenarios that pin a lower baseline document the gap
> they are tracking in `fixtures/test-scenarios.ts`; raising a score above
> its baseline means the baseline should move up with it. The legacy
> text-similarity score is informational — logged and reported, never
> asserted.

> **Done:** every e2e scenario now scores 100 on all three stages, and no
> scenario pins a baseline below the default. Four generator defects closed:
> `pattern` carried onto `email`/`date` fields from the Zod validator (field
> options are now filtered to the ones each PocketBase type stores),
> `password` emitted as `type: "text"` instead of PocketBase's `password`
> type, `tokenKey` missing its min 30 / max 60, and a fixed collection id in
> the auth index names, which made a second auth collection collide. The rest
> were harness gaps — Zod schemas that under-described the scenario, and a
> native collection built without the `created`/`updated` autodate fields
> PocketBase's own collection form adds. See `tests/e2e/README.md`.

> **Done:** the e2e regex parsers are gone. `migration-inspector.ts` executes
> a migration file through the engine and reports the collections it touched;
> `native-migration-generator.ts` and `library-cli.ts` both delegate to it,
> which removed two ~110-line brace scanners and the duplicated baseline-store
> seeding in `engine-state-comparator.ts`.

> **Done:** `_migrations` table awareness and partial replay
> (`engine/applied-migrations.ts`, `engine/migration-plan.ts`).
> `readAppliedMigrations(pbData)` reads PocketBase's table read-only through
> `node:sqlite`; `planMigrationReplay` starts the replay at the newest
> *applied* snapshot, executes only the applied set, and names what is
> pending, missing, or authored out of order. Wired into
> `replayMigrationsDirectory({ applied })`,
> `loadSnapshotWithMigrations({ appliedMigrations })`, and a
> `status --verify [--pb-data <path>]` that fails on drift. See
> `EXECUTION_ENGINE.md`.

> **Done:** `$dbx` / `Record` data simulation (`engine/records.ts`,
> `engine/dbx.ts`, `engine/data-api.ts`, `engine/expression.ts`). Opt in with
> `records: "simulate"` for an in-memory row store per collection: `Record`
> with the typed getters, `app.save`/`delete`, the record finders, PocketBase
> filter syntax with bindings, the `$dbx` builders, and a single-table
> `SELECT`/`INSERT`/`UPDATE`/`DELETE` subset behind `app.db()`. Rows live on
> `CollectionStore`, so they roll back with the schema. Anything outside the
> subset is reported, not guessed at.

> **Done:** the goja-compatibility linter (`engine/goja-lint.ts`). An
> acorn-based pass flagging unknown globals (checked against the sandbox
> surface itself, so it cannot drift), syntax goja's parser rejects,
> `import`/`export`, and `async`/`await`/`Promise`; `unsupported-api`
> execution warnings are folded in as warning-severity findings. Exposed as
> `pocketbase-migrate lint` and run as part of `generate --verify`.

## 1. Deprecate, then remove, the static parser

`migration-parser.ts` (~870 lines) remains for `engine: "static"`. Plan:

- ~~Current release: runtime default, static available, documented.~~ Done.
- ~~Next minor: emit a deprecation warning when static mode is selected.~~
  Done — `loadSnapshotWithMigrations` warns once per process when
  `engine: "static"` resolves (from config, `MIGRATION_ENGINE`, `--engine`,
  or a programmatic call), the CLI help and docs mark the option deprecated.
- Next major: remove `migration-parser.ts` scanning passes and the
  `engine` config option; keep `extractTimestampFromFilename`, which
  `migration-plan.ts` uses for file discovery. `findMigrationsAfterSnapshot`
  goes with the static path — the replayer now plans its own file list.

Blockers to removal — both closed:

- ~~the e2e regex parsers must be gone first~~ (done, see above).
- ~~parity tests must cover every fixture class~~ (done). Coverage map:
  created_* reference fixtures in `engine/__tests__/reference-fixtures.test.ts`,
  native snapshots in `engine/__tests__/snapshot-execution.test.ts`,
  generator-emitted migrations (create base/auth/view, field
  add/remove/update, index add/remove, rules, view queries, deletes) in
  `__tests__/integration/engine-parity.test.ts` through the full
  `loadSnapshotWithMigrations` funnel with a zero follow-up diff. The same
  suite pins the two classes where parity intentionally does not hold:
  updated_* reference fixtures (PocketBase addresses collections by id,
  which the static parser drops) and dynamic fixtures (unreadable statically
  by design) — in both, the engine is strictly more correct, so removal
  cannot regress them.

## 2. quickjs-emscripten isolation upgrade

`node:vm` is not a hardened sandbox. If untrusted migration sources ever
become a real scenario (e.g. running the tool against third-party project
dumps), swap the runner's evaluation layer for quickjs-emscripten (WASM,
deterministic, truly isolated). The runner's interface (`executeMigrationSource`)
already isolates evaluation from state application, so this is a contained
change. Not worth the marshalling complexity for first-party use.

## 3. Replay caching

Replaying a large pb_migrations directory on every `generate`/`status` is
O(files). Cache the reconstructed snapshot keyed by a hash of the file list
+ sizes + mtimes, invalidating on any change. Only worth doing if real
projects report slow reconstruction (hundreds of migrations).

## Known gaps to keep in mind

- Field id autogeneration uses random suffixes; PocketBase uses
  `type + crc32(name)`. Implement crc32 for byte-exact parity if migrations
  generated from engine-reconstructed state ever need identical ids.
- Auth collection server-side defaults (token options, email templates) are
  only tracked when declared by a migration/snapshot. If the converter ever
  starts diffing those, the engine's `Collection` defaults must widen to
  match.
- `collection.fields[0]` numeric indexing would need a Proxy wrapper around
  `FieldsList` — add only if a real-world migration is found using it.
- The `app.db()` SQL subset is single-table. Joins, CTEs, aggregates and
  subqueries are reported as unsupported rather than approximated; widen it
  only when a real data migration needs one.
- The goja lint is static, so an API reached through a computed name
  (`globalThis[name]`) is invisible to it. The execution-warning fold-in
  covers the cases that actually run.
- Record simulation starts from an empty store. Seeding it from a real
  database would let a data migration be rehearsed against production-shaped
  data; `readAppliedMigrations` already proves the pb_data read path works.
