import type { SchemaDiff } from "../types";
import { type DiffEngineConfig } from "./config";

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

  // Collection deletions are destructive, except for views which hold no data
  for (const collection of diff.collectionsToDelete) {
    if (collection.type === "view") {
      nonDestructive.push(`Delete view collection: ${collection.name}`);
    } else {
      destructive.push(`Delete collection: ${collection.name}`);
    }
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

    // View query changes are non-destructive - a view stores no data
    if (modification.viewQueryUpdate) {
      nonDestructive.push(`Update view query: ${collectionName}`);
    }
  }

  return { destructive, nonDestructive };
}
