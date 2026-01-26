import type { FieldDefinition, FieldModification } from "../types";
import { formatValue, generateFindCollectionCode, getFieldConstructorName } from "./utils";

/**
 * Generates field definition object for collection creation
 * Creates the field configuration object used in Collection constructor
 *
 * @param field - Field definition
 * @param collectionIdMap - Map of collection names to their pre-generated IDs
 * @returns Field definition object as string
 */
export function generateFieldDefinitionObject(field: FieldDefinition, collectionIdMap?: Map<string, string>): string {
  const parts: string[] = [];

  // Add field name
  parts.push(`      "name": "${field.name}"`);

  // Add field id
  parts.push(`      "id": "${field.id}"`);

  // Add field type
  parts.push(`      "type": "${field.type}"`);

  // Add required flag
  parts.push(`      "required": ${field.required}`);

  // Add unique flag if present
  if (field.unique !== undefined) {
    parts.push(`      "unique": ${field.unique}`);
  }

  // Add explicit defaults for select fields
  if (field.type === "select") {
    // Always include maxSelect (default: 1)
    const maxSelect = field.options?.maxSelect ?? 1;
    parts.push(`      "maxSelect": ${maxSelect}`);

    // Always include values array (default: [])
    const values = field.options?.values ?? [];
    parts.push(`      "values": ${formatValue(values)}`);
  }

  // Add options if present (excluding select-specific options already handled)
  if (field.options && Object.keys(field.options).length > 0) {
    for (const [key, value] of Object.entries(field.options)) {
      // Skip select-specific options as they're handled above
      if (field.type === "select" && (key === "maxSelect" || key === "values")) {
        continue;
      }
      // Skip id as it's already added explicitly above
      if (key === "id") {
        continue;
      }
      // Convert noDecimal to onlyInt for number fields (PocketBase uses onlyInt)
      if (field.type === "number" && key === "noDecimal") {
        parts.push(`      "onlyInt": ${formatValue(value)}`);
      } else {
        parts.push(`      "${key}": ${formatValue(value)}`);
      }
    }
  }

  // Add relation configuration if present
  if (field.relation) {
    // Use pre-generated collection ID from map if available
    // Otherwise fall back to runtime lookup (for existing collections not in the current diff)
    const isUsersCollection = field.relation.collection.toLowerCase() === "users";
    let collectionIdValue: string;

    if (isUsersCollection) {
      // Special case: users collection always uses the constant
      collectionIdValue = '"_pb_users_auth_"';
    } else if (collectionIdMap && collectionIdMap.has(field.relation.collection)) {
      // Use pre-generated ID from map
      collectionIdValue = `"${collectionIdMap.get(field.relation.collection)}"`;
    } else {
      // Fall back to runtime lookup for existing collections
      collectionIdValue = `app.findCollectionByNameOrId("${field.relation.collection}").id`;
    }

    parts.push(`      "collectionId": ${collectionIdValue}`);

    // Always include maxSelect (default: 1)
    const maxSelect = field.relation.maxSelect ?? 1;
    parts.push(`      "maxSelect": ${maxSelect}`);

    // Always include minSelect (default: null)
    const minSelect = field.relation.minSelect ?? null;
    parts.push(`      "minSelect": ${minSelect}`);

    // Always include cascadeDelete (default: false)
    const cascadeDelete = field.relation.cascadeDelete ?? false;
    parts.push(`      "cascadeDelete": ${cascadeDelete}`);

    if (field.relation.displayFields) {
      parts.push(`      "displayFields": ${formatValue(field.relation.displayFields)}`);
    }
  }

  return `    {\n${parts.join(",\n")},\n    }`;
}

/**
 * Generates fields array for collection creation
 *
 * @param fields - Array of field definitions
 * @param collectionIdMap - Map of collection names to their pre-generated IDs
 * @returns Fields array as string
 */
export function generateFieldsArray(fields: FieldDefinition[], collectionIdMap?: Map<string, string>): string {
  if (fields.length === 0) {
    return "[]";
  }

  const fieldObjects = fields.map((field) => generateFieldDefinitionObject(field, collectionIdMap));
  return `[\n${fieldObjects.join(",\n")},\n  ]`;
}

/**
 * Generates field constructor options object
 *
 * @param field - Field definition
 * @param collectionIdMap - Map of collection names to their pre-generated IDs
 * @returns Options object as string
 */
export function generateFieldConstructorOptions(field: FieldDefinition, collectionIdMap?: Map<string, string>): string {
  const parts: string[] = [];

  // Add field name
  parts.push(`    "name": "${field.name}"`);

  // Add field id
  parts.push(`    "id": "${field.id}"`);

  // Add required flag
  parts.push(`    "required": ${field.required}`);

  // Add unique flag if present
  if (field.unique !== undefined) {
    parts.push(`    "unique": ${field.unique}`);
  }

  // Add explicit defaults for select fields
  if (field.type === "select") {
    // Always include maxSelect (default: 1)
    const maxSelect = field.options?.maxSelect ?? 1;
    parts.push(`    "maxSelect": ${maxSelect}`);

    // Always include values array (default: [])
    const values = field.options?.values ?? [];
    parts.push(`    "values": ${formatValue(values)}`);
  }

  // Add options if present (excluding select-specific options already handled)
  if (field.options && Object.keys(field.options).length > 0) {
    for (const [key, value] of Object.entries(field.options)) {
      // Skip select-specific options as they're handled above
      if (field.type === "select" && (key === "maxSelect" || key === "values")) {
        continue;
      }
      // Skip id as it's already added explicitly above
      if (key === "id") {
        continue;
      }
      // Convert noDecimal to onlyInt for number fields (PocketBase uses onlyInt)
      if (field.type === "number" && key === "noDecimal") {
        parts.push(`    "onlyInt": ${formatValue(value)}`);
      } else {
        parts.push(`    "${key}": ${formatValue(value)}`);
      }
    }
  }

  // Add relation-specific options
  if (field.relation && field.type === "relation") {
    // Use pre-generated collection ID from map if available
    // Otherwise fall back to runtime lookup (for existing collections not in the current diff)
    const isUsersCollection = field.relation.collection.toLowerCase() === "users";
    let collectionIdValue: string;

    if (isUsersCollection) {
      // Special case: users collection always uses the constant
      collectionIdValue = '"_pb_users_auth_"';
    } else if (collectionIdMap && collectionIdMap.has(field.relation.collection)) {
      // Use pre-generated ID from map
      collectionIdValue = `"${collectionIdMap.get(field.relation.collection)}"`;
    } else {
      // Fall back to runtime lookup for existing collections
      collectionIdValue = `app.findCollectionByNameOrId("${field.relation.collection}").id`;
    }

    parts.push(`    "collectionId": ${collectionIdValue}`);

    // Always include maxSelect (default: 1)
    const maxSelect = field.relation.maxSelect ?? 1;
    parts.push(`    "maxSelect": ${maxSelect}`);

    // Always include minSelect (default: null)
    const minSelect = field.relation.minSelect ?? null;
    parts.push(`    "minSelect": ${minSelect}`);

    // Always include cascadeDelete (default: false)
    const cascadeDelete = field.relation.cascadeDelete ?? false;
    parts.push(`    "cascadeDelete": ${cascadeDelete}`);

    if (field.relation.displayFields) {
      parts.push(`    "displayFields": ${formatValue(field.relation.displayFields)}`);
    }
  }

  return parts.join(",\n");
}

/**
 * Generates code for adding a field to an existing collection
 * Uses the appropriate Field constructor based on field type
 *
 * @param collectionName - Name of the collection
 * @param field - Field definition to add
 * @param varName - Variable name to use for the collection (default: auto-generated)
 * @param isLast - Whether this is the last operation (will return the result)
 * @param collectionIdMap - Map of collection names to their pre-generated IDs
 * @returns JavaScript code for adding the field
 */
export function generateFieldAddition(
  collectionName: string,
  field: FieldDefinition,
  varName?: string,
  isLast: boolean = false,
  collectionIdMap?: Map<string, string>
): string {
  const lines: string[] = [];
  const constructorName = getFieldConstructorName(field.type);
  const collectionVar = varName || `collection_${collectionName}_${field.name}`;

  lines.push(`  const ${collectionVar} = ${generateFindCollectionCode(collectionName, collectionIdMap)};`);
  lines.push(``);
  lines.push(`  ${collectionVar}.fields.add(new ${constructorName}({`);
  lines.push(generateFieldConstructorOptions(field, collectionIdMap));
  lines.push(`  }));`);
  lines.push(``);
  lines.push(isLast ? `  return app.save(${collectionVar});` : `  app.save(${collectionVar});`);

  return lines.join("\n");
}

/**
 * Generates code for modifying an existing field
 * Updates field properties based on detected changes
 *
 * @param collectionName - Name of the collection
 * @param modification - Field modification details
 * @param varName - Variable name to use for the collection (default: auto-generated)
 * @param isLast - Whether this is the last operation (will return the result)
 * @returns JavaScript code for modifying the field
 */
export function generateFieldModification(
  collectionName: string,
  modification: FieldModification,
  varName?: string,
  isLast: boolean = false,
  collectionIdMap?: Map<string, string>
): string {
  const lines: string[] = [];
  const collectionVar = varName || `collection_${collectionName}_${modification.fieldName}`;
  const fieldVar = `${collectionVar}_field`;

  lines.push(`  const ${collectionVar} = ${generateFindCollectionCode(collectionName, collectionIdMap)};`);
  lines.push(`  const ${fieldVar} = ${collectionVar}.fields.getByName("${modification.fieldName}");`);
  lines.push(``);

  // Apply each change
  for (const change of modification.changes) {
    if (change.property.startsWith("options.")) {
      // Handle nested options properties
      const optionKey = change.property.replace("options.", "");
      // In PocketBase, field properties are set directly on the field, not in an options object
      lines.push(`  ${fieldVar}.${optionKey} = ${formatValue(change.newValue)};`);
    } else if (change.property.startsWith("relation.")) {
      // Handle nested relation properties
      const relationKey = change.property.replace("relation.", "");

      if (relationKey === "collection") {
        // Special handling for collection ID
        // Use case-insensitive check for "users" to handle both explicit and implicit relation definitions
        const isUsersCollection = String(change.newValue).toLowerCase() === "users";
        let collectionIdValue: string;

        if (isUsersCollection) {
          collectionIdValue = '"_pb_users_auth_"';
        } else if (collectionIdMap && collectionIdMap.has(String(change.newValue))) {
          // Use pre-generated ID from map (for existing collections)
          collectionIdValue = `"${collectionIdMap.get(String(change.newValue))}"`;
        } else {
          // Fall back to runtime lookup (should not happen if snapshot is properly loaded)
          collectionIdValue = `app.findCollectionByNameOrId("${change.newValue}").id`;
        }
        lines.push(`  ${fieldVar}.collectionId = ${collectionIdValue};`);
      } else {
        lines.push(`  ${fieldVar}.${relationKey} = ${formatValue(change.newValue)};`);
      }
    } else {
      // Handle top-level properties
      lines.push(`  ${fieldVar}.${change.property} = ${formatValue(change.newValue)};`);
    }
  }

  lines.push(``);
  lines.push(isLast ? `  return app.save(${collectionVar});` : `  app.save(${collectionVar});`);

  return lines.join("\n");
}

/**
 * Generates code for deleting a field from a collection
 *
 * @param collectionName - Name of the collection
 * @param fieldName - Name of the field to delete
 * @param varName - Variable name to use for the collection (default: auto-generated)
 * @param isLast - Whether this is the last operation (will return the result)
 * @returns JavaScript code for deleting the field
 */
export function generateFieldDeletion(
  collectionName: string,
  fieldName: string,
  varName?: string,
  isLast: boolean = false,
  collectionIdMap?: Map<string, string>
): string {
  const lines: string[] = [];
  const collectionVar = varName || `collection_${collectionName}_${fieldName}`;

  lines.push(`  const ${collectionVar} = ${generateFindCollectionCode(collectionName, collectionIdMap)};`);
  lines.push(``);
  lines.push(`  ${collectionVar}.fields.removeByName("${fieldName}");`);
  lines.push(``);
  lines.push(isLast ? `  return app.save(${collectionVar});` : `  app.save(${collectionVar});`);

  return lines.join("\n");
}
