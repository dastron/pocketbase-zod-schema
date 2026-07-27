/**
 * Down-migration verification
 *
 * A generated `down()` is never exercised by state reconstruction — the
 * replayer only runs `up()` — so a rollback that does not actually roll back
 * stays invisible until someone runs `pocketbase migrate down` in anger.
 * This module closes that gap: for each migration it executes `up()` against
 * a baseline, then `down()` against the result, and asserts the state came
 * back to the baseline.
 *
 * `down()` runs from a fresh evaluation of the file, the way PocketBase runs
 * it — a separate invocation that cannot observe anything `up()` left in the
 * file's module scope.
 *
 * Failures are returned, not thrown: a verification pass reports on every
 * migration it was given, and the caller decides whether an unreversible
 * migration is fatal.
 */

import * as fs from "fs";
import { MigrationExecutionError } from "../errors";
import { executeMigrationDownSource, executeMigrationSource } from "./runner";
import { compareStores, type StateCompareOptions, type StateDifference } from "./state-compare";
import { CollectionStore } from "./store";
import type { EngineOptions, EngineWarning, MigrationDirection } from "./types";

export interface MigrationSourceRef {
  source: string;
  /** Path or name used in messages */
  file?: string;
}

export interface MigrationRoundTripResult {
  file: string;
  /** The file registered an up() closure and it committed */
  upApplied: boolean;
  /** The file registered a down() closure and it committed */
  downApplied: boolean;
  /** up() changed the state but the file has no down() to undo it */
  missingDown: boolean;
  /** up() followed by down() returned to the baseline */
  reversible: boolean;
  /** What the rollback failed to restore (empty when reversible) */
  differences: StateDifference[];
  warnings: EngineWarning[];
  /** Set when a phase failed to execute at all */
  error?: { phase: MigrationDirection | "evaluate"; message: string };
  /** State after up() — what the next migration in a sequence starts from */
  storeAfterUp: CollectionStore;
}

export interface MigrationVerificationReport {
  results: MigrationRoundTripResult[];
  /** Every migration executed and reversed cleanly */
  ok: boolean;
  /** State after every up() — the state the migrations leave behind */
  store: CollectionStore;
  /** Only the results that failed, in input order */
  failures: MigrationRoundTripResult[];
}

export interface VerifyOptions extends EngineOptions {
  /** State the first migration is applied to. Defaults to an empty store. */
  initialStore?: CollectionStore;
  /** Forwarded to the state comparison */
  compare?: StateCompareOptions;
}

/**
 * Verifies one migration against a baseline. The baseline store is left
 * untouched; the state after up() is returned on the result.
 */
export function verifyMigrationRoundTrip(
  migration: MigrationSourceRef,
  baseline: CollectionStore = new CollectionStore(),
  options: VerifyOptions = {}
): MigrationRoundTripResult {
  const { initialStore: _initialStore, compare: compareOptions, ...engineOptions } = options;
  const file = migration.file ?? "<migration>";
  const warnings: EngineWarning[] = [];

  const afterUp = baseline.clone();
  let upApplied = false;
  try {
    const upResult = executeMigrationSource(migration.source, afterUp, { ...engineOptions, filename: file });
    upApplied = upResult.applied;
    warnings.push(...upResult.warnings);
  } catch (error) {
    return {
      file,
      upApplied: false,
      downApplied: false,
      missingDown: false,
      reversible: false,
      differences: [],
      warnings,
      error: toPhaseError(error, "up"),
      // up() is transactional: a failure leaves the baseline state intact
      storeAfterUp: baseline.clone(),
    };
  }

  const afterDown = afterUp.clone();
  let downApplied = false;
  try {
    const downResult = executeMigrationDownSource(migration.source, afterDown, { ...engineOptions, filename: file });
    downApplied = downResult.applied;
    warnings.push(...downResult.warnings);
  } catch (error) {
    return {
      file,
      upApplied,
      downApplied: false,
      missingDown: false,
      reversible: false,
      differences: [],
      warnings,
      error: toPhaseError(error, "down"),
      storeAfterUp: afterUp,
    };
  }

  const differences = compareStores(baseline, afterDown, {
    labels: { expected: "pre-migration state", actual: "state after down()" },
    ...compareOptions,
  });

  return {
    file,
    upApplied,
    downApplied,
    // A file with no down() is only a problem if up() actually changed
    // something — which the differences below will show
    missingDown: upApplied && !downApplied,
    reversible: differences.length === 0,
    differences,
    warnings,
    storeAfterUp: afterUp,
  };
}

export function verifyMigrationFileRoundTrip(
  filePath: string,
  baseline: CollectionStore = new CollectionStore(),
  options: VerifyOptions = {}
): MigrationRoundTripResult {
  return verifyMigrationRoundTrip({ source: fs.readFileSync(filePath, "utf-8"), file: filePath }, baseline, options);
}

/**
 * Verifies a sequence of migrations the way they will be applied: each one
 * is round-tripped against the state its predecessors leave behind, and its
 * up() is then committed before moving on.
 */
export function verifyMigrationSources(
  migrations: MigrationSourceRef[],
  options: VerifyOptions = {}
): MigrationVerificationReport {
  let store = options.initialStore ?? new CollectionStore();
  const results: MigrationRoundTripResult[] = [];

  for (const migration of migrations) {
    const result = verifyMigrationRoundTrip(migration, store, options);
    results.push(result);
    store = result.storeAfterUp;

    // Continuing past a migration that could not be applied would verify
    // every later migration against a state that will never exist
    if (result.error?.phase === "up" || result.error?.phase === "evaluate") {
      break;
    }
  }

  const failures = results.filter((result) => !result.reversible || result.error !== undefined);

  return { results, ok: failures.length === 0, store, failures };
}

export function verifyMigrationFiles(files: string[], options: VerifyOptions = {}): MigrationVerificationReport {
  return verifyMigrationSources(
    files.map((file) => ({ source: fs.readFileSync(file, "utf-8"), file })),
    options
  );
}

function toPhaseError(error: unknown, fallbackPhase: MigrationDirection): MigrationRoundTripResult["error"] {
  if (error instanceof MigrationExecutionError) {
    return { phase: error.phase ?? fallbackPhase, message: error.message };
  }
  return { phase: fallbackPhase, message: error instanceof Error ? error.message : String(error) };
}
