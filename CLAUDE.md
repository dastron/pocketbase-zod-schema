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

**There is no snapshot file.** The "current database state" is reconstructed by parsing the
generated migration files themselves: `snapshot.ts:loadSnapshotWithMigrations()` finds the newest
`*_collections_snapshot.js`, converts it via `pocketbase-converter.ts`, then replays every later
migration through `migration-parser.ts` + `applyMigrationOperations()`. **Anything the generator
writes, the parser must be able to read back** — otherwise `db:generate` emits the same migration
forever. The parser works by brace-scanning and `new Function()`-evaluating object literals with a
mocked `app`, so it is sensitive to what appears inside strings (it tracks `"`, `'` and backticks).
When adding a new emitted construct, add a round-trip test alongside
`__tests__/integration/idempotency.test.ts` and `generate-no-additional-migration.test.ts`.

**Collection ids are random** (`pb_` + 15 chars, `utils/collection-id-generator.ts`), assigned in
the *diff* (`diff/index.ts`), not the generator; `users` is special-cased to `_pb_users_auth_`.
Field ids are deterministic (sha256 of the name). Regenerating from scratch therefore yields
different collection ids — idempotency depends entirely on the snapshot/replay path above.

**Collection types.** `base`, `auth` (system fields injected in `analyzer/converter.ts`, `manageRule`
only emitted here), and `view` (read-only, SQL-backed — see below). Changing an existing
collection's *type* is not diffed and produces no migration.

**Two destructive-change implementations exist**: `diff/destructiveness.ts` (used by `DiffEngine`)
and `migration/validation.ts` (used by the CLI, re-exported aliased as
`detectDestructiveChangesValidation`). Changes to destructive-change policy usually need both.

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

- **Schema files**: one collection per file, singular lowercase filename (`user.ts` → `Users`);
  collection names are pluralized from the filename unless `collectionName` is set. Prefer a
  `export default defineCollection({...})` (the analyzer prefers the default export, then
  `*Collection`, then `*Schema`). See `docs/NAMING_CONVENTIONS.md`.
- **Field helpers over bare Zod** (`TextField`, `NumberField`, `RelationField`, …) — they carry
  explicit PocketBase type metadata instead of relying on structural inference. Relation detection
  also falls back to a naming convention (uppercase-first field names) for backward compatibility.
- **Test style**: no vitest snapshots anywhere. Tests build a `SchemaDefinition`, run
  `compare()` → `generate()` into an `os.tmpdir()` directory, then assert with `toContain` or by
  parsing the output and comparing structurally. `__tests__/fixtures/reference-migrations/` holds
  real PocketBase-authored migrations used as ground truth — regenerate them from an actual
  PocketBase instance rather than hand-writing them.
- Entry points are split for browser safety: `index.ts` (enums/mutator/schema) is browser-safe,
  `server.ts` adds `migration/*` and CLI utilities (Node only).

## Stale docs to distrust

`.kiro/steering/*.md` and `docs/PERMISSIONS_USAGE.md` were written for a different host layout —
they reference `shared/src/schema`, `pb/pb_migrations`, `@project/shared/schema` imports, and
`yarn migrate:generate`, none of which exist here. Their PocketBase API and permissions content is
still useful; their paths and commands are not.
