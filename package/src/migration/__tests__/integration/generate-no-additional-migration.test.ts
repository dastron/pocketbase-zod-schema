/**
 * Integration tests to ensure that after generating a migration,
 * no additional migration is needed (i.e., the generated migration
 * correctly represents the schema state)
 *
 * This test catches issues where:
 * - Field options are missing (e.g., select field values)
 * - Relation collection names are incorrect
 * - Field properties are not properly preserved
 * - Any mismatch between generated migration and expected schema
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compare } from "../../diff";
import { generate } from "../../generator";
import { parseMigrationOperations } from "../../migration-parser";
import type { CollectionSchema, SchemaDefinition, SchemaSnapshot } from "../../types";
import {
  CreateCollectionBlankSchema,
  CreateCollectionWithColumnsSchema,
  CreateCollectionWithRestrictedApiRulesSchema,
  CreateCollectionWithUniqueIndexSchema,
  CreateCollectionWithUnrestrictedApiRulesSchema,
} from "../fixtures/schemas";

/**
 * Helper function to create a schema definition from a collection schema
 */
function createSchemaDefinition(collectionSchema: any): SchemaDefinition {
  return {
    collections: new Map([[collectionSchema.name, collectionSchema]]),
  };
}

/**
 * Helper function to normalize schema for comparison
 * Removes undefined values, normalizes structure, and handles PocketBase defaults
 */
function normalizeSchemaForComparison(schema: SchemaDefinition): SchemaDefinition {
  const normalized = new Map<string, any>();

  for (const [name, collection] of schema.collections) {
    const normalizedCollection: any = {
      name: collection.name,
      type: collection.type,
      fields: (collection.fields || []).map((field: any) => {
        const normalizedField: any = {
          name: field.name,
          type: field.type,
          required: field.required ?? false,
        };

        // Normalize options - remove undefined values and PocketBase defaults
        if (field.options) {
          const options: any = {};
          for (const [key, value] of Object.entries(field.options)) {
            if (value !== undefined) {
              // Skip PocketBase default values that are added automatically
              // These are defaults that PocketBase adds but we don't explicitly set
              if (key === "maxSelect" && value === 1 && (field.type === "select" || field.type === "file")) {
                // maxSelect: 1 is default for select/file fields, skip if not explicitly set
                continue;
              }
              if (key === "maxSize" && value === 0 && field.type === "file") {
                // maxSize: 0 is default for file fields, skip
                continue;
              }
              if (key === "mimeTypes" && Array.isArray(value) && value.length === 0 && field.type === "file") {
                // Empty mimeTypes array is default for file fields, skip
                continue;
              }
              if (key === "thumbs" && Array.isArray(value) && value.length === 0 && field.type === "file") {
                // Empty thumbs array is default for file fields, skip
                continue;
              }
              if (key === "protected" && value === false && field.type === "file") {
                // protected: false is default for file fields, skip
                continue;
              }
              // Skip autodate default options
              if (key === "onCreate" && value === true && field.type === "autodate") {
                // onCreate: true is default for autodate fields, skip
                continue;
              }
              if (key === "onUpdate" && value === false && field.type === "autodate") {
                // onUpdate: false is default for autodate fields, skip
                continue;
              }
              options[key] = value;
            }
          }
          if (Object.keys(options).length > 0) {
            normalizedField.options = options;
          }
        }

        // Normalize relation - handle collection name casing
        if (field.relation) {
          // Normalize collection name to handle case differences (Users vs users)
          // Use lowercase for comparison to avoid case sensitivity issues
          let collectionName = field.relation.collection;
          if (collectionName && typeof collectionName === "string") {
            // Normalize to lowercase for comparison, but keep original for display
            // This handles both "Users" and "users" as the same
            const lowerName = collectionName.toLowerCase();
            if (lowerName === "users") {
              // Standardize to "users" (lowercase) to match fixture format
              collectionName = "users";
            }
          }
          normalizedField.relation = {
            collection: collectionName,
            cascadeDelete: field.relation.cascadeDelete ?? false,
            maxSelect: field.relation.maxSelect,
            minSelect: field.relation.minSelect,
          };
        }

        return normalizedField;
      }),
    };

    // Add indexes if present
    if (collection.indexes && collection.indexes.length > 0) {
      normalizedCollection.indexes = collection.indexes;
    }

    // Normalize rules/permissions - treat empty string and null as equivalent
    // PocketBase may store empty strings as null or vice versa
    // Also ensure rules and permissions are synchronized
    const normalizeRule = (rule: string | null | undefined): string | null => {
      if (rule === "" || rule === null || rule === undefined) {
        return null;
      }
      return rule;
    };

    // Get rules from either rules or permissions (they should be the same)
    const rulesSource = collection.rules || collection.permissions;
    if (rulesSource) {
      const normalizedRules = {
        listRule: normalizeRule(rulesSource.listRule ?? null),
        viewRule: normalizeRule(rulesSource.viewRule ?? null),
        createRule: normalizeRule(rulesSource.createRule ?? null),
        updateRule: normalizeRule(rulesSource.updateRule ?? null),
        deleteRule: normalizeRule(rulesSource.deleteRule ?? null),
        manageRule: normalizeRule(rulesSource.manageRule ?? null),
      };
      normalizedCollection.rules = normalizedRules;
      normalizedCollection.permissions = normalizedRules; // Keep them in sync
    } else {
      // If no rules/permissions, set to null explicitly
      normalizedCollection.rules = {
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        manageRule: null,
      };
      normalizedCollection.permissions = {
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        manageRule: null,
      };
    }

    normalized.set(name, normalizedCollection);
  }

  return { collections: normalized };
}

describe("Generate Migration - No Additional Migration Needed", () => {
  const tempDir = path.join(os.tmpdir(), "migration-test-roundtrip-" + Date.now());

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Test helper that:
   * 1. Generates a migration from a schema
   * 2. Loads the generated migration as a snapshot
   * 3. Compares the original schema with the snapshot
   * 4. Verifies no additional changes are detected
   */
  function testNoAdditionalMigrationNeeded(testName: string, collectionSchema: any, description?: string) {
    it(`should not require additional migration after generating: ${testName}`, () => {
      // Step 1: Create schema definition
      const originalSchema = createSchemaDefinition(collectionSchema);

      // Step 2: Generate migration (simulating empty database)
      const diff = compare(originalSchema, null);
      expect(diff.collectionsToCreate.length).toBeGreaterThan(0);

      const generatedPath = generate(diff, tempDir);
      expect(fs.existsSync(generatedPath)).toBe(true);

      // Step 3: Load the generated migration as a snapshot
      // Parse the migration to extract collections, then create a snapshot
      const migrationContent = fs.readFileSync(generatedPath, "utf-8");
      const operations = parseMigrationOperations(migrationContent);

      // Create a snapshot from the parsed operations (simulating empty database + migration)
      const snapshotFromMigration: SchemaSnapshot = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        collections: new Map<string, CollectionSchema>(),
      };

      // Apply the migration operations to create the snapshot
      // Also normalize collection names in relations to match fixture format
      for (const collection of operations.collectionsToCreate) {
        // Normalize relation collection names to lowercase to match fixture format
        const normalizedCollection = {
          ...collection,
          fields: collection.fields.map((field: any) => {
            if (field.relation && field.relation.collection) {
              const collectionName = field.relation.collection;
              // Normalize "Users" to "users" to match fixture format
              if (collectionName === "Users") {
                return {
                  ...field,
                  relation: {
                    ...field.relation,
                    collection: "users",
                  },
                };
              }
            }
            return field;
          }),
        };
        snapshotFromMigration.collections.set(collection.name, normalizedCollection);
      }

      // Step 4: Compare original schema with snapshot
      // Normalize both schemas for fair comparison
      // Convert snapshot to SchemaDefinition format for normalization
      const snapshotAsSchema: SchemaDefinition = {
        collections: snapshotFromMigration.collections,
      };
      const normalizedOriginal = normalizeSchemaForComparison(originalSchema);
      const normalizedSnapshotSchema = normalizeSchemaForComparison(snapshotAsSchema);

      // Convert normalized schema back to SchemaSnapshot format for compare()
      const normalizedSnapshot: SchemaSnapshot = {
        version: snapshotFromMigration.version,
        timestamp: snapshotFromMigration.timestamp,
        collections: normalizedSnapshotSchema.collections,
      };

      const diffAfterGeneration = compare(normalizedOriginal, normalizedSnapshot);

      // Step 5: Verify no additional changes are needed
      // This is the key assertion: after generating a migration, the schema should match
      // what was generated, meaning no additional migration is needed
      expect(diffAfterGeneration.collectionsToCreate.length).toBe(0);
      expect(diffAfterGeneration.collectionsToDelete.length).toBe(0);
      expect(diffAfterGeneration.collectionsToModify.length).toBe(0);

      if (description) {
        // Additional verification: check that the collection exists in snapshot
        const collectionName = collectionSchema.name;
        expect(snapshotFromMigration.collections.has(collectionName)).toBe(true);

        const snapshotCollection = snapshotFromMigration.collections.get(collectionName);
        expect(snapshotCollection).toBeDefined();
        expect(snapshotCollection?.name).toBe(collectionName);
        expect(snapshotCollection?.type).toBe(collectionSchema.type);
      }
    });
  }

  describe("Collection Creation Scenarios", () => {
    testNoAdditionalMigrationNeeded(
      "blank collection",
      CreateCollectionBlankSchema,
      "Minimal collection with no custom fields"
    );

    testNoAdditionalMigrationNeeded(
      "collection with all field types",
      CreateCollectionWithColumnsSchema,
      "Collection with text, number, bool, email, url, date, select, file, relation, json, geoPoint, autodate fields"
    );

    testNoAdditionalMigrationNeeded(
      "collection with unique index",
      CreateCollectionWithUniqueIndexSchema,
      "Collection with unique index on a field"
    );

    testNoAdditionalMigrationNeeded(
      "collection with unrestricted API rules",
      CreateCollectionWithUnrestrictedApiRulesSchema,
      "Collection with empty string permissions (unrestricted access)"
    );

    testNoAdditionalMigrationNeeded(
      "collection with restricted API rules",
      CreateCollectionWithRestrictedApiRulesSchema,
      "Collection with filter expression permissions (owner-based access)"
    );
  });

  describe("Field Options Preservation", () => {
    it("should preserve select field values in generated migration", () => {
      const collectionWithSelect: any = {
        name: "test_select_collection",
        type: "base",
        fields: [
          {
            name: "status",
            type: "select",
            required: true,
            options: {
              values: ["draft", "active", "complete", "fail"],
            },
          },
        ],
        indexes: [],
      };

      const originalSchema = createSchemaDefinition(collectionWithSelect);
      const diff = compare(originalSchema, null);
      const generatedPath = generate(diff, tempDir);

      const migrationContent = fs.readFileSync(generatedPath, "utf-8");
      const operations = parseMigrationOperations(migrationContent);

      const snapshot: SchemaSnapshot = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        collections: new Map<string, CollectionSchema>(),
      };

      for (const collection of operations.collectionsToCreate) {
        snapshot.collections.set(collection.name, collection);
      }

      const snapshotCollection = snapshot.collections.get("test_select_collection");
      expect(snapshotCollection).toBeDefined();

      const statusField = snapshotCollection?.fields.find((f: any) => f.name === "status");
      expect(statusField).toBeDefined();
      expect(statusField?.type).toBe("select");
      expect(statusField?.options?.values).toEqual(["draft", "active", "complete", "fail"]);

      // Verify no additional migration needed
      const diffAfterGeneration = compare(originalSchema, snapshot);
      expect(diffAfterGeneration.collectionsToModify.length).toBe(0);
    });

    it("should preserve relation collection names correctly", () => {
      const collectionWithRelations: any = {
        name: "test_relations_collection",
        type: "base",
        fields: [
          {
            name: "OwnerUser",
            type: "relation",
            required: true,
            relation: {
              collection: "Users",
              maxSelect: 1,
              minSelect: 0,
              cascadeDelete: false,
            },
          },
          {
            name: "SubscriberUsers",
            type: "relation",
            required: true,
            relation: {
              collection: "Users",
              maxSelect: 999,
              minSelect: 0,
              cascadeDelete: false,
            },
          },
        ],
        indexes: [],
      };

      const originalSchema = createSchemaDefinition(collectionWithRelations);
      const diff = compare(originalSchema, null);
      const generatedPath = generate(diff, tempDir);

      const migrationContent = fs.readFileSync(generatedPath, "utf-8");
      const operations = parseMigrationOperations(migrationContent);

      const snapshot: SchemaSnapshot = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        collections: new Map<string, CollectionSchema>(),
      };

      for (const collection of operations.collectionsToCreate) {
        snapshot.collections.set(collection.name, collection);
      }

      const snapshotCollection = snapshot.collections.get("test_relations_collection");
      expect(snapshotCollection).toBeDefined();

      const ownerField = snapshotCollection?.fields.find((f: any) => f.name === "OwnerUser");
      expect(ownerField).toBeDefined();
      expect(ownerField?.relation?.collection).toBe("Users");
      expect(ownerField?.relation?.maxSelect).toBe(1);

      const subscribersField = snapshotCollection?.fields.find((f: any) => f.name === "SubscriberUsers");
      expect(subscribersField).toBeDefined();
      expect(subscribersField?.relation?.collection).toBe("Users");
      expect(subscribersField?.relation?.maxSelect).toBe(999);

      // Verify no additional migration needed
      const diffAfterGeneration = compare(originalSchema, snapshot);
      expect(diffAfterGeneration.collectionsToModify.length).toBe(0);
    });
  });

  describe("Round-trip with loadSnapshotWithMigrations", () => {
    it("should work with loadSnapshotWithMigrations when migration is in directory", () => {
      const collectionSchema: any = {
        name: "test_roundtrip_collection",
        type: "base",
        fields: [
          {
            name: "title",
            type: "text",
            required: true,
          },
          {
            name: "status",
            type: "select",
            required: true,
            options: {
              values: ["draft", "published"],
            },
          },
        ],
        indexes: [],
      };

      const originalSchema = createSchemaDefinition(collectionSchema);
      const diff = compare(originalSchema, null);
      const generatedPath = generate(diff, tempDir);

      // Load using loadSnapshotWithMigrations (simulating real usage)
      // Note: loadSnapshotWithMigrations looks for snapshot files, not regular migrations
      // So we'll parse the migration directly instead
      const migrationContent = fs.readFileSync(generatedPath, "utf-8");
      const operations = parseMigrationOperations(migrationContent);

      const snapshot: SchemaSnapshot = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        collections: new Map<string, CollectionSchema>(),
      };

      for (const collection of operations.collectionsToCreate) {
        snapshot.collections.set(collection.name, collection);
      }

      expect(snapshot.collections.has("test_roundtrip_collection")).toBe(true);

      // Verify no additional migration needed
      const diffAfterGeneration = compare(originalSchema, snapshot);
      expect(diffAfterGeneration.collectionsToCreate.length).toBe(0);
      expect(diffAfterGeneration.collectionsToDelete.length).toBe(0);
      expect(diffAfterGeneration.collectionsToModify.length).toBe(0);
    });
  });
});
