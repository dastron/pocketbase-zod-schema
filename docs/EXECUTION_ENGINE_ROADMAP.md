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

## 1. Down-migration verification

The engine captures `down()` closures but never runs them. Add
`executeDown()` to the runner and a verification mode: execute `up`, then
`down`, and assert the state returns to the baseline. Wire it into the
round-trip integration tests per fixture, then have `generate` optionally
self-verify new migrations before writing them.

## 2. Promote the e2e equivalence scores to gates

`e2e-workflow.test.ts` hard-asserts only that both migrations execute and
that the library migration applies to real PocketBase; the two agreement
scores — `stateEquivalenceScore` (native vs library, both executed) and
`realApplyScore` (real PocketBase vs the engine) — are logged. Once a few
runs establish the baseline (expected: 100 for most scenarios), assert both
per scenario and let regressions fail CI. The legacy text-similarity score
can then become informational only.

## 3. Replace the e2e regex parsers with the engine

`native-migration-generator.ts` (`parseCollectionsFromMigration`) and
`library-cli.ts` contain duplicate regex-based migration parsers feeding the
text comparison. Both should execute the file through the engine and read
collections from the store, removing ~200 lines of fragile scanning and a
third parallel parser implementation.

## 4. `_migrations` table awareness / partial replay

PocketBase records applied migrations in its internal `_migrations` table.
Today the engine replays snapshot + everything after it, assuming all files
are applied. Add:

- An optional applied-files list (read from a live database or `pb_data`)
  so replay can start from an arbitrary checkpoint.
- Detection of migrations present on disk but not applied (and vice versa)
  for a `status --verify` command.

## 5. `$dbx` / `Record` data simulation

Lenient mode currently no-ops record and query APIs. For migrations that
seed or transform data, add an in-memory record store per collection:
`new Record(collection)`, `record.set/get`, `app.save(record)`,
`app.findRecordById`, basic `$dbx` DML. Schema diffing does not need this;
it matters for validating hand-written data migrations before they run in
production.

## 6. Goja-compatibility linter

The engine runs Node's JS, a superset of goja's. A migration can pass the
engine yet fail in PocketBase (Node-only APIs, unsupported syntax). Add a
lint pass that flags:

- References to Node/browser globals absent from the sandbox surface
  (anything that resolves to an inert stub is already recorded as an
  `unsupported-api` warning — surface those prominently).
- Syntax beyond goja's supported set (parse with an ES2017-ish target).
- `async`/`await`/`Promise` usage (goja migrations are synchronous).

## 7. Deprecate, then remove, the static parser

`migration-parser.ts` (~870 lines) remains for `engine: "static"`. Plan:

- Current release: runtime default, static available, documented.
- Next minor: emit a deprecation warning when static mode is selected.
- Next major: remove `migration-parser.ts` scanning passes and the
  `engine` config option; keep `findMigrationsAfterSnapshot` and
  `extractTimestampFromFilename` (file discovery, still used by the
  replayer).

Blockers to removal: parity tests must cover every fixture class, and the
e2e regex parsers (item 3) must be gone first.

## 8. quickjs-emscripten isolation upgrade

`node:vm` is not a hardened sandbox. If untrusted migration sources ever
become a real scenario (e.g. running the tool against third-party project
dumps), swap the runner's evaluation layer for quickjs-emscripten (WASM,
deterministic, truly isolated). The runner's interface (`executeMigrationSource`)
already isolates evaluation from state application, so this is a contained
change. Not worth the marshalling complexity for first-party use.

## 9. Replay caching

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
