/**
 * Structural comparison of two engine states
 *
 * Down-migration verification asks one question — "is the state after
 * up() + down() the state we started from?" — and needs an answer precise
 * enough to name what drifted. This compares the raw PocketBase-shaped
 * collections of two stores directly, rather than routing through the diff
 * engine, because a rollback that leaves the schema semantically equal but
 * structurally different (a restored field carrying a different id, an index
 * re-added in a different form) is exactly the kind of drift verification
 * exists to catch.
 *
 * Normalization is limited to differences PocketBase itself does not
 * distinguish:
 *
 * - An option a migration never declared and one set to its Go zero value
 *   (`""`, `0`, `false`, `[]`, `null`) express the same constraint, so an
 *   absent key equals a zero-valued one. Two *declared* values are always
 *   compared (`min: 0` vs `min: 5` is a real difference).
 * - API rules are exempt from that rule: `null` (superuser only) and `""`
 *   (public) are different permissions, so only absent ≡ `null` holds.
 * - Index order is not meaningful; index lists are compared as sets.
 * - Field order is not compared unless `strictFieldOrder` is set.
 */

import type { CollectionStore } from "./store";
import type { RawCollection } from "./types";

export interface StateDifference {
  kind:
    | "collection-added"
    | "collection-removed"
    | "collection-property"
    | "field-added"
    | "field-removed"
    | "field-property"
    | "field-order"
    | "indexes";
  /** Collection name (baseline name when the collection exists on both sides) */
  collection: string;
  field?: string;
  property?: string;
  expected?: unknown;
  actual?: unknown;
  /** Human-readable one-liner, suitable for CLI output */
  message: string;
}

export interface StateCompareOptions {
  /**
   * Collection and field properties to skip.
   * Defaults to PocketBase's own bookkeeping timestamps.
   */
  ignoreKeys?: string[];
  /** Also compare the position of each field within its collection */
  strictFieldOrder?: boolean;
  /** Labels used in messages; defaults to "baseline" / "actual" */
  labels?: { expected: string; actual: string };
}

const DEFAULT_IGNORED_KEYS = ["created", "updated"];

/** Rules where absent means "superuser only" and "" means "public" */
const RULE_KEYS = new Set(["listRule", "viewRule", "createRule", "updateRule", "deleteRule", "manageRule", "authRule"]);

/** Handled structurally rather than as plain properties */
const STRUCTURAL_KEYS = new Set(["fields", "indexes"]);

/**
 * Compares two stores. An empty result means the two states are the same
 * schema; every entry names one concrete divergence.
 */
export function compareStores(
  expected: CollectionStore,
  actual: CollectionStore,
  options: StateCompareOptions = {}
): StateDifference[] {
  return compareRawCollections(expected.serialize(), actual.serialize(), options);
}

export function compareRawCollections(
  expected: RawCollection[],
  actual: RawCollection[],
  options: StateCompareOptions = {}
): StateDifference[] {
  const ignored = new Set(options.ignoreKeys ?? DEFAULT_IGNORED_KEYS);
  const labels = options.labels ?? { expected: "baseline", actual: "actual" };
  const differences: StateDifference[] = [];

  const remaining = [...actual];
  const matched = new Map<RawCollection, RawCollection>();

  for (const expectedCollection of expected) {
    const index = findCollectionIndex(remaining, expectedCollection);
    if (index === -1) {
      differences.push({
        kind: "collection-removed",
        collection: collectionLabel(expectedCollection),
        message: `collection "${collectionLabel(expectedCollection)}" is missing from ${labels.actual}`,
      });
      continue;
    }
    matched.set(expectedCollection, remaining[index]);
    remaining.splice(index, 1);
  }

  for (const extra of remaining) {
    differences.push({
      kind: "collection-added",
      collection: collectionLabel(extra),
      message: `collection "${collectionLabel(extra)}" exists in ${labels.actual} but not in ${labels.expected}`,
    });
  }

  for (const [expectedCollection, actualCollection] of matched) {
    differences.push(...compareCollection(expectedCollection, actualCollection, ignored, options, labels));
  }

  return differences;
}

/** One line per difference, e.g. for CLI output */
export function describeStateDifferences(differences: StateDifference[]): string[] {
  return differences.map((difference) => difference.message);
}

function compareCollection(
  expected: RawCollection,
  actual: RawCollection,
  ignored: Set<string>,
  options: StateCompareOptions,
  labels: { expected: string; actual: string }
): StateDifference[] {
  const differences: StateDifference[] = [];
  const name = collectionLabel(expected);

  for (const key of unionKeys(expected, actual)) {
    if (ignored.has(key) || STRUCTURAL_KEYS.has(key)) {
      continue;
    }
    if (valuesAgree(key, expected[key], actual[key])) {
      continue;
    }
    differences.push({
      kind: "collection-property",
      collection: name,
      property: key,
      expected: expected[key],
      actual: actual[key],
      message:
        `[${name}] ${key} differs (${labels.expected}=${format(expected[key])}, ` +
        `${labels.actual}=${format(actual[key])})`,
    });
  }

  differences.push(...compareFields(name, expected, actual, ignored, options, labels));
  differences.push(...compareIndexes(name, expected, actual, labels));

  return differences;
}

function compareFields(
  collection: string,
  expected: RawCollection,
  actual: RawCollection,
  ignored: Set<string>,
  options: StateCompareOptions,
  labels: { expected: string; actual: string }
): StateDifference[] {
  const differences: StateDifference[] = [];
  const expectedFields: RawCollection[] = Array.isArray(expected.fields) ? expected.fields : [];
  const actualFields: RawCollection[] = Array.isArray(actual.fields) ? actual.fields : [];

  const actualByName = new Map<string, RawCollection>();
  for (const field of actualFields) {
    actualByName.set(String(field?.name ?? ""), field);
  }

  for (const expectedField of expectedFields) {
    const fieldName = String(expectedField?.name ?? "");
    const actualField = actualByName.get(fieldName);

    if (!actualField) {
      differences.push({
        kind: "field-removed",
        collection,
        field: fieldName,
        message: `[${collection}] field "${fieldName}" is missing from ${labels.actual}`,
      });
      continue;
    }

    for (const key of unionKeys(expectedField, actualField)) {
      if (ignored.has(key)) {
        continue;
      }
      if (valuesAgree(key, expectedField[key], actualField[key])) {
        continue;
      }
      differences.push({
        kind: "field-property",
        collection,
        field: fieldName,
        property: key,
        expected: expectedField[key],
        actual: actualField[key],
        message:
          `[${collection}] field "${fieldName}" ${key} differs ` +
          `(${labels.expected}=${format(expectedField[key])}, ${labels.actual}=${format(actualField[key])})`,
      });
    }
  }

  const expectedNames = new Set(expectedFields.map((field) => String(field?.name ?? "")));
  for (const actualField of actualFields) {
    const fieldName = String(actualField?.name ?? "");
    if (!expectedNames.has(fieldName)) {
      differences.push({
        kind: "field-added",
        collection,
        field: fieldName,
        message: `[${collection}] field "${fieldName}" exists in ${labels.actual} but not in ${labels.expected}`,
      });
    }
  }

  if (options.strictFieldOrder) {
    const expectedOrder = expectedFields.map((field) => String(field?.name ?? ""));
    const actualOrder = actualFields.map((field) => String(field?.name ?? ""));
    if (expectedOrder.length === actualOrder.length && !arraysEqual(expectedOrder, actualOrder)) {
      differences.push({
        kind: "field-order",
        collection,
        expected: expectedOrder,
        actual: actualOrder,
        message:
          `[${collection}] field order differs (${labels.expected}=${expectedOrder.join(", ")}, ` +
          `${labels.actual}=${actualOrder.join(", ")})`,
      });
    }
  }

  return differences;
}

function compareIndexes(
  collection: string,
  expected: RawCollection,
  actual: RawCollection,
  labels: { expected: string; actual: string }
): StateDifference[] {
  const expectedIndexes = normalizeIndexes(expected.indexes);
  const actualIndexes = normalizeIndexes(actual.indexes);
  const differences: StateDifference[] = [];

  for (const index of expectedIndexes) {
    if (!actualIndexes.includes(index)) {
      differences.push({
        kind: "indexes",
        collection,
        expected: index,
        message: `[${collection}] index missing from ${labels.actual}: ${index}`,
      });
    }
  }
  for (const index of actualIndexes) {
    if (!expectedIndexes.includes(index)) {
      differences.push({
        kind: "indexes",
        collection,
        actual: index,
        message: `[${collection}] index only in ${labels.actual}: ${index}`,
      });
    }
  }

  return differences;
}

function findCollectionIndex(candidates: RawCollection[], target: RawCollection): number {
  const byId = candidates.findIndex((candidate) => candidate.id && candidate.id === target.id);
  if (byId !== -1) {
    return byId;
  }
  return candidates.findIndex((candidate) => candidate.name && candidate.name === target.name);
}

function collectionLabel(collection: RawCollection): string {
  return String(collection?.name || collection?.id || "<unnamed>");
}

function unionKeys(left: RawCollection, right: RawCollection): string[] {
  return [...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])];
}

/**
 * Whether two values for the same property describe the same thing —
 * see the normalization rules in the module comment.
 */
function valuesAgree(key: string, expected: unknown, actual: unknown): boolean {
  if (RULE_KEYS.has(key)) {
    return deepEqual(expected ?? null, actual ?? null);
  }
  if (expected === undefined || actual === undefined) {
    return isUnset(expected) && isUnset(actual);
  }
  return deepEqual(expected, actual);
}

/** Values that carry no constraint; an undeclared option means the same */
function isUnset(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    value === 0 ||
    value === false ||
    (Array.isArray(value) && value.length === 0)
  );
}

function normalizeIndexes(indexes: unknown): string[] {
  if (!Array.isArray(indexes)) {
    return [];
  }
  return indexes.map((index) => String(index).replace(/\s+/g, " ").trim());
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => deepEqual(value, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left as object);
    const rightKeys = Object.keys(right as object);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    return leftKeys.every((key) =>
      deepEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])
    );
  }
  return false;
}

function format(value: unknown): string {
  if (value === undefined) {
    return "unset";
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
