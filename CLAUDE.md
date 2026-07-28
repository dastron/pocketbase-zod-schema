# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

Yarn 4 workspace monorepo. The publishable library is `package/` (`pocketbase-zod-schema`); the
repo root is a demo/host workspace that consumes it — `package/src/schema/*.ts` doubles as both the
library's example schemas *and* the schema directory that `pocketbase-migrate.config.js` points at,
and `pocketbase/pb_migrations/` holds the migrations generated from them.

## Commands

Run library commands from `package/`, host commands from the repo root.

```bash
# library (cd package/)
yarn test                              # vitest run
yarn test:watch
vitest run src/migration/__tests__/integration/view-collection.test.ts   # single file
vitest run -t "should parse an in-place view query update"              # single test by name
yarn test:property                     # property-based tests only
yarn typecheck                         # tsc --noEmit
yarn lint                              # eslint src --fix
yarn build                             # tsup (esm+cjs+dts)

# host (repo root)
yarn db:generate                       # schemas -> migration files
yarn db:status                         # preview changes without writing
yarn db:typegen                        # regenerate pocketbase-types.ts
yarn db:download && yarn db:start      # fetch + run PocketBase (applies migrations on start)
yarn test:e2e                          # drives real PocketBase; slow, fileParallelism off
```

Note `yarn` at the repo root may prompt Corepack to download Yarn 4. Binaries in
`node_modules/.bin/` (`tsc`, `vitest`, `eslint`, `tsup`) can be invoked directly to avoid that.

## Architecture

The pipeline is **Zod schemas → Analyzer → SchemaDefinition → Diff (vs. snapshot) → Filter →
Generator → one `.js` migration file per collection operation**. `package/src/cli/commands/generate.ts`
is the readable entry point for the whole flow.

**All collection metadata rides inside the Zod schema's `.describe()` string as JSON.** There is no
registry. `defineCollection()` (`schema/base.ts`) serializes `{collectionName, type, viewQuery,
permissions, indexes}` into the description; field helpers (`schema/fields.ts`) and
`RelationField`/`RelationsField` do the same per-field under the keys `__pocketbase_field__` and
`__pocketbase_relation__`. The analyzer's `extractors.ts` parses it back out. Consequence:
`defineCollection` *overwrites* the description, so it must wrap the schema, not the reverse.

**There is no snapshot file.** The "current database state" is reconstructed by *executing* the
generated migration files: `snapshot.ts:loadSnapshotWithMigrations()` delegates to the execution
engine (`migration/engine/`), which plans the file list (newest snapshot plus everything after it —
`migration-plan.ts`) and runs each `up()` in a `node:vm` sandbox emulating PocketBase's JSVM. There
is no static/regex reader anymore; a migration the engine cannot execute is a hard error, not a
warning. **Anything the generator writes, the engine must be able to read back** — otherwise
`db:generate` emits the same migration forever. When adding a new emitted construct, add a
round-trip test alongside `__tests__/integration/generated-migration-replay.test.ts` and
`generate-no-additional-migration.test.ts`. Tests that need to inspect a migration use
`__tests__/helpers/migration-executor.ts` (execute, then read the state and a before/after diff).

**Collection ids are random** (`pb_` + 15 chars, `utils/collection-id-generator.ts`), assigned in
the *diff* (`diff/index.ts`), not the generator; `users` is special-cased to `_pb_users_auth_`.
Field ids are deterministic (sha256 of the name). Regenerating from scratch therefore yields
different collection ids — idempotency depends entirely on the snapshot/replay path above.

**Collection types.** `base`, `auth` (system fields injected in `analyzer/converter.ts`, `manageRule`
only emitted here), and `view` (read-only, SQL-backed — see below). Changing an existing
collection's *type* is not diffed and produces no migration.

**Destructive-change detection has a single implementation**: `migration/validation.ts`
(`detectDestructiveChanges`, `hasDestructiveChanges`, `requiresForceFlag`,
`formatDestructiveChanges`, `summarizeDestructiveChanges`), exported under those clean names from
`/server`. The older `diff/destructiveness.ts` implementation and the `…Validation`-suffixed
aliases are gone.

### View collections

`defineView()` (`schema/view.ts`) declares a read-only collection backed by SQL, with the `sql`
tagged template for the query. PocketBase derives the fields by running the query, so:

- The generated migration emits `viewQuery` and **no** `fields`/`indexes` array; the diff never
  compares a view's fields (`diff/collections.ts` short-circuits) and the parser drops the derived
  `fields` PocketBase writes for itself — their `_clone_*` ids are regenerated on every save.
- Queries are compared with whitespace normalized (`normalizeSql`), and read back through
  `dedentSql` so the generator's indentation round-trips exactly.
- Query changes are applied in place with **`unmarshal({ viewQuery: ... }, collection)`**, never
  `collection.viewQuery = ...` — `viewQuery` lives on an embedded Go struct and a direct assignment
  from PocketBase's migration runtime is silently dropped (migration reports success, changes
  nothing).
- Views are read-only: only `listRule`/`viewRule`; deleting one is not destructive.

Full guide with PocketBase's query rules (outer `SELECT` must expose `id`; select relation columns
bare; no top-level `UNION`): `docs/VIEW_COLLECTIONS.md`.

## Conventions

- **Discovery is metadata-based, not name-based.** A file contributes a collection iff one of its
  exports is a Zod object whose description carries collection metadata — what `defineCollection()`/
  `defineView()` produce. Export names carry no meaning (no default → `*Collection` → `*Schema`
  preference order). A file with no metadata-carrying export is skipped with a console warning. One
  collection per file: two metadata-carrying exports in the same file, or the same `collectionName`
  declared in two files, is an error. See `docs/NAMING_CONVENTIONS.md`.
- **Field helpers over bare Zod** (`TextField`, `NumberField`, `RelationField`, …) — they carry
  explicit PocketBase type metadata instead of relying on structural inference. Without a helper,
  field types fall back to loose structural Zod mapping (`z.string()` → text, `z.enum([...])` →
  select, …) — never on field *names*. Relations in particular are explicit-only
  (`RelationField`/`RelationsField`); a bare `z.array(z.string())` maps to `json`, not a relation.
  Auth collections are explicit too — `type: "auth"` must be set in `defineCollection()`; it is
  never inferred from the presence of `email`/`password` fields.
- **Test style**: no vitest snapshots anywhere. Tests build a `SchemaDefinition`, run
  `compare()` → `generate()` into an `os.tmpdir()` directory, then assert with `toContain` or by
  parsing the output and comparing structurally. `__tests__/fixtures/reference-migrations/` holds
  real PocketBase-authored migrations used as ground truth — regenerate them from an actual
  PocketBase instance rather than hand-writing them.
- Entry points are split for browser safety: `index.ts` (schema, field helpers, permission
  templates) is browser-safe, `server.ts` adds the migration pipeline and programmatic CLI API
  (Node only). Only `.` and `/server` are published (`package/package.json` `exports`); the CLI
  binary is wired via `bin`, not a subpath export.

## Docs

`docs/` was audited and corrected against the source; treat it as accurate. Start from
`docs/API.md` (exports, signatures, CLI flags) and `docs/EXECUTION_ENGINE.md` (how migrations are
read back). `.kiro/` — steering files describing a different project, plus a spec for the deleted
static parser — has been removed; it was gitignored, so nothing is missing from the repo.

When you change behavior, update the doc that covers it: CLI flags and config keys live in
`docs/CONFIGURATION.md` and the CLI section of `docs/API.md`; Zod→PocketBase mapping rules in
`docs/TYPE_MAPPING.md`; engine surface in `docs/EXECUTION_ENGINE.md`; breaking changes get an entry
in `docs/MIGRATION_GUIDE.md#version-upgrade-notes`. `package/CHANGELOG.md` is generated by Release
Please — never hand-edit it.
