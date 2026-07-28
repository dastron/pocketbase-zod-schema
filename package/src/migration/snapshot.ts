/**
 * Snapshot loading
 *
 * The "current database state" is reconstructed by executing the generated
 * migration files in a simulated PocketBase JSVM (see migration/engine/).
 * There is no snapshot JSON file.
 */

import * as fs from "fs";
import * as path from "path";
import type { AppliedMigrationsSource } from "./engine/applied-migrations";
import { replayMigrations, replayMigrationsDirectory } from "./engine/replayer";
import type { EngineOptions } from "./engine/types";
import { MigrationExecutionError, SnapshotError } from "./errors";
import type { SchemaSnapshot } from "./types";

/**
 * Configuration for snapshot operations
 */
export interface SnapshotConfig {
  /**
   * Path to the migrations directory to replay
   */
  migrationsPath?: string;

  /**
   * Options forwarded to the execution engine, which reconstructs state by
   * executing migration files in a simulated PocketBase JSVM.
   */
  engineOptions?: EngineOptions;

  /**
   * Migrations PocketBase has actually applied, read from its `_migrations`
   * table (see `readAppliedMigrations`). When supplied, replay starts from
   * the newest applied snapshot and stops at the applied set, so a migration
   * written but not yet run does not leak into the reconstructed state.
   */
  appliedMigrations?: AppliedMigrationsSource | string[] | null;
}

/**
 * Finds the most recent snapshot file in the migrations directory
 * Identifies snapshot files by naming pattern (e.g., *_collections_snapshot.js)
 *
 * @param migrationsPath - Path to pb_migrations directory
 * @returns Path to most recent snapshot file or null if none exist
 */
export function findLatestSnapshot(migrationsPath: string): string | null {
  try {
    // Check if migrations directory exists
    if (!fs.existsSync(migrationsPath)) {
      return null;
    }

    // Read all files in migrations directory
    const files = fs.readdirSync(migrationsPath);

    // Filter for snapshot files (files ending with _collections_snapshot.js or _snapshot.js)
    const snapshotFiles = files.filter(
      (file) => file.endsWith("_collections_snapshot.js") || file.endsWith("_snapshot.js")
    );

    if (snapshotFiles.length === 0) {
      return null;
    }

    // Sort by filename (timestamp prefix) to get most recent
    // Snapshot files are named with timestamp prefix: [timestamp]_collections_snapshot.js
    snapshotFiles.sort().reverse();

    // Return full path to most recent snapshot
    const latestSnapshot = snapshotFiles[0];
    if (!latestSnapshot) {
      return null;
    }
    return path.join(migrationsPath, latestSnapshot);
  } catch (error) {
    // If there's any error reading directory, return null
    console.warn(`Error finding latest snapshot: ${error}`);
    return null;
  }
}

/**
 * Reconstructs the current database state: executes the snapshot migration and
 * every migration after it in a simulated PocketBase JSVM.
 *
 * A migration that cannot be executed fails hard — continuing past it would
 * silently reconstruct the wrong state and cause the generator to emit
 * incorrect diffs.
 *
 * @param config - Snapshot configuration (must include migrationsPath)
 * @returns SchemaSnapshot representing the current state, or null when there is
 *   nothing to replay (an empty database)
 */
export function loadSnapshotWithMigrations(config: SnapshotConfig = {}): SchemaSnapshot | null {
  const migrationsPath = config.migrationsPath;

  if (!migrationsPath) {
    return null;
  }

  try {
    // File path instead of a directory (backward compatibility with tests):
    // execute just that one file
    if (fs.existsSync(migrationsPath) && fs.statSync(migrationsPath).isFile()) {
      return replayMigrations([migrationsPath], config.engineOptions).snapshot;
    }

    const result = replayMigrationsDirectory(migrationsPath, {
      ...config.engineOptions,
      applied: config.appliedMigrations,
    });
    return result ? result.snapshot : null;
  } catch (error) {
    if (error instanceof MigrationExecutionError) {
      throw new SnapshotError(
        `Failed to execute migration ${error.filePath ?? "<unknown>"}: ${error.message}`,
        error.filePath,
        "parse",
        error
      );
    }
    throw error;
  }
}
