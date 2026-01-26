/**
 * PocketBase Format Converter
 * Converts PocketBase collection objects to our internal CollectionSchema format
 *
 * This module handles conversion between PocketBase's native collection format
 * (as found in migration files and snapshots) and our internal schema representation.
 */

import { SnapshotError } from "./errors";
import type { CollectionSchema, FieldDefinition, SchemaSnapshot } from "./types";

const SNAPSHOT_VERSION = "1.0.0";

/**
 * Resolves a collection ID to a collection name
 * Uses known constants and parses migration expressions to resolve IDs
 *
 * @param collectionId - The collection ID to resolve
 * @returns The collection name, or the original ID if it can't be resolved
 */
export function resolveCollectionIdToName(collectionId: string): string {
  // Special case: _pb_users_auth_ is the constant for users collection
  if (collectionId === "_pb_users_auth_") {
    return "users";
  }

  // Try to extract collection name from expressions like app.findCollectionByNameOrId("Name").id
  const nameMatch = collectionId.match(/app\.findCollectionByNameOrId\s*\(\s*["']([^"']+)["']\s*\)/);
  if (nameMatch) {
    return nameMatch[1];
  }

  // If we can't resolve it, return the original ID
  // This will cause a comparison issue, but it's better than failing
  return collectionId;
}

/**
 * Extracts field options from a PocketBase field object
 * Options can be placed directly on the field or in a nested options object
 * Direct properties take precedence over nested options
 *
 * @param pbField - PocketBase field object
 * @returns Merged options object
 */
function extractFieldOptions(pbField: any): Record<string, any> {
  const options: Record<string, any> = {};

  // Start with nested options if present
  if (pbField.options && typeof pbField.options === "object") {
    Object.assign(options, pbField.options);
  }

  // Extract common field options from direct properties
  // These take precedence over nested options
  const directOptionKeys = [
    "min",
    "max",
    "pattern",
    "noDecimal", // text/number fields (legacy, PocketBase uses onlyInt)
    "onlyInt", // number fields (PocketBase uses this instead of noDecimal)
    "values",
    "maxSelect", // select fields
    "mimeTypes",
    "maxSize",
    "thumbs",
    "protected", // file fields
    "onCreate",
    "onUpdate", // autodate fields
    "exceptDomains",
    "onlyDomains", // email/url fields
  ];

  for (const key of directOptionKeys) {
    if (pbField[key] !== undefined) {
      options[key] = pbField[key];
    }
  }

  return options;
}

/**
 * Converts a PocketBase field object to FieldDefinition format
 *
 * @param pbField - PocketBase field object
 * @returns FieldDefinition object
 */
export function convertPocketBaseField(pbField: any): FieldDefinition {
  const field: any = {
    name: pbField.name,
    id: pbField.id,
    type: pbField.type,
    required: pbField.required || false,
  };

  // Extract options from both direct properties and nested options object
  field.options = extractFieldOptions(pbField);

  // Convert onlyInt to noDecimal for number fields (PocketBase uses onlyInt, but our schema uses noDecimal)
  if (pbField.type === "number" && field.options.onlyInt !== undefined) {
    field.options.noDecimal = field.options.onlyInt;
    delete field.options.onlyInt;
  }

  // Handle relation fields
  if (pbField.type === "relation") {
    // Support both formats: collectionId directly on field or in options
    const collectionId = pbField.collectionId || pbField.options?.collectionId || "";
    // Resolve collectionId to collection name
    // collectionId is a system field (like _pb_users_auth_), not the collection name
    // We need to resolve it to the actual collection name for comparison
    const collectionName = resolveCollectionIdToName(collectionId || "");
    field.relation = {
      collection: collectionName,
      cascadeDelete: pbField.cascadeDelete ?? pbField.options?.cascadeDelete ?? false,
      maxSelect: pbField.maxSelect ?? pbField.options?.maxSelect,
      minSelect: pbField.minSelect ?? pbField.options?.minSelect,
    };

    // Remove relation-specific properties from options
    // These belong in the relation object, not options
    delete field.options.maxSelect;
    delete field.options.minSelect;
    delete field.options.cascadeDelete;
  }

  // Clean up empty options object, but preserve values for select fields
  // If options only contains values for a select field, keep it
  const hasOnlyValues = Object.keys(field.options).length === 1 && field.options.values !== undefined;
  if (Object.keys(field.options).length === 0) {
    delete field.options;
  } else if (pbField.type === "select" && hasOnlyValues) {
    // Keep options object if it only contains values for a select field
    // This ensures values are preserved for comparison
  }

  return field as FieldDefinition;
}

/**
 * Converts a PocketBase collection object to CollectionSchema format
 *
 * @param pbCollection - PocketBase collection object from migration file
 * @returns CollectionSchema object
 */
export function convertPocketBaseCollection(pbCollection: any): CollectionSchema {
  const fields: any[] = [];

  // System field names that should always be excluded
  const systemFieldNames = ["id", "created", "updated", "collectionId", "collectionName", "expand"];

  // Auth collection system field names
  const authSystemFieldNames = ["email", "emailVisibility", "verified", "password", "tokenKey"];

  // Convert PocketBase fields to our FieldDefinition format
  if (pbCollection.fields && Array.isArray(pbCollection.fields)) {
    for (const pbField of pbCollection.fields) {
      // Skip system fields by checking both the system flag and field name
      // Some PocketBase exports mark created/updated as system: false
      if (pbField.system || systemFieldNames.includes(pbField.name)) {
        continue;
      }

      // Skip auth system fields for auth collections
      if (pbCollection.type === "auth" && authSystemFieldNames.includes(pbField.name)) {
        continue;
      }

      const field = convertPocketBaseField(pbField);
      fields.push(field);
    }
  }

  const schema: CollectionSchema = {
    name: pbCollection.name,
    type: pbCollection.type || "base",
    fields,
  };

  // Preserve collection ID if present (needed for relation resolution)
  if (pbCollection.id) {
    schema.id = pbCollection.id;
  }

  // Add indexes if present
  if (pbCollection.indexes && Array.isArray(pbCollection.indexes)) {
    schema.indexes = pbCollection.indexes;
  }

  // Add rules/permissions
  // Check if any rule properties exist on the collection object
  const hasAnyRule =
    pbCollection.listRule !== undefined ||
    pbCollection.viewRule !== undefined ||
    pbCollection.createRule !== undefined ||
    pbCollection.updateRule !== undefined ||
    pbCollection.deleteRule !== undefined ||
    pbCollection.manageRule !== undefined;

  if (hasAnyRule) {
    const rules: any = {};
    // Include rules even if they're null (null is a valid value)
    if (pbCollection.listRule !== undefined) rules.listRule = pbCollection.listRule;
    if (pbCollection.viewRule !== undefined) rules.viewRule = pbCollection.viewRule;
    if (pbCollection.createRule !== undefined) rules.createRule = pbCollection.createRule;
    if (pbCollection.updateRule !== undefined) rules.updateRule = pbCollection.updateRule;
    if (pbCollection.deleteRule !== undefined) rules.deleteRule = pbCollection.deleteRule;
    if (pbCollection.manageRule !== undefined) rules.manageRule = pbCollection.manageRule;

    schema.rules = rules;
    // Also set permissions to match rules (they're the same thing)
    schema.permissions = { ...rules };
  }

  return schema;
}

/**
 * Converts PocketBase migration format to SchemaSnapshot
 * Extracts the snapshot array from the migration file content
 *
 * @param migrationContent - Raw migration file content
 * @returns SchemaSnapshot with collections map
 */
export function convertPocketBaseMigration(migrationContent: string): SchemaSnapshot {
  try {
    // Extract the snapshot array from the migration file
    // The format is: migrate((app) => { const snapshot = [...]; ... })
    const snapshotMatch = migrationContent.match(/const\s+snapshot\s*=\s*(\[[\s\S]*?\]);/);

    if (!snapshotMatch) {
      throw new Error("Could not find snapshot array in migration file");
    }

    // Parse the snapshot array as JSON
    // We need to evaluate it as JavaScript since it's not pure JSON
    const snapshotArrayStr = snapshotMatch[1];
    let snapshotArray: any[];

    try {
      // Use Function constructor to safely evaluate the array
      // This is safer than eval() and works for our use case
      snapshotArray = new Function(`return ${snapshotArrayStr}`)();
    } catch (parseError) {
      throw new Error(`Failed to parse snapshot array: ${parseError}`);
    }

    if (!Array.isArray(snapshotArray)) {
      throw new Error("Snapshot is not an array");
    }

    // Convert each collection to our format
    const collections = new Map<string, CollectionSchema>();

    for (const pbCollection of snapshotArray) {
      if (!pbCollection.name) {
        console.warn("Skipping collection without name");
        continue;
      }

      const schema = convertPocketBaseCollection(pbCollection);
      collections.set(pbCollection.name, schema);
    }

    return {
      version: SNAPSHOT_VERSION,
      timestamp: new Date().toISOString(),
      collections,
    };
  } catch (error) {
    throw new SnapshotError(
      `Failed to convert PocketBase migration: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      "parse",
      error instanceof Error ? error : undefined
    );
  }
}
