/**
 * PocketBase Format Converter
 * Converts PocketBase collection objects to our internal CollectionSchema format
 *
 * This module handles conversion between PocketBase's native collection format
 * (as found in migration files and snapshots) and our internal schema representation.
 */

import type { CollectionSchema, SchemaSnapshot } from "./types";

const SNAPSHOT_VERSION = "1.0.0";

/**
 * Resolves a collection ID to a collection name
 * Uses known constants and parses migration expressions to resolve IDs
 *
 * @param collectionId - The collection ID to resolve
 * @returns The collection name, or the original ID if it can't be resolved
 */
export function resolveCollectionIdToName(collectionId: string): string {
  // Known PocketBase constants
  if (collectionId === "_pb_users_auth_") {
    return "Users";
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

      const field: any = {
        name: pbField.name,
        type: pbField.type,
        required: pbField.required || false,
      };

      // Initialize options object
      field.options = pbField.options ? { ...pbField.options } : {};

      // Extract values for select/enum fields (values can be directly on field or in options)
      // This must be done before cleaning up empty options to ensure values are preserved
      if (pbField.type === "select") {
        // Check for values directly on the field first (common in migration files)
        if (pbField.values && Array.isArray(pbField.values)) {
          field.options.values = pbField.values;
        } else if (pbField.options?.values && Array.isArray(pbField.options.values)) {
          // Already in options, keep it
          field.options.values = pbField.options.values;
        }
      }

      // Handle relation fields
      if (pbField.type === "relation") {
        // Support both formats: collectionId directly on field or in options
        const collectionId = pbField.collectionId || pbField.options?.collectionId || "";
        // Resolve collectionId to collection name
        // collectionId is a system field (like _pb_users_auth_), not the collection name
        // We need to resolve it to the actual collection name for comparison
        const collectionName = resolveCollectionIdToName(collectionId);
        field.relation = {
          collection: collectionName,
          cascadeDelete: pbField.cascadeDelete ?? pbField.options?.cascadeDelete ?? false,
          maxSelect: pbField.maxSelect ?? pbField.options?.maxSelect,
          minSelect: pbField.minSelect ?? pbField.options?.minSelect,
        };
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

      fields.push(field);
    }
  }

  const schema: CollectionSchema = {
    name: pbCollection.name,
    type: pbCollection.type || "base",
    fields,
  };

  // Add indexes if present
  if (pbCollection.indexes && Array.isArray(pbCollection.indexes)) {
    schema.indexes = pbCollection.indexes;
  }

  // Add rules/permissions
  const rules: any = {};
  if (pbCollection.listRule !== undefined) rules.listRule = pbCollection.listRule;
  if (pbCollection.viewRule !== undefined) rules.viewRule = pbCollection.viewRule;
  if (pbCollection.createRule !== undefined) rules.createRule = pbCollection.createRule;
  if (pbCollection.updateRule !== undefined) rules.updateRule = pbCollection.updateRule;
  if (pbCollection.deleteRule !== undefined) rules.deleteRule = pbCollection.deleteRule;
  if (pbCollection.manageRule !== undefined) rules.manageRule = pbCollection.manageRule;

  if (Object.keys(rules).length > 0) {
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
    // Dynamic import to avoid circular dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SnapshotError } = require("./errors");
    throw new SnapshotError(
      `Failed to convert PocketBase migration: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      "parse",
      error instanceof Error ? error : undefined
    );
  }
}
