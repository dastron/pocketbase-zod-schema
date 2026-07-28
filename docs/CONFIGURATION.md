# Migration Configuration Reference

Every configuration option the migration CLI reads, and where it can come from.

## Configuration file

The tool searches the current working directory, then a `shared/` subdirectory, for the first of:

```
pocketbase-migrate.config.js
pocketbase-migrate.config.mjs
pocketbase-migrate.config.json
migrate.config.js
migrate.config.mjs
migrate.config.json
```

`-c, --config <path>` overrides the search with an explicit path (and errors if that file does not
exist). JavaScript config files are imported as ES modules and may use a default export.

## Precedence

CLI arguments > environment variables > configuration file > defaults.

## Defaults

With no configuration file present:

```javascript
export default {
  schema: {
    directory: "src/schema",
    exclude: ["base.ts", "index.ts", "permissions.ts", "permission-templates.ts"],
  },
  migrations: {
    directory: "pocketbase/pb_migrations",
    format: "timestamp_description",
    verify: false,
    dataDirectory: "",
  },
  diff: {
    warnOnDelete: true,
    requireForceForDestructive: true,
  },
  typeGen: {
    outPath: "pocketbase-types.ts",
  },
};
```

## Options

### `schema.directory`

**Type:** `string` · **Default:** `"src/schema"`

Directory containing Zod schema files. Resolved relative to the current working directory, with
`shared/<directory>` as a fallback. Startup fails with a `ConfigurationError` if neither exists.

### `schema.exclude`

**Type:** `string[]` · **Default:** `["base.ts", "index.ts", "permissions.ts", "permission-templates.ts"]`

Filenames or glob patterns to skip during schema discovery. Use it for files that hold helpers
rather than collections — a barrel `index.ts`, shared field fragments, test files.

Note this replaces the default list rather than adding to it, so re-list anything you still want
excluded:

```javascript
exclude: ["*.test.ts", "*.spec.ts", "base.ts", "fields.ts", "index.ts", "view.ts"]
```

### `migrations.directory`

**Type:** `string` · **Default:** `"pocketbase/pb_migrations"`

Where migration files are written, and where the current database state is reconstructed from.

### `migrations.format`

**Type:** `string` · **Default:** `"timestamp_description"`

**Currently unused.** The key is accepted and validated but no code reads it; generated filenames
are always `<unix-timestamp>_<description>.js`. Reserved for a future filename-format option.

### `migrations.verify`

**Type:** `boolean` · **Default:** `false`

When true, `generate` executes each new migration's `up()` and then `down()` in the simulation
before writing it, and writes nothing if a migration fails to apply or fails to restore the
previous state. It also runs the goja lint over what it is about to write.

Off by default because building the baseline costs a full replay of the existing migrations, and a
rollback you never intend to run is not a reason to block generating one that works forward.

**CLI:** `--verify` / `--no-verify` · **Env:** `MIGRATION_VERIFY`

### `migrations.dataDirectory`

**Type:** `string` · **Default:** `""`

PocketBase's data directory, or a path to `data.db` directly. Used to read the `_migrations` table
so replay can stop at what has actually been applied instead of assuming every file on disk ran —
which is how `status` reports drift and what the pending files still owe the database.
Empty means "the `pb_data` directory next to the migrations directory".

Requires **Node >= 22.5** (`node:sqlite`).

**CLI:** `--pb-data <path>` (on `status`) · **Env:** `MIGRATION_DATA_DIR`

### `diff.warnOnDelete`

**Type:** `boolean` · **Default:** `true`

Warn when a collection or field would be deleted.

### `diff.requireForceForDestructive`

**Type:** `boolean` · **Default:** `true`

Require `--force` before generating destructive changes: deleting a collection, deleting a field,
changing a field's type, or tightening a size constraint. Deleting a **view** collection is not
destructive — a view stores no data.

**Env:** `MIGRATION_REQUIRE_FORCE`

### `typeGen.outPath`

**Type:** `string` · **Default:** `"pocketbase-types.ts"`

Default output path for `generate-types`. Overridden per run by `-o, --output`.

## CLI options

Global to every command:

| Option | Description |
| --- | --- |
| `-c, --config <path>` | Explicit configuration file |
| `-v, --version` | Print the version — **`-v` is version, not verbose** |
| `--verbose` | Verbose output |
| `--quiet` | Suppress non-essential output |
| `--no-color` | Disable colored output |

### `generate [filters...]`

| Option | Overrides |
| --- | --- |
| `-o, --output <directory>` | `migrations.directory` |
| `--schema-dir <directory>` | `schema.directory` |
| `-f, --force` | `diff.requireForceForDestructive` for this run |
| `--dry-run` | — shows what would be generated, writes nothing |
| `--verify` / `--no-verify` | `migrations.verify` |

Positional `filters` restrict the diff to matching collection or field names (regex supported).

### `status`

| Option | Overrides |
| --- | --- |
| `--schema-dir <directory>` | `schema.directory` |
| `--json` | — machine-readable output |
| `--verify` | — compare disk against `_migrations`, exit non-zero on drift |
| `--pb-data <path>` | `migrations.dataDirectory` |

Passing `--pb-data` without `--verify` still reports drift; it just does not fail on it.

Reading the applied set adds the drift report — including what the pending files will do to the
database once applied — but does not change the Schema Comparison, which always diffs against the
migration files on disk so `status` and `generate` agree.

### `generate-types`

| Option | Overrides |
| --- | --- |
| `-o, --output <path>` | `typeGen.outPath` |
| `--schema-dir <directory>` | `schema.directory` |

### `lint [files...]`

| Option | Overrides |
| --- | --- |
| `-o, --output <directory>` | `migrations.directory` |
| `--no-execute` | — static checks only |

## Environment variables

| Variable | Sets |
| --- | --- |
| `MIGRATION_SCHEMA_DIR` | `schema.directory` |
| `MIGRATION_SCHEMA_EXCLUDE` | `schema.exclude` (comma-separated) |
| `MIGRATION_OUTPUT_DIR` | `migrations.directory` |
| `MIGRATION_VERIFY` | `migrations.verify` (`"true"` / anything else) |
| `MIGRATION_DATA_DIR` | `migrations.dataDirectory` |
| `MIGRATION_REQUIRE_FORCE` | `diff.requireForceForDestructive` (`"true"` / anything else) |

```bash
MIGRATION_SCHEMA_DIR=src/models MIGRATION_VERIFY=true npx pocketbase-migrate generate
```

There is no environment variable for `typeGen.outPath`.

## Validation

Configuration is validated after merging. A `ConfigurationError` naming the offending keys is
thrown when `schema.directory` is empty, `schema.exclude` is not an array, `migrations.directory`
is empty, `migrations.verify` is not a boolean, `migrations.dataDirectory` is not a string, either
`diff.*` flag is not a boolean, `typeGen.outPath` is empty, or the schema directory does not exist.

Unknown keys are ignored rather than rejected — a typo in a key name fails silently, so check
spelling against this page.

## Complete example

```javascript
// pocketbase-migrate.config.js
export default {
  schema: {
    directory: "src/schema",
    exclude: ["*.test.ts", "*.spec.ts", "base.ts", "fields.ts", "index.ts"],
  },
  migrations: {
    directory: process.env.MIGRATION_DIR || "pocketbase/pb_migrations",
    verify: process.env.CI === "true",
    dataDirectory: "",
  },
  diff: {
    warnOnDelete: true,
    requireForceForDestructive: true,
  },
  typeGen: {
    outPath: "src/pocketbase-types.ts",
  },
};
```

## Best practices

**Do:**

- Commit the configuration file and every migration file
- Keep paths relative to the project root so they work for everyone
- Leave `requireForceForDestructive` on, and review generated migrations before applying them
- Turn `verify` on in CI, where the extra replay costs nothing you are waiting on

**Don't:**

- Use absolute paths
- Put `--force` in a package script
- Edit or delete a migration that has already been applied — state is reconstructed by replaying
  those files, so changing one retroactively changes what the next diff sees

## See Also

- [Execution Engine](./EXECUTION_ENGINE.md) — what `verify` and `dataDirectory` control
- [Migration Guide](./MIGRATION_GUIDE.md) — adoption and upgrade notes
- [Type Mapping Reference](./TYPE_MAPPING.md) — type conversion rules
- [Naming Conventions](./NAMING_CONVENTIONS.md) — naming guidelines
