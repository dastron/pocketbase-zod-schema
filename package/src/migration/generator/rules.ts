import type { CollectionSchema } from "../types";
import { formatValue, generateFindCollectionCode } from "./utils";

/**
 * Generates collection rules object
 *
 * @param rules - Collection rules
 * @returns Rules configuration as string
 */
export function generateCollectionRules(rules?: CollectionSchema["rules"]): string {
  if (!rules) {
    return "";
  }

  const parts: string[] = [];

  if (rules.listRule !== undefined) {
    parts.push(`"listRule": ${formatValue(rules.listRule)}`);
  }

  if (rules.viewRule !== undefined) {
    parts.push(`"viewRule": ${formatValue(rules.viewRule)}`);
  }

  if (rules.createRule !== undefined) {
    parts.push(`"createRule": ${formatValue(rules.createRule)}`);
  }

  if (rules.updateRule !== undefined) {
    parts.push(`"updateRule": ${formatValue(rules.updateRule)}`);
  }

  if (rules.deleteRule !== undefined) {
    parts.push(`"deleteRule": ${formatValue(rules.deleteRule)}`);
  }

  if (rules.manageRule !== undefined) {
    parts.push(`"manageRule": ${formatValue(rules.manageRule)}`);
  }

  return parts.join(",\n    ");
}

/**
 * Generates collection permissions object
 * Permissions are the same as rules but extracted from schema metadata
 *
 * @param permissions - Collection permissions
 * @returns Permissions configuration as string
 */
export function generateCollectionPermissions(permissions?: CollectionSchema["permissions"]): string {
  if (!permissions) {
    return "";
  }

  const parts: string[] = [];

  if (permissions.listRule !== undefined) {
    parts.push(`"listRule": ${formatValue(permissions.listRule)}`);
  }

  if (permissions.viewRule !== undefined) {
    parts.push(`"viewRule": ${formatValue(permissions.viewRule)}`);
  }

  if (permissions.createRule !== undefined) {
    parts.push(`"createRule": ${formatValue(permissions.createRule)}`);
  }

  if (permissions.updateRule !== undefined) {
    parts.push(`"updateRule": ${formatValue(permissions.updateRule)}`);
  }

  if (permissions.deleteRule !== undefined) {
    parts.push(`"deleteRule": ${formatValue(permissions.deleteRule)}`);
  }

  if (permissions.manageRule !== undefined) {
    parts.push(`"manageRule": ${formatValue(permissions.manageRule)}`);
  }

  return parts.join(",\n    ");
}

/**
 * Generates code for updating collection rules
 *
 * @param collectionName - Name of the collection
 * @param ruleType - Type of rule to update
 * @param newValue - New rule value
 * @param varName - Variable name to use for the collection (default: auto-generated)
 * @param isLast - Whether this is the last operation (will return the result)
 * @returns JavaScript code for updating the rule
 */
export function generateRuleUpdate(
  collectionName: string,
  ruleType: string,
  newValue: string | null,
  varName?: string,
  isLast: boolean = false,
  collectionIdMap?: Map<string, string>
): string {
  const lines: string[] = [];
  const collectionVar = varName || `collection_${collectionName}_${ruleType}`;

  lines.push(`  const ${collectionVar} = ${generateFindCollectionCode(collectionName, collectionIdMap)};`);
  lines.push(`  ${collectionVar}.${ruleType} = ${formatValue(newValue)};`);
  lines.push(isLast ? `  return app.save(${collectionVar});` : `  app.save(${collectionVar});`);

  return lines.join("\n");
}

/**
 * Generates code for updating collection permissions
 * Handles permission rule updates including manageRule for auth collections
 *
 * @param collectionName - Name of the collection
 * @param ruleType - Type of permission rule to update
 * @param newValue - New permission rule value
 * @param varName - Variable name to use for the collection (default: auto-generated)
 * @param isLast - Whether this is the last operation (will return the result)
 * @returns JavaScript code for updating the permission
 */
export function generatePermissionUpdate(
  collectionName: string,
  ruleType: string,
  newValue: string | null,
  varName?: string,
  isLast: boolean = false,
  collectionIdMap?: Map<string, string>
): string {
  const lines: string[] = [];
  const collectionVar = varName || `collection_${collectionName}_${ruleType}`;

  lines.push(`  const ${collectionVar} = ${generateFindCollectionCode(collectionName, collectionIdMap)};`);
  lines.push(`  ${collectionVar}.${ruleType} = ${formatValue(newValue)};`);
  lines.push(isLast ? `  return app.save(${collectionVar});` : `  app.save(${collectionVar});`);

  return lines.join("\n");
}
