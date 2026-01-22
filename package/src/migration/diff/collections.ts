import type {
  CollectionModification,
  CollectionSchema,
  FieldDefinition,
  FieldModification,
  SchemaDefinition,
  SchemaSnapshot,
} from "../types";
import { type DiffEngineConfig } from "./config";
import { detectFieldChanges, findNewFields, findRemovedFields, matchFieldsByName } from "./fields";
import { compareIndexes } from "./indexes";
import { comparePermissions, compareRules } from "./rules";
import { getUsersSystemFields, isSystemCollection } from "./utils";

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
  let fieldsToRemove = findRemovedFields(currentCollection.fields, previousCollection.fields);
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

  // Detect Renames (Heuristic)
  // If we have single removed and added fields of the same type, consider it a rename
  const processedAddIndices = new Set<number>();
  const processedRemoveIndices = new Set<number>();

  // Helper to resolve collection name from ID/expression
  const resolveCollectionName = (val: string): string => {
    if (!val) return val;
    if (collectionIdToName && collectionIdToName.has(val)) return collectionIdToName.get(val)!;
    const match = val.match(/app\.findCollectionByNameOrId\s*\(\s*["']([^"']+)["']\s*\)/);
    return match ? match[1] : val;
  };

  // Group fields by type
  const addedByType = new Map<string, number[]>();
  fieldsToAdd.forEach((field, index) => {
    const type = field.type;
    if (!addedByType.has(type)) addedByType.set(type, []);
    addedByType.get(type)!.push(index);
  });

  const removedByType = new Map<string, number[]>();
  fieldsToRemove.forEach((field, index) => {
    const type = field.type;
    if (!removedByType.has(type)) removedByType.set(type, []);
    removedByType.get(type)!.push(index);
  });

  // Check each type for potential renames
  for (const [type, removedIndices] of removedByType) {
    const addedIndices = addedByType.get(type);

    // Heuristic: Only rename if exactly one field of this type was removed and one added
    if (addedIndices && addedIndices.length === 1 && removedIndices.length === 1) {
      const addedIndex = addedIndices[0];
      const removedIndex = removedIndices[0];
      const addedField = fieldsToAdd[addedIndex];
      const removedField = fieldsToRemove[removedIndex];

      // For relations, ensure target collection matches
      let isMatch = true;
      if (type === "relation") {
        const addedTarget = resolveCollectionName(addedField.relation?.collection || "");
        const removedTarget = resolveCollectionName(removedField.relation?.collection || "");
        if (addedTarget.toLowerCase() !== removedTarget.toLowerCase()) {
          isMatch = false;
        }
      }

      if (isMatch) {
        // It's a rename!
        processedAddIndices.add(addedIndex);
        processedRemoveIndices.add(removedIndex);

        // Calculate changes (including name change)
        const changes = detectFieldChanges(addedField, removedField, collectionIdToName);
        changes.push({
          property: "name",
          oldValue: removedField.name,
          newValue: addedField.name,
        });

        fieldsToModify.push({
          fieldName: removedField.name, // Use OLD name so generator can find it
          currentDefinition: removedField, // OLD definition
          newDefinition: addedField, // NEW definition
          changes,
        });
      }
    }
  }

  // Filter out processed fields
  fieldsToAdd = fieldsToAdd.filter((_, index) => !processedAddIndices.has(index));
  fieldsToRemove = fieldsToRemove.filter((_, index) => !processedRemoveIndices.has(index));

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
export function buildCollectionModification(
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
