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
} from "pocketbase-zod-schema/schema";

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
} from "pocketbase-zod-schema/schema";

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
import { defineCollection, EmailField, TextField } from "pocketbase-zod-schema/schema";

export const UserSchema = z.object({
  email: EmailField(),
  password: TextField({ min: 8 }),
  name: TextField({ max: 100 }).optional(),
});

export default defineCollection({
  collectionName: "users",
  schema: UserSchema,
  indexes: ["CREATE UNIQUE INDEX idx_users_email ON users (email)"],
});
```

Notes:

- A collection is detected as `auth` only when it has **both** `email` and `password` fields. Set
  `type: "auth"` explicitly if you want to be sure.
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

### Unreleased — the static migration parser is gone

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
collections belong in `schema.exclude`. Subdirectories are supported.

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

Check that each file exports the collection — the analyzer looks for a default export first, then
`*Collection`, then `*Schema` — and that the filename is not caught by `schema.exclude`.

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
