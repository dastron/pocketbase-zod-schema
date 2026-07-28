import { getFieldOptionUnsetValue } from "../utils/type-mapper";
import { mergeConfig, type DiffEngineConfig } from "./config";

/**
 * Checks if a collection is a PocketBase system collection
 * System collections are internal to PocketBase and should not be created or deleted
 *
 * @param collectionName - Name of the collection to check
 * @param config - Optional configuration with custom system collections
 * @returns True if the collection is a system collection
 */
export function isSystemCollection(collectionName: string, config?: DiffEngineConfig): boolean {
  const mergedConfig = mergeConfig(config);
  return mergedConfig.systemCollections.includes(collectionName);
}

/**
 * Returns the list of system field names for the users collection
 * These fields are automatically provided by PocketBase for auth collections
 * and should not be included when generating migrations for users collection extensions
 *
 * @param config - Optional configuration with custom system fields
 * @returns Set of system field names
 */
export function getUsersSystemFields(config?: DiffEngineConfig): Set<string> {
  const mergedConfig = mergeConfig(config);
  return new Set(mergedConfig.usersSystemFields);
}

/**
 * Compares two values for equality, handling deep object comparison
 *
 * @param a - First value
 * @param b - Second value
 * @returns True if values are equal
 */
export function areValuesEqual(a: any, b: any): boolean {
  // Handle null/undefined
  if (a === b) return true;
  if (a == null || b == null) return false;

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => areValuesEqual(val, b[idx]));
  }

  // Handle objects
  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    return keysA.every((key) => areValuesEqual(a[key], b[key]));
  }

  // Primitive comparison
  return a === b;
}

/**
 * Normalizes a field option value to account for PocketBase defaults
 * Returns the normalized value, treating default values as equivalent to undefined
 *
 * @param key - Option key name
 * @param value - Option value
 * @param fieldType - Field type
 * @returns Normalized value (undefined if it's a default value)
 */
export function normalizeOptionValue(key: string, value: any, fieldType: string): any {
  // PocketBase writes every option a field type has, at its zero value, into
  // the migrations it authors itself. A schema that simply does not set the
  // option means the same thing, so the zero value has to compare equal to a
  // missing one — otherwise replaying a PocketBase-authored migration reports
  // a modification the generator can never settle.
  //
  // `null` arrives from the same place: it is what PocketBase writes for its
  // pointer-typed options (a number field's `min`/`max`), and what a migration
  // clearing an option used to assign.
  if (value === null || value === undefined) {
    return undefined;
  }

  const unsetValue = getFieldOptionUnsetValue(fieldType, key);
  if (unsetValue !== undefined && areValuesEqual(value, unsetValue)) {
    return undefined;
  }

  // A select field's `values` is stored as an ordered list, but the order
  // carries no data semantics — it only fixes the option order in the admin
  // UI, and PocketBase appends options added there to the end. A schema
  // listing the same options in a different order describes the same field,
  // so compare them as a multiset (sorted copy, duplicates still count).
  // A genuine add or remove is still reported, and the generator writes the
  // whole array back in the schema's order, so the order re-syncs then.
  if (key === "values" && fieldType === "select" && Array.isArray(value)) {
    return [...value].sort();
  }

  // The remaining defaults are not zero values, so they need naming:
  // maxSelect: 1 is what a single-value select or file field carries
  if (key === "maxSelect" && value === 1 && (fieldType === "select" || fieldType === "file")) {
    return undefined; // Treat as undefined to match missing default
  }

  // min: 1 can be a default for some PocketBase versions/number fields
  if (key === "min" && value === 1 && fieldType === "number") {
    return undefined;
  }

  // Autodate defaults
  if (fieldType === "autodate") {
    if (key === "onCreate" && value === true) {
      return undefined;
    }
    if (key === "onUpdate" && value === false) {
      return undefined;
    }
  }

  return value;
}
