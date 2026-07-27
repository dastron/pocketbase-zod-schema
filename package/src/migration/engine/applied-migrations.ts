/**
 * `_migrations` table awareness
 *
 * PocketBase records every migration it has run in an internal `_migrations`
 * table (`file` TEXT PRIMARY KEY, `applied` INTEGER). Replay that assumes
 * every file on disk is applied reconstructs a state the database may never
 * have been in: a file added but not yet run, or a file deleted from disk
 * after it ran, both produce silent drift.
 *
 * This module reads that table so replay can start from an actual checkpoint,
 * and so `status --verify` can name the difference between disk and database.
 *
 * The read is done with Node's built-in `node:sqlite` (Node >= 22.5), fetched
 * through `process.getBuiltinModule` so neither the ESM nor the CJS bundle
 * carries a hard dependency on it. `pb_data/data.db` is opened **read-only**;
 * a running PocketBase instance is never disturbed.
 */

import * as fs from "fs";
import * as path from "path";

/** PocketBase's internal table of applied migrations */
export const APPLIED_MIGRATIONS_TABLE = "_migrations";

/** PocketBase's SQLite database file inside a pb_data directory */
export const POCKETBASE_DATABASE_FILENAME = "data.db";

export interface AppliedMigration {
  /** Filename as PocketBase recorded it, e.g. "1712345678_created_Posts.js" */
  file: string;
  /** Unix seconds from `_migrations.applied`, when the column has a value */
  applied?: number;
}

export interface AppliedMigrationsSource {
  /** Where the list came from — a database path, or a caller-supplied label */
  origin: string;
  /** Every row, in application order */
  entries: AppliedMigration[];
  /**
   * Entries PocketBase's own Go core migrations contributed (`*.go`). They
   * never correspond to a file in a pb_migrations directory, so they are
   * kept separate from `entries` rather than reported as missing.
   */
  coreEntries: AppliedMigration[];
}

/**
 * Raised when an applied-migrations list was requested but could not be read.
 * Callers that treat the list as optional should catch this and fall back to
 * "assume everything on disk is applied".
 */
export class AppliedMigrationsError extends Error {
  public readonly source?: string;
  public readonly originalError?: Error;

  constructor(message: string, source?: string, originalError?: Error) {
    super(message);
    this.name = "AppliedMigrationsError";
    this.source = source;
    this.originalError = originalError;
    Object.setPrototypeOf(this, AppliedMigrationsError.prototype);
  }
}

/**
 * Builds a source from an explicit list of filenames (paths are reduced to
 * their basename, so a caller can pass either).
 */
export function appliedMigrationsFromList(files: string[], origin = "<list>"): AppliedMigrationsSource {
  const entries: AppliedMigration[] = [];
  const coreEntries: AppliedMigration[] = [];

  for (const file of files) {
    const entry: AppliedMigration = { file: path.basename(file) };
    (isCoreMigration(entry.file) ? coreEntries : entries).push(entry);
  }

  return { origin, entries, coreEntries };
}

/**
 * The pb_data directory PocketBase uses alongside a pb_migrations directory.
 * Both live under the PocketBase working directory, so pb_data is a sibling.
 */
export function defaultDataDirectory(migrationsPath: string): string {
  return path.resolve(path.dirname(path.resolve(migrationsPath)), "pb_data");
}

/**
 * Resolves a user-supplied pb_data path (directory or database file) to the
 * SQLite file to open. Returns null when nothing usable exists.
 */
export function resolveDatabasePath(dataPathOrFile: string): string | null {
  const resolved = path.resolve(dataPathOrFile);
  if (!fs.existsSync(resolved)) {
    return null;
  }
  if (fs.statSync(resolved).isDirectory()) {
    const candidate = path.join(resolved, POCKETBASE_DATABASE_FILENAME);
    return fs.existsSync(candidate) ? candidate : null;
  }
  return resolved;
}

/**
 * Reads `_migrations` out of a PocketBase SQLite database.
 *
 * @param dataPathOrFile - A pb_data directory or a data.db file
 * @throws AppliedMigrationsError when the runtime, file, or table is unusable
 */
export function readAppliedMigrations(dataPathOrFile: string): AppliedMigrationsSource {
  const databasePath = resolveDatabasePath(dataPathOrFile);
  if (!databasePath) {
    throw new AppliedMigrationsError(
      `No PocketBase database found at ${path.resolve(dataPathOrFile)}. ` +
        `Expected a data.db file, or a pb_data directory containing one.`,
      dataPathOrFile
    );
  }

  const sqlite = loadSqliteModule();
  if (!sqlite) {
    throw new AppliedMigrationsError(
      `Reading the _migrations table requires Node's built-in node:sqlite module (Node >= 22.5). ` +
        `This process runs ${process.version}. Pass the applied migrations explicitly instead.`,
      databasePath
    );
  }

  let database: { prepare: (sql: string) => { all: () => unknown[] }; close: () => void };
  try {
    database = withoutSqliteExperimentalWarning(() => new sqlite.DatabaseSync(databasePath, { readOnly: true }));
  } catch (error) {
    throw new AppliedMigrationsError(
      `Failed to open ${databasePath}: ${errorMessage(error)}`,
      databasePath,
      error instanceof Error ? error : undefined
    );
  }

  try {
    const rows = database
      .prepare(`SELECT file, applied FROM ${APPLIED_MIGRATIONS_TABLE} ORDER BY applied ASC, file ASC`)
      .all() as { file?: unknown; applied?: unknown }[];

    const entries: AppliedMigration[] = [];
    const coreEntries: AppliedMigration[] = [];

    for (const row of rows) {
      if (typeof row?.file !== "string" || row.file === "") {
        continue;
      }
      const entry: AppliedMigration = { file: row.file };
      const applied = Number(row.applied);
      if (Number.isFinite(applied) && applied > 0) {
        entry.applied = applied;
      }
      (isCoreMigration(entry.file) ? coreEntries : entries).push(entry);
    }

    return { origin: databasePath, entries, coreEntries };
  } catch (error) {
    if (error instanceof AppliedMigrationsError) {
      throw error;
    }
    throw new AppliedMigrationsError(
      `Failed to read the ${APPLIED_MIGRATIONS_TABLE} table from ${databasePath}: ${errorMessage(error)}`,
      databasePath,
      error instanceof Error ? error : undefined
    );
  } finally {
    try {
      database.close();
    } catch {
      // A close failure cannot invalidate rows already read
    }
  }
}

/**
 * Best-effort read: returns null instead of throwing when there is simply no
 * database to read (the common case for a checkout that has never run
 * PocketBase). Genuine failures — an unreadable file, a missing table, a
 * runtime without node:sqlite — still throw, because silently assuming
 * "everything is applied" is the drift this module exists to catch.
 */
export function readAppliedMigrationsIfPresent(dataPathOrFile: string): AppliedMigrationsSource | null {
  if (!resolveDatabasePath(dataPathOrFile)) {
    return null;
  }
  return readAppliedMigrations(dataPathOrFile);
}

/**
 * PocketBase's own Go core migrations are recorded in `_migrations` alongside
 * JS ones. They have no counterpart on disk in a pb_migrations directory.
 */
function isCoreMigration(file: string): boolean {
  return !file.endsWith(".js");
}

interface SqliteModule {
  DatabaseSync: new (
    path: string,
    options?: { readOnly?: boolean }
  ) => { prepare: (sql: string) => { all: () => unknown[] }; close: () => void };
}

/**
 * Loads node:sqlite without a static import, so the module keeps working on
 * runtimes that do not ship it (the rest of the engine does not need it).
 */
function loadSqliteModule(): SqliteModule | null {
  const getBuiltinModule = (process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown })
    .getBuiltinModule;
  if (typeof getBuiltinModule !== "function") {
    return null;
  }
  try {
    const module = withoutSqliteExperimentalWarning(() => getBuiltinModule("node:sqlite") as SqliteModule | undefined);
    return module && typeof module.DatabaseSync === "function" ? module : null;
  } catch {
    return null;
  }
}

/**
 * node:sqlite emits an ExperimentalWarning on load and on open. Reading a
 * read-only table is a bounded, deliberate use of it, and a CLI that prints a
 * Node warning every time someone runs `status --verify` is just noise —
 * so the warning is dropped for the duration of the call, and only that one.
 */
function withoutSqliteExperimentalWarning<T>(operation: () => T): T {
  const original = process.emitWarning;

  process.emitWarning = ((warning: unknown, ...rest: unknown[]) => {
    const name = typeof warning === "object" && warning !== null ? (warning as Error).name : rest[0];
    const message = typeof warning === "string" ? warning : ((warning as Error)?.message ?? "");
    if (name === "ExperimentalWarning" && /sqlite/i.test(message)) {
      return;
    }
    (original as (...args: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;

  try {
    return operation();
  } finally {
    process.emitWarning = original;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
