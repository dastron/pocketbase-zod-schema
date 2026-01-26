import type { CollectionSchema } from "../types";
import { generateFieldsArray } from "./fields";
import { generateIndexesArray } from "./indexes";
import { generateCollectionPermissions, generateCollectionRules } from "./rules";
import { formatValue, generateFindCollectionCode, getSystemFields } from "./utils";

/**
 * Generates Collection constructor call for creating a new collection
 *
 * @param collection - Collection schema
 * @param varName - Variable name to use for the collection (default: 'collection')
 * @returns JavaScript code for creating the collection
 */
export function generateCollectionCreation(
  collection: CollectionSchema,
  varName: string = "collection",
  isLast: boolean = false,
  collectionIdMap?: Map<string, string>
): string {
  const lines: string[] = [];

  lines.push(`  const ${varName} = new Collection({`);
  if (collection.id) {
    lines.push(`    "id": ${formatValue(collection.id)},`);
  }
  lines.push(`    "name": "${collection.name}",`);
  lines.push(`    "type": "${collection.type}",`);
  lines.push(`    "system": false,`);

  // Add permissions (preferred) or rules
  // Permissions take precedence if both are defined
  const permissionsCode = generateCollectionPermissions(collection.permissions);
  const rulesCode = generateCollectionRules(collection.rules);

  if (permissionsCode) {
    lines.push(`    ${permissionsCode},`);
  } else if (rulesCode) {
    lines.push(`    ${rulesCode},`);
  }

  // Prepend system fields (id, created, updated) to user-defined fields
  // These fields are required by PocketBase and must be explicitly included in migrations
  const systemFields = getSystemFields();
  const allFields = [...systemFields, ...collection.fields];

  // Add fields
  lines.push(`    "fields": ${generateFieldsArray(allFields, collectionIdMap)},`);

  // Add indexes
  lines.push(`    "indexes": ${generateIndexesArray(collection.indexes)},`);

  lines.push(`  });`);
  lines.push(``);
  lines.push(isLast ? `  return app.save(${varName});` : `  app.save(${varName});`);

  return lines.join("\n");
}

/**
 * Generates code for deleting a collection
 *
 * @param collectionName - Name of the collection to delete
 * @param varName - Variable name to use for the collection (default: 'collection')
 * @param isLast - Whether this is the last operation (will return the result)
 * @returns JavaScript code for deleting the collection
 */
export function generateCollectionDeletion(
  collectionName: string,
  varName: string = "collection",
  isLast: boolean = false,
  collectionIdMap?: Map<string, string>
): string {
  const lines: string[] = [];

  lines.push(`  const ${varName} = ${generateFindCollectionCode(collectionName, collectionIdMap)};`);
  lines.push(isLast ? `  return app.delete(${varName});` : `  app.delete(${varName});`);

  return lines.join("\n");
}
