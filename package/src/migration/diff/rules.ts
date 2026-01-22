import type { APIRuleType, CollectionSchema, PermissionChange, RuleUpdate } from "../types";

/**
 * Compares API rules between current and previous collections
 *
 * @param currentRules - Current collection rules
 * @param previousRules - Previous collection rules
 * @returns Array of rule updates
 */
export function compareRules(
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
