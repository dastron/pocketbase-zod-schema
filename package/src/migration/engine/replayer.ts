/**
 * Replayer — folds an ordered list of migration files into a final state
 *
 * Mirrors what PocketBase does on `migrate up`: execute each unapplied file
 * in timestamp order. State reconstruction starts from an empty store; a
 * native snapshot migration (app.importCollections) is just the first file.
 */

import { findMigrationsAfterSnapshot, extractTimestampFromFilename } from "../migration-parser";
import { findLatestSnapshot } from "../snapshot";
import * as path from "path";
import { executeMigrationFile } from "./runner";
import { CollectionStore } from "./store";
import type { EngineOptions, EngineWarning, ReplayResult } from "./types";

export function replayMigrations(
  files: string[],
  options: EngineOptions & { initialStore?: CollectionStore } = {}
): ReplayResult {
  const { initialStore, ...engineOptions } = options;
  const store = initialStore ?? new CollectionStore();
  const warnings: EngineWarning[] = [];
  const filesExecuted: string[] = [];

  for (const file of files) {
    const result = executeMigrationFile(file, store, engineOptions);
    warnings.push(...result.warnings);
    filesExecuted.push(file);
  }

  return {
    snapshot: store.toSnapshot(),
    store,
    warnings,
    filesExecuted,
  };
}

/**
 * Replays a pb_migrations directory: latest snapshot file first, then every
 * migration after it, using the same file selection and ordering as the
 * static path (findLatestSnapshot + findMigrationsAfterSnapshot).
 *
 * Returns null when the directory has no snapshot file (empty database).
 */
export function replayMigrationsDirectory(migrationsPath: string, options: EngineOptions = {}): ReplayResult | null {
  const latestSnapshotPath = findLatestSnapshot(migrationsPath);
  if (!latestSnapshotPath) {
    return null;
  }

  const files = [latestSnapshotPath];
  const snapshotTimestamp = extractTimestampFromFilename(path.basename(latestSnapshotPath));
  if (snapshotTimestamp) {
    files.push(...findMigrationsAfterSnapshot(migrationsPath, snapshotTimestamp));
  }

  return replayMigrations(files, options);
}
