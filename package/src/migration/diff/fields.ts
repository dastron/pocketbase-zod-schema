import type { FieldChange, FieldDefinition } from "../types";
import { areValuesEqual, normalizeOptionValue } from "./utils";

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

  // If one has relation and other doesn't, that's not a config change (handled elsewhere, likely type or structure)
  // But here we assume types match (both relation) or structure implies relation
  if (!currentRelation && !previousRelation) {
    return changes;
  }

  if (!currentRelation || !previousRelation) {
    // This shouldn't happen if types match and both are 'relation', but handle gracefully
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
