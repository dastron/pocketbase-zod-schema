import type { SchemaDiff } from "../types";
import { mergeConfig, type DiffEngineConfig } from "./config";

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
