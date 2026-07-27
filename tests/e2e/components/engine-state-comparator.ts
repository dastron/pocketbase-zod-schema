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

import {
  CollectionStore,
  executeMigrationFile,
  replayMigrations,
} from '../../../package/src/migration/engine/index.js';
import { Collection } from '../../../package/src/migration/engine/collection.js';
import { compare } from '../../../package/src/migration/diff/index.js';
import type { SchemaDiff } from '../../../package/src/migration/types.js';
import { logger } from '../utils/test-helpers.js';

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

/**
 * Minimal users auth collection every real PocketBase instance has —
 * migrations routinely reference it by name or by the _pb_users_auth_ id.
 */
function seedBaselineStore(baselineFiles: string[]): CollectionStore {
  const store = baselineFiles.length > 0 ? replayMigrations(baselineFiles).store : new CollectionStore();

  if (!store.getByNameOrId('users')) {
    store.upsert(
      new Collection({
        id: '_pb_users_auth_',
        name: 'users',
        type: 'auth',
        fields: [],
      })
    );
  }

  return store;
}

function describeDiff(diff: SchemaDiff): string[] {
  const differences: string[] = [];

  for (const collection of diff.collectionsToCreate) {
    differences.push(`collection "${collection.name}" exists in native state but not in library state`);
  }
  for (const collection of diff.collectionsToDelete) {
    const name = typeof collection === 'string' ? collection : (collection?.name ?? String(collection));
    differences.push(`collection "${name}" exists in library state but not in native state`);
  }
  for (const modification of diff.collectionsToModify) {
    const name = modification.collection;
    for (const field of modification.fieldsToAdd ?? []) {
      differences.push(`[${name}] field "${field.name}" missing from library state`);
    }
    for (const field of modification.fieldsToRemove ?? []) {
      const fieldName = typeof field === 'string' ? field : (field?.name ?? String(field));
      differences.push(`[${name}] field "${fieldName}" present only in library state`);
    }
    for (const fieldMod of modification.fieldsToModify ?? []) {
      const changes = (fieldMod.changes ?? []).map((c: any) => c.property).join(', ');
      differences.push(`[${name}] field "${fieldMod.fieldName}" differs (${changes || 'options'})`);
    }
    for (const index of modification.indexesToAdd ?? []) {
      differences.push(`[${name}] index missing from library state: ${index}`);
    }
    for (const index of modification.indexesToRemove ?? []) {
      differences.push(`[${name}] index present only in library state: ${index}`);
    }
    for (const rule of modification.rulesToUpdate ?? []) {
      differences.push(`[${name}] rule "${rule.ruleType}" differs`);
    }
    for (const permission of modification.permissionsToUpdate ?? []) {
      differences.push(`[${name}] permission "${permission.ruleType}" differs`);
    }
    if (modification.viewQueryUpdate) {
      differences.push(`[${name}] viewQuery differs`);
    }
  }

  return differences;
}

function scoreDiff(diff: SchemaDiff): number {
  let score = 100;

  score -= diff.collectionsToCreate.length * 30;
  score -= diff.collectionsToDelete.length * 30;

  for (const modification of diff.collectionsToModify) {
    score -= (modification.fieldsToAdd?.length ?? 0) * 10;
    score -= (modification.fieldsToRemove?.length ?? 0) * 10;
    score -= (modification.fieldsToModify?.length ?? 0) * 5;
    score -= (modification.indexesToAdd?.length ?? 0) * 5;
    score -= (modification.indexesToRemove?.length ?? 0) * 5;
    score -= (modification.rulesToUpdate?.length ?? 0) * 3;
    score -= (modification.permissionsToUpdate?.length ?? 0) * 3;
    if (modification.viewQueryUpdate) {
      score -= 5;
    }
  }

  return Math.max(0, score);
}

class EngineStateComparatorImpl implements EngineStateComparator {
  compareByExecution(
    nativeMigrationFile: string,
    libraryMigrationFile: string,
    baselineFiles: string[] = []
  ): StateComparisonResult {
    const executionErrors: { file: string; error: string }[] = [];

    const baseline = seedBaselineStore(baselineFiles);
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

    const nativeSnapshot = nativeStore.toSnapshot();
    const librarySnapshot = libraryStore.toSnapshot();

    // Native state as "current" vs library state as "previous": an empty
    // diff means the two migrations are state-equivalent
    const diff = compare({ collections: nativeSnapshot.collections }, librarySnapshot);
    const stateDifferences = describeDiff(diff);

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
