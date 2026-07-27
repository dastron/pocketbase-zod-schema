/**
 * Replayer — folds an ordered list of migration files into a final state
 *
 * Mirrors what PocketBase does on `migrate up`: execute each unapplied file
 * in timestamp order. State reconstruction starts from an empty store; a
 * native snapshot migration (app.importCollections) is just the first file.
 *
 * Which files that is comes from `planMigrationReplay`: by default the newest
 * snapshot plus everything after it, or — when an applied-migrations list is
 * supplied — only the files PocketBase has actually run, starting from the
 * newest applied snapshot.
 */

import { executeMigrationFile } from "./runner";
import { planMigrationReplay, type MigrationPlan, type PlanOptions } from "./migration-plan";
import { CollectionStore } from "./store";
import type { EngineOptions, EngineWarning, ReplayResult } from "./types";

export function replayMigrations(
  files: string[],
  options: EngineOptions & { initialStore?: CollectionStore; plan?: MigrationPlan } = {}
): ReplayResult {
  const { initialStore, plan, ...engineOptions } = options;
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
    plan: plan ?? null,
  };
}

/**
 * Replays a pb_migrations directory: the snapshot the state starts from,
 * then every migration after it, in timestamp order.
 *
 * Pass `applied` (from `readAppliedMigrations`) to replay only what PocketBase
 * has actually run — otherwise every file on disk is assumed applied.
 *
 * Returns null when there is nothing to replay (an empty database).
 */
export function replayMigrationsDirectory(
  migrationsPath: string,
  options: EngineOptions & PlanOptions = {}
): ReplayResult | null {
  const { applied, ...engineOptions } = options;
  const plan = planMigrationReplay(migrationsPath, { applied });

  if (plan.filesToReplay.length === 0) {
    return null;
  }

  return replayMigrations(plan.filesToReplay, { ...engineOptions, plan });
}
