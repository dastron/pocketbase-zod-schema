/**
 * Engine State Comparator
 *
 * Compares a native-PocketBase-generated migration against a
 * library-generated migration by EXECUTING both through the migration
 * execution engine and diffing the resulting collection states.
 *
 * This is a semantic equivalence check: two migrations that produce the
 * same schema state are equivalent regardless of statement order, quoting,
 * addAt vs add, or unmarshal vs property assignment — all of which trip up
 * the legacy text-similarity comparison.
 */

import { executeMigrationFile } from '../../../package/src/migration/engine/index.js';
import type { SchemaDiff } from '../../../package/src/migration/types.js';
import { logger } from '../utils/test-helpers.js';
import { createBaselineStore } from './migration-inspector.js';
import { alignForComparison, describeDiff, diffStates, scoreDiff } from './state-diff.js';

export interface StateComparisonResult {
  /** True when both migrations executed and produced identical states */
  equivalent: boolean;
  /** 0-100; 100 = states identical */
  stateEquivalenceScore: number;
  /** Human-readable descriptions of state differences */
  stateDifferences: string[];
  /** Execution failures, if any (file -> error message) */
  executionErrors: { file: string; error: string }[];
  /** The raw diff (native state as "current", library state as "previous") */
  diff: SchemaDiff | null;
}

export interface EngineStateComparator {
  compareByExecution(
    nativeMigrationFile: string,
    libraryMigrationFile: string,
    baselineFiles?: string[]
  ): StateComparisonResult;
}

class EngineStateComparatorImpl implements EngineStateComparator {
  compareByExecution(
    nativeMigrationFile: string,
    libraryMigrationFile: string,
    baselineFiles: string[] = []
  ): StateComparisonResult {
    const executionErrors: { file: string; error: string }[] = [];

    const baseline = createBaselineStore({ baselineFiles });
    const nativeStore = baseline.clone();
    const libraryStore = baseline.clone();

    for (const [file, store] of [
      [nativeMigrationFile, nativeStore],
      [libraryMigrationFile, libraryStore],
    ] as const) {
      try {
        executeMigrationFile(file, store);
      } catch (error) {
        executionErrors.push({
          file,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (executionErrors.length > 0) {
      logger.warn('Engine execution errors during state comparison:', executionErrors);
      return {
        equivalent: false,
        stateEquivalenceScore: 0,
        stateDifferences: executionErrors.map((e) => `execution failed for ${e.file}: ${e.error}`),
        executionErrors,
        diff: null,
      };
    }

    // Native state as "current" vs library state as "previous": an empty
    // diff means the two migrations are state-equivalent. PocketBase's own
    // migrations spell out every option including zero values, so those are
    // aligned first - otherwise every scenario diverges on `pattern: ""`.
    const [native, library] = alignForComparison(nativeStore.toSnapshot(), libraryStore.toSnapshot());
    const diff = diffStates(native, library);
    const stateDifferences = describeDiff(diff, { current: 'native state', previous: 'library state' });

    return {
      equivalent: stateDifferences.length === 0,
      stateEquivalenceScore: scoreDiff(diff),
      stateDifferences,
      executionErrors,
      diff,
    };
  }
}

export function createEngineStateComparator(): EngineStateComparator {
  return new EngineStateComparatorImpl();
}
