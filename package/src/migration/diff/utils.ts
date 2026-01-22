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
  // maxSelect: 1 is the default for select and file fields
  if (key === "maxSelect" && value === 1 && (fieldType === "select" || fieldType === "file")) {
    return undefined; // Treat as undefined to match missing default
  }

  // maxSize: 0 is default for file fields
  if (key === "maxSize" && value === 0 && fieldType === "file") {
    return undefined;
  }

  // min: 1 can be a default for some PocketBase versions/number fields
  if (key === "min" && value === 1 && fieldType === "number") {
    return undefined;
  }

  // Empty arrays are defaults for file fields
  if (fieldType === "file") {
    if (key === "mimeTypes" && Array.isArray(value) && value.length === 0) {
      return undefined;
    }
    if (key === "thumbs" && Array.isArray(value) && value.length === 0) {
      return undefined;
    }
    if (key === "protected" && value === false) {
      return undefined;
    }
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
