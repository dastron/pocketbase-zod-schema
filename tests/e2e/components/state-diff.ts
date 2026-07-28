/**
 * Shared schema-state comparison helpers
 *
 * Two e2e stages ask the same question — "do these two database states
 * describe the same schema?" — and answer it with the library's own diff
 * engine: `engine-state-comparator` (native migration vs library migration,
 * both executed) and `real-apply-verifier` (real PocketBase vs the engine's
 * simulation). Only the names of the two sides differ, so callers supply
 * them.
 */

import { compare } from '../../../package/src/migration/diff/index.js';
import type {
  CollectionSchema,
  FieldDefinition,
  SchemaDiff,
  SchemaSnapshot,
} from '../../../package/src/migration/types.js';

/** Names of the two sides being compared, used in difference messages */
export interface StateLabels {
  /** The state passed to compare() as "current" */
  current: string;
  /** The state passed to compare() as "previous" */
  previous: string;
}

/**
 * Diff two states. An empty diff means they describe the same schema.
 */
export function diffStates(current: SchemaSnapshot, previous: SchemaSnapshot): SchemaDiff {
  return compare({ collections: current.collections }, previous);
}

/** Restrict a snapshot to the named collections */
export function scopeSnapshot(snapshot: SchemaSnapshot, names: Iterable<string>): SchemaSnapshot {
  const wanted = new Set(names);
  const collections = new Map<string, CollectionSchema>();

  for (const [name, collection] of snapshot.collections) {
    if (wanted.has(name)) {
      collections.set(name, collection);
    }
  }

  return { ...snapshot, collections };
}

/** Values PocketBase serializes for an option that carries no constraint */
function isUnsetOptionValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    value === 0 ||
    value === false ||
    (Array.isArray(value) && value.length === 0)
  );
}

function cloneField(field: FieldDefinition): FieldDefinition {
  const clone: FieldDefinition = { ...field };
  if (field.options) {
    clone.options = { ...field.options };
  }
  if (field.relation) {
    clone.relation = { ...field.relation };
  }
  return clone;
}

function cloneSnapshot(snapshot: SchemaSnapshot): SchemaSnapshot {
  const collections = new Map<string, CollectionSchema>();

  for (const [name, collection] of snapshot.collections) {
    collections.set(name, { ...collection, fields: collection.fields.map(cloneField) });
  }

  return { ...snapshot, collections };
}

/** Drop keys only one side declares and that carry no constraint there */
function alignRecords(left?: Record<string, any>, right?: Record<string, any>): void {
  for (const [source, other] of [
    [left, right],
    [right, left],
  ] as const) {
    if (!source) {
      continue;
    }
    for (const key of Object.keys(source)) {
      // A key both sides declare is always compared: min 0 vs min 5 is a
      // real difference, min 0 vs "not declared" is not
      if (other && other[key] !== undefined) {
        continue;
      }
      if (isUnsetOptionValue(source[key])) {
        delete source[key];
      }
    }
  }
}

/** Stands in for a collection's own id inside its index names */
const COLLECTION_ID_TOKEN = '{collectionId}';

/**
 * Neutralize a collection's own id where it appears in its index names.
 *
 * PocketBase names the indexes it generates for an auth collection after the
 * collection itself — `idx_tokenKey_pbc_2283551112`. The two sides of every
 * comparison here assign collection ids independently (PocketBase derives its
 * own, the library generates a random `pb_` one), so those names can never
 * match, however identical the constraints they declare are. Substituting the
 * id each side actually used keeps the rest of the statement — uniqueness,
 * columns, WHERE clause — under comparison, and still flags an index that is
 * genuinely named differently.
 */
export function normalizeIndexNames(indexes: string[] | undefined, collectionId?: string): string[] {
  if (!indexes || !collectionId) {
    return indexes ?? [];
  }

  return indexes.map((index) => index.split(collectionId).join(COLLECTION_ID_TOKEN));
}

/**
 * Reconcile the representational differences between two states so the diff
 * reports schema divergences rather than bookkeeping ones.
 *
 * PocketBase serializes every field option, Go zero values included
 * (`"pattern": ""`, `"min": 0`, `"maxSize": 0`), while a migration file only
 * declares the options it actually sets. An absent option and a zero-valued
 * one express the same constraint, so comparing them verbatim buries real
 * divergences under normalization noise. Index names that embed the
 * collection id get the same treatment — see `normalizeIndexNames`.
 *
 * Returns copies — the inputs are left untouched.
 */
export function alignForComparison(
  current: SchemaSnapshot,
  previous: SchemaSnapshot
): [SchemaSnapshot, SchemaSnapshot] {
  const left = cloneSnapshot(current);
  const right = cloneSnapshot(previous);

  for (const [name, leftCollection] of left.collections) {
    const rightCollection = right.collections.get(name);
    if (!rightCollection) {
      continue;
    }

    for (const leftField of leftCollection.fields) {
      const rightField = rightCollection.fields.find((field) => field.name === leftField.name);
      if (!rightField) {
        continue;
      }
      alignRecords(leftField.options, rightField.options);
      alignRecords(leftField.relation, rightField.relation);
    }

    leftCollection.indexes = normalizeIndexNames(leftCollection.indexes, leftCollection.id);
    rightCollection.indexes = normalizeIndexNames(rightCollection.indexes, rightCollection.id);
  }

  return [left, right];
}

function formatValue(value: unknown): string {
  return value === undefined ? 'unset' : JSON.stringify(value);
}

/** Human-readable descriptions of every difference in a diff */
export function describeDiff(diff: SchemaDiff, labels: StateLabels): string[] {
  const differences: string[] = [];

  for (const collection of diff.collectionsToCreate) {
    differences.push(`collection "${collection.name}" exists in ${labels.current} but not in ${labels.previous}`);
  }
  for (const collection of diff.collectionsToDelete) {
    const name = typeof collection === 'string' ? collection : (collection?.name ?? String(collection));
    differences.push(`collection "${name}" exists in ${labels.previous} but not in ${labels.current}`);
  }

  for (const modification of diff.collectionsToModify) {
    const name = modification.collection;

    for (const field of modification.fieldsToAdd ?? []) {
      differences.push(`[${name}] field "${field.name}" missing from ${labels.previous}`);
    }
    for (const field of modification.fieldsToRemove ?? []) {
      const fieldName = typeof field === 'string' ? field : (field?.name ?? String(field));
      differences.push(`[${name}] field "${fieldName}" present only in ${labels.previous}`);
    }
    for (const fieldMod of modification.fieldsToModify ?? []) {
      const changes = (fieldMod.changes ?? [])
        .map(
          (change: any) =>
            `${change.property} (${labels.current}=${formatValue(change.newValue)}, ` +
            `${labels.previous}=${formatValue(change.oldValue)})`
        )
        .join(', ');
      differences.push(`[${name}] field "${fieldMod.fieldName}" differs: ${changes || 'options'}`);
    }
    for (const index of modification.indexesToAdd ?? []) {
      differences.push(`[${name}] index missing from ${labels.previous}: ${index}`);
    }
    for (const index of modification.indexesToRemove ?? []) {
      differences.push(`[${name}] index present only in ${labels.previous}: ${index}`);
    }
    for (const rule of modification.rulesToUpdate ?? []) {
      differences.push(
        `[${name}] rule "${rule.ruleType}" differs (${labels.current}=${formatValue(rule.newValue)}, ` +
          `${labels.previous}=${formatValue(rule.oldValue)})`
      );
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

/** 0-100 equivalence score; 100 = the two states are identical */
export function scoreDiff(diff: SchemaDiff): number {
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
