/**
 * Diff Engine component
 * Compares current schema with previous snapshot and identifies changes
 *
 * This module provides a standalone, configurable diff engine that can be used
 * by consumer projects to compare schema definitions and detect changes.
 */

import type {
  APIRuleType,
  CollectionModification,
  CollectionSchema,
  FieldChange,
  FieldDefinition,
  FieldModification,
  PermissionChange,
  RuleUpdate,
  SchemaDefinition,
  SchemaDiff,
  SchemaSnapshot,
} from "./types";
import { CollectionIdRegistry } from "./utils/collection-id-generator.js";

/**
 * Configuration options for the diff engine
 */
export interface DiffEngineConfig {
  /**
   * Whether to warn on collection deletions
   * Defaults to true
   */
  warnOnDelete?: boolean;

  /**
   * Whether to require --force flag for destructive changes
   * Defaults to true
   */
  requireForceForDestructive?: boolean;

  /**
   * Severity threshold for requiring force flag
   * 'high' = only collection/field deletions and type changes
   * 'medium' = includes making fields required
   * 'low' = includes any constraint changes
   * Defaults to 'high'
   */
  severityThreshold?: "high" | "medium" | "low";

  /**
   * Custom system collections to exclude from diff
   * These collections will not be created or deleted
   */
  systemCollections?: string[];

  /**
   * Custom system fields to exclude from user collection diffs
   * These fields will not be included in fieldsToAdd for the users collection
   */
  usersSystemFields?: string[];
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<DiffEngineConfig> = {
  warnOnDelete: true,
  requireForceForDestructive: true,
  severityThreshold: "high",
  systemCollections: ["_mfas", "_otps", "_externalAuths", "_authOrigins", "_superusers"],
  usersSystemFields: ["id", "password", "tokenKey", "email", "emailVisibility", "verified", "created", "updated"],
};

/**
 * Merges user config with defaults
 */
function mergeConfig(config?: DiffEngineConfig): Required<DiffEngineConfig> {
  return {
    ...DEFAULT_CONFIG,
    ...config,
  };
}

/**
 * Destructive change information
 */
export interface DestructiveChange {
  type: "collection_delete" | "field_delete" | "type_change" | "required_change" | "constraint_change";
  severity: "high" | "medium" | "low";
  collection: string;
  field?: string;
  description: string;
  oldValue?: any;
  newValue?: any;
}

/**
 * Change summary for status reporting
 */
export interface ChangeSummary {
  totalChanges: number;
  collectionsToCreate: number;
  collectionsToDelete: number;
  collectionsToModify: number;
  fieldsToAdd: number;
  fieldsToRemove: number;
  fieldsToModify: number;
  indexChanges: number;
  ruleChanges: number;
  permissionChanges: number;
  destructiveChanges: DestructiveChange[];
  nonDestructiveChanges: string[];
}

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
 * Filters system collections from a schema definition
 * Returns a new SchemaDefinition with only custom (non-system) collections
 *
 * @param schema - Schema definition to filter
 * @param config - Optional configuration
 * @returns Filtered SchemaDefinition without system collections
 */
export function filterSystemCollections(schema: SchemaDefinition, config?: DiffEngineConfig): SchemaDefinition {
  const filteredCollections = new Map<string, CollectionSchema>();

  for (const [collectionName, collectionSchema] of schema.collections) {
    if (!isSystemCollection(collectionName, config)) {
      filteredCollections.set(collectionName, collectionSchema);
    }
  }

  return {
    collections: filteredCollections,
  };
}

/**
 * Identifies new collections in schema that don't exist in snapshot
 *
 * @param currentSchema - Current schema definition
 * @param previousSnapshot - Previous schema snapshot
 * @returns Array of new collections
 */
export function findNewCollections(
  currentSchema: SchemaDefinition,
  previousSnapshot: SchemaSnapshot | null
): CollectionSchema[] {
  const newCollections: CollectionSchema[] = [];

  // If no previous snapshot, all collections are new
  if (!previousSnapshot) {
    return Array.from(currentSchema.collections.values());
  }

  // Find collections in current schema that don't exist in snapshot
  for (const [collectionName, collectionSchema] of currentSchema.collections) {
    if (!previousSnapshot.collections.has(collectionName)) {
      newCollections.push(collectionSchema);
    }
  }

  return newCollections;
}

/**
 * Identifies collections removed from schema (exist in snapshot but not in current schema)
 *
 * @param currentSchema - Current schema definition
 * @param previousSnapshot - Previous schema snapshot
 * @returns Array of removed collections
 */
export function findRemovedCollections(
  currentSchema: SchemaDefinition,
  previousSnapshot: SchemaSnapshot | null
): CollectionSchema[] {
  const removedCollections: CollectionSchema[] = [];

  // If no previous snapshot, nothing can be removed
  if (!previousSnapshot) {
    return removedCollections;
  }

  // Find collections in snapshot that don't exist in current schema
  for (const [collectionName, collectionSchema] of previousSnapshot.collections) {
    if (!currentSchema.collections.has(collectionName)) {
      removedCollections.push(collectionSchema);
    }
  }

  return removedCollections;
}

/**
 * Matches collections by name between current schema and snapshot
 * Returns pairs of [current, previous] for collections that exist in both
 *
 * @param currentSchema - Current schema definition
 * @param previousSnapshot - Previous schema snapshot
 * @returns Array of matched collection pairs
 */
export function matchCollectionsByName(
  currentSchema: SchemaDefinition,
  previousSnapshot: SchemaSnapshot | null
): Array<[CollectionSchema, CollectionSchema]> {
  const matches: Array<[CollectionSchema, CollectionSchema]> = [];

  // If no previous snapshot, no matches possible
  if (!previousSnapshot) {
    return matches;
  }

  // Create a case-insensitive lookup map for previous collections
  const previousCollectionsLower = new Map<string, [string, CollectionSchema]>();
  for (const [name, collection] of previousSnapshot.collections) {
    previousCollectionsLower.set(name.toLowerCase(), [name, collection]);
  }

  // Find collections that exist in both current and previous (case-insensitive)
  for (const [collectionName, currentCollection] of currentSchema.collections) {
    const previousEntry = previousCollectionsLower.get(collectionName.toLowerCase());

    if (previousEntry) {
      const [, previousCollection] = previousEntry;
      matches.push([currentCollection, previousCollection]);
    }
  }

  return matches;
}

/**
 * Identifies new fields in current collection that don't exist in previous
 *
 * @param currentFields - Current collection fields
 * @param previousFields - Previous collection fields
 * @returns Array of new fields
 */
export function findNewFields(currentFields: FieldDefinition[], previousFields: FieldDefinition[]): FieldDefinition[] {
  const newFields: FieldDefinition[] = [];
  const previousFieldNames = new Set(previousFields.map((f) => f.name));

  for (const currentField of currentFields) {
    if (!previousFieldNames.has(currentField.name)) {
      newFields.push(currentField);
    }
  }

  return newFields;
}

/**
 * Identifies fields removed from current collection (exist in previous but not in current)
 *
 * @param currentFields - Current collection fields
 * @param previousFields - Previous collection fields
 * @returns Array of removed fields
 */
export function findRemovedFields(
  currentFields: FieldDefinition[],
  previousFields: FieldDefinition[]
): FieldDefinition[] {
  const removedFields: FieldDefinition[] = [];
  const currentFieldNames = new Set(currentFields.map((f) => f.name));

  for (const previousField of previousFields) {
    if (!currentFieldNames.has(previousField.name)) {
      removedFields.push(previousField);
    }
  }

  return removedFields;
}

/**
 * Matches fields by name between current and previous collections
 * Returns pairs of [current, previous] for fields that exist in both
 *
 * @param currentFields - Current collection fields
 * @param previousFields - Previous collection fields
 * @returns Array of matched field pairs
 */
export function matchFieldsByName(
  currentFields: FieldDefinition[],
  previousFields: FieldDefinition[]
): Array<[FieldDefinition, FieldDefinition]> {
  const matches: Array<[FieldDefinition, FieldDefinition]> = [];

  // Create a map of previous fields by name for efficient lookup
  const previousFieldMap = new Map<string, FieldDefinition>();
  for (const previousField of previousFields) {
    previousFieldMap.set(previousField.name, previousField);
  }

  // Find matching fields
  for (const currentField of currentFields) {
    const previousField = previousFieldMap.get(currentField.name);

    if (previousField) {
      matches.push([currentField, previousField]);
    }
  }

  return matches;
}

/**
 * Compares two values for equality, handling deep object comparison
 *
 * @param a - First value
 * @param b - Second value
 * @returns True if values are equal
 */
function areValuesEqual(a: any, b: any): boolean {
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
 * Compares field types between current and previous
 *
 * @param currentField - Current field definition
 * @param previousField - Previous field definition
 * @returns FieldChange if types differ, null otherwise
 */
export function compareFieldTypes(currentField: FieldDefinition, previousField: FieldDefinition): FieldChange | null {
  if (currentField.type !== previousField.type) {
    return {
      property: "type",
      oldValue: previousField.type,
      newValue: currentField.type,
    };
  }

  return null;
}

/**
 * Compares field constraints (required, unique) between current and previous
 *
 * @param currentField - Current field definition
 * @param previousField - Previous field definition
 * @returns Array of FieldChange for constraint differences
 */
export function compareFieldConstraints(currentField: FieldDefinition, previousField: FieldDefinition): FieldChange[] {
  const changes: FieldChange[] = [];

  // Compare required constraint
  if (currentField.required !== previousField.required) {
    changes.push({
      property: "required",
      oldValue: previousField.required,
      newValue: currentField.required,
    });
  }

  // Compare unique constraint
  if (currentField.unique !== previousField.unique) {
    changes.push({
      property: "unique",
      oldValue: previousField.unique,
      newValue: currentField.unique,
    });
  }

  return changes;
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
function normalizeOptionValue(key: string, value: any, fieldType: string): any {
  // maxSelect: 1 is the default for select and file fields
  if (key === "maxSelect" && value === 1 && (fieldType === "select" || fieldType === "file")) {
    return undefined; // Treat as undefined to match missing default
  }

  // maxSize: 0 is default for file fields
  if (key === "maxSize" && value === 0 && fieldType === "file") {
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

/**
 * Compares field options (min, max, pattern, etc.) between current and previous
 *
 * @param currentField - Current field definition
 * @param previousField - Previous field definition
 * @returns Array of FieldChange for option differences
 */
export function compareFieldOptions(currentField: FieldDefinition, previousField: FieldDefinition): FieldChange[] {
  const changes: FieldChange[] = [];

  const currentOptions = currentField.options || {};
  const previousOptions = previousField.options || {};

  // Get all unique option keys
  const allKeys = new Set([...Object.keys(currentOptions), ...Object.keys(previousOptions)]);

  // Compare each option
  // Use currentField.type for normalization since types should match at this point
  // (type changes are handled separately in compareFieldTypes)
  const fieldType = currentField.type;

  for (const key of allKeys) {
    const currentValue = currentOptions[key];
    const previousValue = previousOptions[key];

    // Normalize values to account for default values
    // This ensures that maxSelect: 1 (default) is treated the same as undefined (missing default)
    const normalizedCurrent = normalizeOptionValue(key, currentValue, fieldType);
    const normalizedPrevious = normalizeOptionValue(key, previousValue, fieldType);

    // Handle undefined values - if both are undefined (or normalized to undefined), that's not a change
    if (normalizedCurrent === undefined && normalizedPrevious === undefined) {
      continue;
    }

    if (!areValuesEqual(normalizedCurrent, normalizedPrevious)) {
      changes.push({
        property: `options.${key}`,
        oldValue: previousValue,
        newValue: currentValue,
      });
    }
  }

  return changes;
}

/**
 * Compares relation configurations between current and previous
 *
 * @param currentField - Current field definition
 * @param previousField - Previous field definition
 * @returns Array of FieldChange for relation differences
 */
export function compareRelationConfigurations(
  currentField: FieldDefinition,
  previousField: FieldDefinition,
  collectionIdToName?: Map<string, string>
): FieldChange[] {
  const changes: FieldChange[] = [];

  const currentRelation = currentField.relation;
  const previousRelation = previousField.relation;

  // If one has relation and other doesn't, that's a type change (handled elsewhere)
  if (!currentRelation && !previousRelation) {
    return changes;
  }

  if (!currentRelation || !previousRelation) {
    // This shouldn't happen if types match, but handle gracefully
    return changes;
  }

  // Compare relation properties
  // Note: collectionId should already be resolved to collection name during parsing
  // This normalization is just a safety net for edge cases
  const normalizeCollection = (collection: string): string => {
    if (!collection) return collection;

    // Resolve ID to name if possible
    if (collectionIdToName && collectionIdToName.has(collection)) {
      return collectionIdToName.get(collection)!;
    }

    // Handle expressions that might not have been parsed correctly
    const nameMatch = collection.match(/app\.findCollectionByNameOrId\s*\(\s*["']([^"']+)["']\s*\)/);
    if (nameMatch) {
      return nameMatch[1];
    }
    return collection;
  };

  const normalizedCurrent = normalizeCollection(currentRelation.collection);
  // We resolve the ID from the previous relation (snapshot) to its name if available
  const normalizedPrevious = normalizeCollection(previousRelation.collection);

  // Only report a change if the normalized values differ
  // Use case-insensitive comparison for collection names
  if (normalizedCurrent.toLowerCase() !== normalizedPrevious.toLowerCase()) {
    changes.push({
      property: "relation.collection",
      oldValue: previousRelation.collection,
      newValue: currentRelation.collection,
    });
  }

  if (currentRelation.cascadeDelete !== previousRelation.cascadeDelete) {
    changes.push({
      property: "relation.cascadeDelete",
      oldValue: previousRelation.cascadeDelete,
      newValue: currentRelation.cascadeDelete,
    });
  }

  // Normalize maxSelect: 1 to undefined/null as it's often the default or treated as such
  const normalizeMax = (val: number | null | undefined) => (val === 1 ? null : val);
  const currentMax = normalizeMax(currentRelation.maxSelect);
  const previousMax = normalizeMax(previousRelation.maxSelect);

  // Use loose equality to handle null vs undefined
  if (currentMax != previousMax) {
    changes.push({
      property: "relation.maxSelect",
      oldValue: previousRelation.maxSelect,
      newValue: currentRelation.maxSelect,
    });
  }

  // Normalize minSelect: 0 to undefined/null
  const normalizeMin = (val: number | null | undefined) => (val === 0 ? null : val);
  const currentMin = normalizeMin(currentRelation.minSelect);
  const previousMin = normalizeMin(previousRelation.minSelect);

  if (currentMin != previousMin) {
    changes.push({
      property: "relation.minSelect",
      oldValue: previousRelation.minSelect,
      newValue: currentRelation.minSelect,
    });
  }

  return changes;
}

/**
 * Detects all changes between two field definitions
 * Combines type, constraint, option, and relation changes
 *
 * @param currentField - Current field definition
 * @param previousField - Previous field definition
 * @returns Array of all detected changes
 */
export function detectFieldChanges(
  currentField: FieldDefinition,
  previousField: FieldDefinition,
  collectionIdToName?: Map<string, string>
): FieldChange[] {
  const changes: FieldChange[] = [];

  // Compare types
  const typeChange = compareFieldTypes(currentField, previousField);
  if (typeChange) {
    changes.push(typeChange);
  }

  // Compare constraints
  changes.push(...compareFieldConstraints(currentField, previousField));

  // Compare options
  changes.push(...compareFieldOptions(currentField, previousField));

  // Compare relation configurations (if applicable)
  if (currentField.type === "relation" && previousField.type === "relation") {
    changes.push(...compareRelationConfigurations(currentField, previousField, collectionIdToName));
  }

  return changes;
}

/**
 * Compares indexes between current and previous collections
 *
 * @param currentIndexes - Current collection indexes
 * @param previousIndexes - Previous collection indexes
 * @returns Object with indexes to add and remove
 */
function compareIndexes(
  currentIndexes: string[] = [],
  previousIndexes: string[] = []
): { indexesToAdd: string[]; indexesToRemove: string[] } {
  const currentSet = new Set(currentIndexes);
  const previousSet = new Set(previousIndexes);

  const indexesToAdd = currentIndexes.filter((idx) => !previousSet.has(idx));
  const indexesToRemove = previousIndexes.filter((idx) => !currentSet.has(idx));

  return { indexesToAdd, indexesToRemove };
}

/**
 * Compares API rules between current and previous collections
 *
 * @param currentRules - Current collection rules
 * @param previousRules - Previous collection rules
 * @returns Array of rule updates
 */
function compareRules(
  currentRules: CollectionSchema["rules"],
  previousRules: CollectionSchema["rules"],
  currentPermissions?: CollectionSchema["permissions"],
  previousPermissions?: CollectionSchema["permissions"]
): RuleUpdate[] {
  const updates: RuleUpdate[] = [];

  const ruleTypes: Array<keyof NonNullable<CollectionSchema["rules"]>> = [
    "listRule",
    "viewRule",
    "createRule",
    "updateRule",
    "deleteRule",
    "manageRule",
  ];

  for (const ruleType of ruleTypes) {
    // Use rules if available, otherwise fall back to permissions (they're the same thing)
    const currentValue = currentRules?.[ruleType] ?? currentPermissions?.[ruleType] ?? null;
    const previousValue = previousRules?.[ruleType] ?? previousPermissions?.[ruleType] ?? null;

    if (currentValue !== previousValue) {
      updates.push({
        ruleType: ruleType as RuleUpdate["ruleType"],
        oldValue: previousValue,
        newValue: currentValue,
      });
    }
  }

  return updates;
}

/**
 * Compares permissions between current and previous collections
 * Detects changes in permission rules defined in schema
 *
 * @param currentPermissions - Current collection permissions
 * @param previousPermissions - Previous collection permissions
 * @returns Array of permission changes
 */
export function comparePermissions(
  currentPermissions: CollectionSchema["permissions"],
  previousPermissions: CollectionSchema["permissions"]
): PermissionChange[] {
  const changes: PermissionChange[] = [];

  const ruleTypes: APIRuleType[] = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule", "manageRule"];

  for (const ruleType of ruleTypes) {
    const currentValue = currentPermissions?.[ruleType] ?? null;
    const previousValue = previousPermissions?.[ruleType] ?? null;

    // Compare permission values
    if (currentValue !== previousValue) {
      changes.push({
        ruleType,
        oldValue: previousValue,
        newValue: currentValue,
      });
    }
  }

  return changes;
}

/**
 * Compares fields between current and previous collections
 * Identifies new, removed, and modified fields
 * For the users collection, filters out system fields from fieldsToAdd
 *
 * @param currentCollection - Current collection schema
 * @param previousCollection - Previous collection schema
 * @param config - Optional configuration
 * @returns Object with field changes
 */
function compareCollectionFields(
  currentCollection: CollectionSchema,
  previousCollection: CollectionSchema,
  config?: DiffEngineConfig,
  collectionIdToName?: Map<string, string>
): {
  fieldsToAdd: FieldDefinition[];
  fieldsToRemove: FieldDefinition[];
  fieldsToModify: FieldModification[];
} {
  let fieldsToAdd = findNewFields(currentCollection.fields, previousCollection.fields);
  const fieldsToRemove = findRemovedFields(currentCollection.fields, previousCollection.fields);
  const fieldsToModify: FieldModification[] = [];

  // For users collection, filter out system fields from fieldsToAdd
  // System fields are automatically provided by PocketBase and should not be in migrations
  if (currentCollection.name === "users") {
    const systemFields = getUsersSystemFields(config);
    fieldsToAdd = fieldsToAdd.filter((field) => !systemFields.has(field.name));
  }

  // Check for modified fields
  const matchedFields = matchFieldsByName(currentCollection.fields, previousCollection.fields);

  for (const [currentField, previousField] of matchedFields) {
    const changes = detectFieldChanges(currentField, previousField, collectionIdToName);

    if (changes.length > 0) {
      fieldsToModify.push({
        fieldName: currentField.name,
        currentDefinition: previousField,
        newDefinition: currentField,
        changes,
      });
    }
  }

  return { fieldsToAdd, fieldsToRemove, fieldsToModify };
}

/**
 * Builds a CollectionModification for a matched collection pair
 *
 * @param currentCollection - Current collection schema
 * @param previousCollection - Previous collection schema
 * @param config - Optional configuration
 * @returns CollectionModification object
 */
function buildCollectionModification(
  currentCollection: CollectionSchema,
  previousCollection: CollectionSchema,
  config?: DiffEngineConfig,
  collectionIdToName?: Map<string, string>
): CollectionModification {
  // Compare fields
  const { fieldsToAdd, fieldsToRemove, fieldsToModify } = compareCollectionFields(
    currentCollection,
    previousCollection,
    config,
    collectionIdToName
  );

  // Compare indexes
  const { indexesToAdd, indexesToRemove } = compareIndexes(currentCollection.indexes, previousCollection.indexes);

  // Compare rules (also check permissions as fallback since they're the same thing)
  const rulesToUpdate = compareRules(
    currentCollection.rules,
    previousCollection.rules,
    currentCollection.permissions,
    previousCollection.permissions
  );

  // Compare permissions
  const permissionsToUpdate = comparePermissions(currentCollection.permissions, previousCollection.permissions);

  return {
    collection: currentCollection.name,
    fieldsToAdd,
    fieldsToRemove,
    fieldsToModify,
    indexesToAdd,
    indexesToRemove,
    rulesToUpdate,
    permissionsToUpdate,
  };
}

/**
 * Checks if a collection modification has any actual changes
 *
 * @param modification - Collection modification to check
 * @returns True if there are any changes
 */
function hasChanges(modification: CollectionModification): boolean {
  return (
    modification.fieldsToAdd.length > 0 ||
    modification.fieldsToRemove.length > 0 ||
    modification.fieldsToModify.length > 0 ||
    modification.indexesToAdd.length > 0 ||
    modification.indexesToRemove.length > 0 ||
    modification.rulesToUpdate.length > 0 ||
    modification.permissionsToUpdate.length > 0
  );
}

/**
 * Aggregates all detected changes into a SchemaDiff
 * Main entry point for diff comparison
 *
 * @param currentSchema - Current schema definition
 * @param previousSnapshot - Previous schema snapshot
 * @param config - Optional configuration
 * @returns Complete SchemaDiff with all changes
 */
export function aggregateChanges(
  currentSchema: SchemaDefinition,
  previousSnapshot: SchemaSnapshot | null,
  config?: DiffEngineConfig
): SchemaDiff {
  // Build lookup map for ID -> Name from previous snapshot
  // This helps resolve relations where snapshot uses ID but schema uses Name
  const collectionIdToName = new Map<string, string>();
  if (previousSnapshot) {
    for (const [name, collection] of previousSnapshot.collections) {
      if (collection.id) {
        collectionIdToName.set(collection.id, name);
      }
    }
  }

  // Find new and removed collections
  const collectionsToCreate = findNewCollections(currentSchema, previousSnapshot);
  const collectionsToDelete = findRemovedCollections(currentSchema, previousSnapshot);

  // Filter out system collections from create and delete operations
  const filteredCollectionsToCreate = collectionsToCreate.filter(
    (collection) => !isSystemCollection(collection.name, config)
  );
  const filteredCollectionsToDelete = collectionsToDelete.filter(
    (collection) => !isSystemCollection(collection.name, config)
  );

  // Generate and assign collection IDs for new collections
  const registry = new CollectionIdRegistry();
  const collectionsWithIds = filteredCollectionsToCreate.map((collection) => {
    // If the collection already has an ID, register it and use it
    if (collection.id) {
      registry.register(collection.id);
      return collection;
    }

    // Generate a new ID for the collection (pass name for special handling)
    const id = registry.generate(collection.name);
    return {
      ...collection,
      id,
    };
  });

  // Find modified collections
  const collectionsToModify: CollectionModification[] = [];
  const matchedCollections = matchCollectionsByName(currentSchema, previousSnapshot);

  for (const [currentCollection, previousCollection] of matchedCollections) {
    const modification = buildCollectionModification(currentCollection, previousCollection, config, collectionIdToName);

    // Only include if there are actual changes
    // Note: We allow modifications to the users collection (non-system)
    if (hasChanges(modification)) {
      collectionsToModify.push(modification);
    }
  }

  // Build map of existing collection names to their IDs from the snapshot
  // This is used by the generator to resolve relation field references
  const existingCollectionIds = new Map<string, string>();
  if (previousSnapshot) {
    for (const [name, collection] of previousSnapshot.collections) {
      if (collection.id) {
        existingCollectionIds.set(name, collection.id);
      }
    }
  }

  return {
    collectionsToCreate: collectionsWithIds,
    collectionsToDelete: filteredCollectionsToDelete,
    collectionsToModify,
    existingCollectionIds,
  };
}

/**
 * Detects destructive changes in a schema diff
 * Returns detailed information about each destructive change
 *
 * @param diff - Schema diff to analyze
 * @param config - Optional configuration for severity thresholds
 * @returns Array of destructive changes with severity information
 */
export function detectDestructiveChanges(diff: SchemaDiff, config?: DiffEngineConfig): DestructiveChange[] {
  const destructiveChanges: DestructiveChange[] = [];
  const mergedConfig = mergeConfig(config);

  // Collection deletions are always high severity
  for (const collection of diff.collectionsToDelete) {
    destructiveChanges.push({
      type: "collection_delete",
      severity: "high",
      collection: collection.name,
      description: `Delete collection: ${collection.name}`,
    });
  }

  // Analyze modifications
  for (const modification of diff.collectionsToModify) {
    const collectionName = modification.collection;

    // Field deletions are high severity
    for (const field of modification.fieldsToRemove) {
      destructiveChanges.push({
        type: "field_delete",
        severity: "high",
        collection: collectionName,
        field: field.name,
        description: `Delete field: ${collectionName}.${field.name}`,
      });
    }

    // Field modifications can be various severities
    for (const fieldMod of modification.fieldsToModify) {
      const typeChange = fieldMod.changes.find((c) => c.property === "type");
      const requiredChange = fieldMod.changes.find((c) => c.property === "required" && c.newValue === true);

      if (typeChange) {
        destructiveChanges.push({
          type: "type_change",
          severity: "high",
          collection: collectionName,
          field: fieldMod.fieldName,
          description: `Change field type: ${collectionName}.${fieldMod.fieldName} (${typeChange.oldValue} → ${typeChange.newValue})`,
          oldValue: typeChange.oldValue,
          newValue: typeChange.newValue,
        });
      }

      if (requiredChange && mergedConfig.severityThreshold !== "high") {
        destructiveChanges.push({
          type: "required_change",
          severity: "medium",
          collection: collectionName,
          field: fieldMod.fieldName,
          description: `Make field required: ${collectionName}.${fieldMod.fieldName}`,
          oldValue: false,
          newValue: true,
        });
      }

      // Other constraint changes at low severity
      if (mergedConfig.severityThreshold === "low") {
        const otherChanges = fieldMod.changes.filter((c) => c.property !== "type" && c.property !== "required");
        for (const change of otherChanges) {
          destructiveChanges.push({
            type: "constraint_change",
            severity: "low",
            collection: collectionName,
            field: fieldMod.fieldName,
            description: `Change constraint: ${collectionName}.${fieldMod.fieldName}.${change.property}`,
            oldValue: change.oldValue,
            newValue: change.newValue,
          });
        }
      }
    }
  }

  return destructiveChanges;
}

/**
 * Categorizes changes by severity
 * Returns object with destructive and non-destructive changes
 *
 * @param diff - Schema diff to categorize
 * @param config - Optional configuration
 * @returns Object with categorized changes
 */
export function categorizeChangesBySeverity(
  diff: SchemaDiff,
  _config?: DiffEngineConfig
): {
  destructive: string[];
  nonDestructive: string[];
} {
  const destructive: string[] = [];
  const nonDestructive: string[] = [];

  // Collection deletions are destructive
  for (const collection of diff.collectionsToDelete) {
    destructive.push(`Delete collection: ${collection.name}`);
  }

  // Collection creations are non-destructive
  for (const collection of diff.collectionsToCreate) {
    nonDestructive.push(`Create collection: ${collection.name}`);
  }

  // Analyze modifications
  for (const modification of diff.collectionsToModify) {
    const collectionName = modification.collection;

    // Field deletions are destructive
    for (const field of modification.fieldsToRemove) {
      destructive.push(`Delete field: ${collectionName}.${field.name}`);
    }

    // Field additions are non-destructive
    for (const field of modification.fieldsToAdd) {
      nonDestructive.push(`Add field: ${collectionName}.${field.name}`);
    }

    // Field modifications can be destructive or non-destructive
    for (const fieldMod of modification.fieldsToModify) {
      const hasTypeChange = fieldMod.changes.some((c) => c.property === "type");
      const hasRequiredChange = fieldMod.changes.some((c) => c.property === "required" && c.newValue === true);

      if (hasTypeChange) {
        destructive.push(
          `Change field type: ${collectionName}.${fieldMod.fieldName} (${fieldMod.changes.find((c) => c.property === "type")?.oldValue} → ${fieldMod.changes.find((c) => c.property === "type")?.newValue})`
        );
      } else if (hasRequiredChange) {
        destructive.push(`Make field required: ${collectionName}.${fieldMod.fieldName}`);
      } else {
        nonDestructive.push(`Modify field: ${collectionName}.${fieldMod.fieldName}`);
      }
    }

    // Index changes are generally non-destructive
    for (const _index of modification.indexesToAdd) {
      nonDestructive.push(`Add index: ${collectionName}`);
    }

    for (const _index of modification.indexesToRemove) {
      nonDestructive.push(`Remove index: ${collectionName}`);
    }

    // Rule changes are non-destructive
    for (const rule of modification.rulesToUpdate) {
      nonDestructive.push(`Update rule: ${collectionName}.${rule.ruleType}`);
    }
  }

  return { destructive, nonDestructive };
}

/**
 * Generates a summary of all changes in a diff
 * Useful for status reporting and user feedback
 *
 * @param diff - Schema diff to summarize
 * @param config - Optional configuration
 * @returns Change summary with counts and details
 */
export function generateChangeSummary(diff: SchemaDiff, config?: DiffEngineConfig): ChangeSummary {
  const destructiveChanges = detectDestructiveChanges(diff, config);
  const { nonDestructive } = categorizeChangesBySeverity(diff, config);

  let fieldsToAdd = 0;
  let fieldsToRemove = 0;
  let fieldsToModify = 0;
  let indexChanges = 0;
  let ruleChanges = 0;
  let permissionChanges = 0;

  for (const modification of diff.collectionsToModify) {
    fieldsToAdd += modification.fieldsToAdd.length;
    fieldsToRemove += modification.fieldsToRemove.length;
    fieldsToModify += modification.fieldsToModify.length;
    indexChanges += modification.indexesToAdd.length + modification.indexesToRemove.length;
    ruleChanges += modification.rulesToUpdate.length;
    permissionChanges += modification.permissionsToUpdate.length;
  }

  return {
    totalChanges: diff.collectionsToCreate.length + diff.collectionsToDelete.length + diff.collectionsToModify.length,
    collectionsToCreate: diff.collectionsToCreate.length,
    collectionsToDelete: diff.collectionsToDelete.length,
    collectionsToModify: diff.collectionsToModify.length,
    fieldsToAdd,
    fieldsToRemove,
    fieldsToModify,
    indexChanges,
    ruleChanges,
    permissionChanges,
    destructiveChanges,
    nonDestructiveChanges: nonDestructive,
  };
}

/**
 * Checks if a diff requires the --force flag based on configuration
 *
 * @param diff - Schema diff to check
 * @param config - Configuration with severity threshold
 * @returns True if force flag is required
 */
export function requiresForceFlag(diff: SchemaDiff, config?: DiffEngineConfig): boolean {
  const mergedConfig = mergeConfig(config);

  if (!mergedConfig.requireForceForDestructive) {
    return false;
  }

  const destructiveChanges = detectDestructiveChanges(diff, config);

  // Filter by severity threshold
  const relevantChanges = destructiveChanges.filter((change) => {
    switch (mergedConfig.severityThreshold) {
      case "high":
        return change.severity === "high";
      case "medium":
        return change.severity === "high" || change.severity === "medium";
      case "low":
        return true;
      default:
        return change.severity === "high";
    }
  });

  return relevantChanges.length > 0;
}

/**
 * Main comparison function
 * Compares current schema with previous snapshot and returns complete diff
 *
 * @param currentSchema - Current schema definition
 * @param previousSnapshot - Previous schema snapshot (null for first run)
 * @param config - Optional configuration
 * @returns Complete SchemaDiff with all detected changes
 */
export function compare(
  currentSchema: SchemaDefinition,
  previousSnapshot: SchemaSnapshot | null,
  config?: DiffEngineConfig
): SchemaDiff {
  return aggregateChanges(currentSchema, previousSnapshot, config);
}

/**
 * DiffEngine class for object-oriented usage
 * Provides a stateful interface for schema comparison
 */
export class DiffEngine {
  private config: Required<DiffEngineConfig>;

  constructor(config?: DiffEngineConfig) {
    this.config = mergeConfig(config);
  }

  /**
   * Compares current schema with previous snapshot
   */
  compare(currentSchema: SchemaDefinition, previousSnapshot: SchemaSnapshot | null): SchemaDiff {
    return compare(currentSchema, previousSnapshot, this.config);
  }

  /**
   * Detects destructive changes in a diff
   */
  detectDestructiveChanges(diff: SchemaDiff): DestructiveChange[] {
    return detectDestructiveChanges(diff, this.config);
  }

  /**
   * Categorizes changes by severity
   */
  categorizeChangesBySeverity(diff: SchemaDiff): { destructive: string[]; nonDestructive: string[] } {
    return categorizeChangesBySeverity(diff, this.config);
  }

  /**
   * Generates a summary of changes
   */
  generateChangeSummary(diff: SchemaDiff): ChangeSummary {
    return generateChangeSummary(diff, this.config);
  }

  /**
   * Checks if force flag is required
   */
  requiresForceFlag(diff: SchemaDiff): boolean {
    return requiresForceFlag(diff, this.config);
  }
}
