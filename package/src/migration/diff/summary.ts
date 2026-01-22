import type { SchemaDiff } from "../types";
import { type DiffEngineConfig } from "./config";
import { detectDestructiveChanges, type DestructiveChange } from "./destructiveness";

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
