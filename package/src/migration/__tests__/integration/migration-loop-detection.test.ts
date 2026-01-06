/**
 * Migration Loop Detection Tests
 *
 * These tests catch the critical issue where generating a migration, then running
 * status again, incorrectly shows the same changes need to be applied.
 *
 * The test flow is:
 * 1. Define a schema
 * 2. Generate a migration from that schema (simulating empty database)
 * 3. Parse the generated migration back into a snapshot
 * 4. Compare the original schema to the parsed snapshot
 * 5. Verify NO changes are detected (idempotency)
 *
 * This catches issues like:
 * - Field options not being preserved in generated migrations
 * - Field options not being parsed correctly from migrations
 * - Default value normalization issues between schema and snapshot
 * - Missing fields in generated migrations
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { compare } from "../../diff";
import { generate } from "../../generator";
import { parseMigrationOperations } from "../../migration-parser";
import type { CollectionSchema, SchemaDefinition, SchemaSnapshot } from "../../types";

describe("Migration Loop Detection", () => {
  const tempDir = path.join(os.tmpdir(), "migration-loop-test-" + Date.now());
  let generatedFiles: string[] = [];

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up generated files after each test
    for (const file of generatedFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
    generatedFiles = [];
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper to create a schema definition from a collection schema
   */
  function createSchemaDefinition(collectionSchema: CollectionSchema): SchemaDefinition {
    return {
      collections: new Map([
        [collectionSchema.name, collectionSchema],
        ["users", { name: "users", type: "auth", fields: [] } as CollectionSchema],
      ]),
    };
  }

  /**
   * Core test helper that:
   * 1. Generates a migration from a schema
   * 2. Parses the migration back into a snapshot
   * 3. Compares the original schema to the snapshot
   * 4. Returns detailed information about any detected changes
   */
  function testMigrationRoundTrip(collectionSchema: CollectionSchema): {
    success: boolean;
    diff: ReturnType<typeof compare>;
    generatedMigration: string;
    parsedCollections: CollectionSchema[];
  } {
    // Step 1: Create schema definition
    const originalSchema = createSchemaDefinition(collectionSchema);

    // Step 2: Generate migration (simulating empty database)
    const diff = compare(originalSchema, null);
    expect(diff.collectionsToCreate.length).toBeGreaterThan(0);

    const generatedPaths = generate(diff, tempDir);
    expect(generatedPaths.length).toBeGreaterThan(0);

    const generatedPath = generatedPaths[0];
    generatedFiles.push(generatedPath);
    expect(fs.existsSync(generatedPath)).toBe(true);

    // Step 3: Parse the generated migration
    const migrationContent = fs.readFileSync(generatedPath, "utf-8");
    const operations = parseMigrationOperations(migrationContent);

    // Step 4: Create snapshot from parsed operations
    const snapshot: SchemaSnapshot = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      collections: new Map<string, CollectionSchema>(),
    };

    for (const collection of operations.collectionsToCreate) {
      snapshot.collections.set(collection.name, collection);
    }

    // Add users collection to snapshot (it's in the schema but not generated)
    snapshot.collections.set("users", { name: "users", type: "auth", fields: [] } as CollectionSchema);

    // Step 5: Compare original schema to parsed snapshot
    const diffAfterGeneration = compare(originalSchema, snapshot);

    return {
      success:
        diffAfterGeneration.collectionsToCreate.length === 0 &&
        diffAfterGeneration.collectionsToModify.length === 0 &&
        diffAfterGeneration.collectionsToDelete.length === 0,
      diff: diffAfterGeneration,
      generatedMigration: migrationContent,
      parsedCollections: operations.collectionsToCreate,
    };
  }

  /**
   * Asserts that a migration round-trip is idempotent
   */
  function assertIdempotent(testName: string, collectionSchema: CollectionSchema) {
    const result = testMigrationRoundTrip(collectionSchema);

    if (!result.success) {
      console.error(`\n=== Migration Loop Detected: ${testName} ===`);
      console.error("\nOriginal Schema:");
      console.error(JSON.stringify(collectionSchema, null, 2));
      console.error("\nGenerated Migration (excerpt):");
      console.error(result.generatedMigration.substring(0, 2000));
      console.error("\nParsed Collections:");
      console.error(JSON.stringify(result.parsedCollections, null, 2));
      console.error("\nDetected Changes (should be empty):");
      if (result.diff.collectionsToCreate.length > 0) {
        console.error("Collections to create:", JSON.stringify(result.diff.collectionsToCreate, null, 2));
      }
      if (result.diff.collectionsToModify.length > 0) {
        console.error("Collections to modify:", JSON.stringify(result.diff.collectionsToModify, null, 2));
      }
      if (result.diff.collectionsToDelete.length > 0) {
        console.error("Collections to delete:", JSON.stringify(result.diff.collectionsToDelete, null, 2));
      }
    }

    expect(result.diff.collectionsToCreate).toHaveLength(0);
    expect(result.diff.collectionsToModify).toHaveLength(0);
    expect(result.diff.collectionsToDelete).toHaveLength(0);
  }

  describe("Text Field Options", () => {
    it("should preserve text field with min constraint", () => {
      assertIdempotent("text-min", {
        name: "test_text_min",
        type: "base",
        fields: [
          {
            name: "title",
            type: "text",
            required: true,
            options: { min: 1 },
          },
        ],
      });
    });

    it("should preserve text field with max constraint", () => {
      assertIdempotent("text-max", {
        name: "test_text_max",
        type: "base",
        fields: [
          {
            name: "title",
            type: "text",
            required: true,
            options: { max: 200 },
          },
        ],
      });
    });

    it("should preserve text field with min and max constraints", () => {
      assertIdempotent("text-min-max", {
        name: "test_text_min_max",
        type: "base",
        fields: [
          {
            name: "title",
            type: "text",
            required: true,
            options: { min: 1, max: 200 },
          },
        ],
      });
    });

    it("should preserve text field with pattern constraint", () => {
      assertIdempotent("text-pattern", {
        name: "test_text_pattern",
        type: "base",
        fields: [
          {
            name: "code",
            type: "text",
            required: true,
            options: { pattern: "^[A-Z]{3}-[0-9]{4}$" },
          },
        ],
      });
    });

    it("should preserve text field with all constraints", () => {
      assertIdempotent("text-all", {
        name: "test_text_all",
        type: "base",
        fields: [
          {
            name: "code",
            type: "text",
            required: true,
            options: { min: 8, max: 8, pattern: "^[A-Z]{3}-[0-9]{4}$" },
          },
        ],
      });
    });

    it("should preserve optional text field with constraints", () => {
      assertIdempotent("text-optional", {
        name: "test_text_optional",
        type: "base",
        fields: [
          {
            name: "summary",
            type: "text",
            required: false,
            options: { max: 500 },
          },
        ],
      });
    });
  });

  describe("Number Field Options", () => {
    it("should preserve number field with min constraint", () => {
      assertIdempotent("number-min", {
        name: "test_number_min",
        type: "base",
        fields: [
          {
            name: "quantity",
            type: "number",
            required: true,
            options: { min: 0 },
          },
        ],
      });
    });

    it("should preserve number field with max constraint", () => {
      assertIdempotent("number-max", {
        name: "test_number_max",
        type: "base",
        fields: [
          {
            name: "rating",
            type: "number",
            required: true,
            options: { max: 5 },
          },
        ],
      });
    });

    it("should preserve number field with min and max constraints", () => {
      assertIdempotent("number-min-max", {
        name: "test_number_min_max",
        type: "base",
        fields: [
          {
            name: "progress",
            type: "number",
            required: true,
            options: { min: 0, max: 100 },
          },
        ],
      });
    });

    it("should preserve number field with noDecimal constraint", () => {
      assertIdempotent("number-no-decimal", {
        name: "test_number_no_decimal",
        type: "base",
        fields: [
          {
            name: "count",
            type: "number",
            required: true,
            options: { noDecimal: true },
          },
        ],
      });
    });

    it("should preserve number field with all constraints", () => {
      assertIdempotent("number-all", {
        name: "test_number_all",
        type: "base",
        fields: [
          {
            name: "score",
            type: "number",
            required: true,
            options: { min: 0, max: 100, noDecimal: true },
          },
        ],
      });
    });
  });

  describe("Select Field Options", () => {
    it("should preserve select field with values", () => {
      assertIdempotent("select-values", {
        name: "test_select_values",
        type: "base",
        fields: [
          {
            name: "status",
            type: "select",
            required: true,
            options: { values: ["draft", "active", "complete"] },
          },
        ],
      });
    });

    it("should preserve select field with maxSelect", () => {
      assertIdempotent("select-max-select", {
        name: "test_select_max_select",
        type: "base",
        fields: [
          {
            name: "categories",
            type: "select",
            required: true,
            options: { values: ["a", "b", "c", "d"], maxSelect: 3 },
          },
        ],
      });
    });

    it("should preserve select field with single select (maxSelect: 1)", () => {
      assertIdempotent("select-single", {
        name: "test_select_single",
        type: "base",
        fields: [
          {
            name: "priority",
            type: "select",
            required: true,
            options: { values: ["low", "medium", "high"], maxSelect: 1 },
          },
        ],
      });
    });
  });

  describe("Relation Field Options", () => {
    it("should preserve relation field with single select", () => {
      assertIdempotent("relation-single", {
        name: "test_relation_single",
        type: "base",
        fields: [
          {
            name: "owner",
            type: "relation",
            required: true,
            relation: {
              collection: "users",
              maxSelect: 1,
              minSelect: 0,
              cascadeDelete: false,
            },
          },
        ],
      });
    });

    it("should preserve relation field with multiple select", () => {
      assertIdempotent("relation-multiple", {
        name: "test_relation_multiple",
        type: "base",
        fields: [
          {
            name: "subscribers",
            type: "relation",
            required: true,
            relation: {
              collection: "users",
              maxSelect: 999,
              minSelect: 0,
              cascadeDelete: false,
            },
          },
        ],
      });
    });

    it("should preserve relation field with cascadeDelete", () => {
      assertIdempotent("relation-cascade", {
        name: "test_relation_cascade",
        type: "base",
        fields: [
          {
            name: "parent",
            type: "relation",
            required: true,
            relation: {
              collection: "users",
              maxSelect: 1,
              minSelect: 0,
              cascadeDelete: true,
            },
          },
        ],
      });
    });

    it("should preserve relation field with minSelect", () => {
      assertIdempotent("relation-min-select", {
        name: "test_relation_min_select",
        type: "base",
        fields: [
          {
            name: "reviewers",
            type: "relation",
            required: true,
            relation: {
              collection: "users",
              maxSelect: 5,
              minSelect: 2,
              cascadeDelete: false,
            },
          },
        ],
      });
    });
  });

  describe("File Field Options", () => {
    it("should preserve file field with mimeTypes", () => {
      assertIdempotent("file-mime-types", {
        name: "test_file_mime_types",
        type: "base",
        fields: [
          {
            name: "image",
            type: "file",
            required: false,
            options: { mimeTypes: ["image/jpeg", "image/png"], maxSelect: 1 },
          },
        ],
      });
    });

    it("should preserve file field with maxSize", () => {
      assertIdempotent("file-max-size", {
        name: "test_file_max_size",
        type: "base",
        fields: [
          {
            name: "document",
            type: "file",
            required: false,
            options: { maxSize: 5242880, maxSelect: 1 },
          },
        ],
      });
    });

    it("should preserve file field with thumbs", () => {
      assertIdempotent("file-thumbs", {
        name: "test_file_thumbs",
        type: "base",
        fields: [
          {
            name: "avatar",
            type: "file",
            required: false,
            options: { thumbs: ["100x100", "200x200"], maxSelect: 1 },
          },
        ],
      });
    });

    it("should preserve multiple files field", () => {
      assertIdempotent("files-multiple", {
        name: "test_files_multiple",
        type: "base",
        fields: [
          {
            name: "attachments",
            type: "file",
            required: false,
            options: { maxSelect: 10 },
          },
        ],
      });
    });
  });

  describe("Date Field Options", () => {
    it("should preserve date field with min constraint", () => {
      assertIdempotent("date-min", {
        name: "test_date_min",
        type: "base",
        fields: [
          {
            name: "startDate",
            type: "date",
            required: true,
            options: { min: "2024-01-01" },
          },
        ],
      });
    });

    it("should preserve date field with max constraint", () => {
      assertIdempotent("date-max", {
        name: "test_date_max",
        type: "base",
        fields: [
          {
            name: "endDate",
            type: "date",
            required: true,
            options: { max: "2025-12-31" },
          },
        ],
      });
    });
  });

  describe("Autodate Field Options", () => {
    it("should preserve autodate field with onCreate", () => {
      assertIdempotent("autodate-on-create", {
        name: "test_autodate_on_create",
        type: "base",
        fields: [
          {
            name: "createdAt",
            type: "autodate",
            required: true,
            options: { onCreate: true, onUpdate: false },
          },
        ],
      });
    });

    it("should preserve autodate field with onUpdate", () => {
      assertIdempotent("autodate-on-update", {
        name: "test_autodate_on_update",
        type: "base",
        fields: [
          {
            name: "updatedAt",
            type: "autodate",
            required: true,
            options: { onCreate: true, onUpdate: true },
          },
        ],
      });
    });
  });

  describe("Complex Collections", () => {
    it("should preserve collection with multiple field types", () => {
      assertIdempotent("complex-collection", {
        name: "test_complex",
        type: "base",
        fields: [
          {
            name: "title",
            type: "text",
            required: true,
            options: { min: 1, max: 200 },
          },
          {
            name: "content",
            type: "editor",
            required: true,
          },
          {
            name: "status",
            type: "select",
            required: true,
            options: { values: ["draft", "active", "complete", "fail"], maxSelect: 1 },
          },
          {
            name: "summary",
            type: "text",
            required: false,
            options: { max: 500 },
          },
          {
            name: "owner",
            type: "relation",
            required: true,
            relation: {
              collection: "users",
              maxSelect: 1,
              minSelect: 0,
              cascadeDelete: false,
            },
          },
          {
            name: "subscribers",
            type: "relation",
            required: false,
            relation: {
              collection: "users",
              maxSelect: 999,
              minSelect: 0,
              cascadeDelete: false,
            },
          },
        ],
      });
    });

    it("should preserve collection with indexes", () => {
      assertIdempotent("collection-with-indexes", {
        name: "test_indexes",
        type: "base",
        fields: [
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "username",
            type: "text",
            required: true,
            options: { min: 3, max: 50 },
          },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_test_indexes_email ON test_indexes (email)",
          "CREATE INDEX idx_test_indexes_username ON test_indexes (username)",
        ],
      });
    });

    it("should preserve collection with permissions", () => {
      assertIdempotent("collection-with-permissions", {
        name: "test_permissions",
        type: "base",
        fields: [
          {
            name: "title",
            type: "text",
            required: true,
          },
          {
            name: "owner",
            type: "relation",
            required: true,
            relation: {
              collection: "users",
              maxSelect: 1,
              minSelect: 0,
              cascadeDelete: false,
            },
          },
        ],
        permissions: {
          listRule: '@request.auth.id != ""',
          viewRule: '@request.auth.id != ""',
          createRule: '@request.auth.id != ""',
          updateRule: "owner = @request.auth.id",
          deleteRule: "owner = @request.auth.id",
          manageRule: null,
        },
      });
    });
  });

  describe("Relation Field to Existing Collection", () => {
    /**
     * Test case for the critical bug where adding a relation field to an existing collection
     * that references another existing collection should use the actual collection ID
     * from the snapshot, not app.findCollectionByNameOrId().id
     *
     * This test simulates:
     * 1. First migration: Create "Files" collection
     * 2. Second migration: Add "Media" collection with relation to "Files"
     * 3. Verify the relation uses the actual collection ID from the first migration
     */
    it("should use existing collection ID when adding relation field to existing collection", () => {
      // Step 1: Create initial schema with "Files" collection
      const filesCollection: CollectionSchema = {
        name: "Files",
        type: "base",
        fields: [
          {
            name: "name",
            type: "text",
            required: true,
          },
        ],
      };

      const initialSchema = createSchemaDefinition(filesCollection);
      const initialDiff = compare(initialSchema, null);
      const initialMigrationPaths = generate(initialDiff, tempDir);
      expect(initialMigrationPaths.length).toBeGreaterThan(0);
      generatedFiles.push(...initialMigrationPaths);

      // Step 2: Parse the first migration to get the Files collection ID
      const firstMigrationContent = fs.readFileSync(initialMigrationPaths[0], "utf-8");
      const firstOperations = parseMigrationOperations(firstMigrationContent);
      expect(firstOperations.collectionsToCreate.length).toBeGreaterThan(0);

      const filesCollectionFromMigration = firstOperations.collectionsToCreate.find((c) => c.name === "Files");
      expect(filesCollectionFromMigration).toBeDefined();
      expect(filesCollectionFromMigration?.id).toBeDefined();
      const filesCollectionId = filesCollectionFromMigration!.id!;

      // Step 3: Create snapshot from first migration
      const snapshot: SchemaSnapshot = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        collections: new Map<string, CollectionSchema>(),
      };

      for (const collection of firstOperations.collectionsToCreate) {
        snapshot.collections.set(collection.name, collection);
      }
      snapshot.collections.set("users", { name: "users", type: "auth", fields: [] } as CollectionSchema);

      // Step 4: Create schema with "Media" collection that has relation to "Files"
      const mediaCollection: CollectionSchema = {
        name: "Media",
        type: "base",
        fields: [
          {
            name: "title",
            type: "text",
            required: true,
          },
          {
            name: "proxyFileRef",
            type: "relation",
            required: false,
            relation: {
              collection: "Files",
              maxSelect: 1,
              minSelect: 0,
              cascadeDelete: false,
            },
          },
        ],
      };

      const updatedSchema: SchemaDefinition = {
        collections: new Map([
          ["Files", filesCollectionFromMigration!],
          ["Media", mediaCollection],
          ["users", { name: "users", type: "auth", fields: [] } as CollectionSchema],
        ]),
      };

      // Step 5: Generate second migration (adding Media collection with relation to Files)
      const secondDiff = compare(updatedSchema, snapshot);
      expect(secondDiff.collectionsToCreate.length).toBeGreaterThan(0);

      const secondMigrationPaths = generate(secondDiff, tempDir);
      expect(secondMigrationPaths.length).toBeGreaterThan(0);
      generatedFiles.push(...secondMigrationPaths);

      // Step 6: Verify the generated migration uses the actual collection ID
      const secondMigrationContent = fs.readFileSync(secondMigrationPaths[0], "utf-8");

      // The migration should use the actual collection ID, not app.findCollectionByNameOrId("Files").id
      expect(secondMigrationContent).toContain(`collectionId: "${filesCollectionId}"`);
      expect(secondMigrationContent).not.toContain('app.findCollectionByNameOrId("Files").id');

      // Step 7: Parse the second migration and verify idempotency
      const secondOperations = parseMigrationOperations(secondMigrationContent);
      const updatedSnapshot: SchemaSnapshot = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        collections: new Map(snapshot.collections),
      };

      for (const collection of secondOperations.collectionsToCreate) {
        updatedSnapshot.collections.set(collection.name, collection);
      }

      // Step 8: Compare again - should show no changes
      const finalDiff = compare(updatedSchema, updatedSnapshot);
      expect(finalDiff.collectionsToCreate).toHaveLength(0);
      expect(finalDiff.collectionsToModify).toHaveLength(0);
      expect(finalDiff.collectionsToDelete).toHaveLength(0);
    });

    /**
     * Test case for adding a relation field to an existing collection
     * This simulates the exact scenario from the user's bug report
     */
    it("should handle adding relation field to existing collection without migration loop", () => {
      // Step 1: Create initial schema with "Files" and "Media" collections (without relation)
      const filesCollection: CollectionSchema = {
        name: "Files",
        type: "base",
        fields: [
          {
            name: "name",
            type: "text",
            required: true,
          },
        ],
      };

      const mediaCollectionInitial: CollectionSchema = {
        name: "Media",
        type: "base",
        fields: [
          {
            name: "title",
            type: "text",
            required: true,
          },
        ],
      };

      const initialSchema = createSchemaDefinition(filesCollection);
      const initialDiff = compare(initialSchema, null);
      const initialMigrationPaths = generate(initialDiff, tempDir);
      expect(initialMigrationPaths.length).toBeGreaterThan(0);
      generatedFiles.push(...initialMigrationPaths);

      // Parse first migration to get collection IDs
      const firstMigrationContent = fs.readFileSync(initialMigrationPaths[0], "utf-8");
      const firstOperations = parseMigrationOperations(firstMigrationContent);

      const snapshot: SchemaSnapshot = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        collections: new Map<string, CollectionSchema>(),
      };

      for (const collection of firstOperations.collectionsToCreate) {
        snapshot.collections.set(collection.name, collection);
      }
      snapshot.collections.set("users", { name: "users", type: "auth", fields: [] } as CollectionSchema);

      // Step 2: Add Media collection
      const mediaDiff = compare(
        {
          collections: new Map([...Array.from(snapshot.collections), ["Media", mediaCollectionInitial]]),
        },
        snapshot
      );
      const mediaMigrationPaths = generate(mediaDiff, tempDir);
      expect(mediaMigrationPaths.length).toBeGreaterThan(0);
      generatedFiles.push(...mediaMigrationPaths);

      const mediaMigrationContent = fs.readFileSync(mediaMigrationPaths[0], "utf-8");
      const mediaOperations = parseMigrationOperations(mediaMigrationContent);

      const snapshotWithMedia: SchemaSnapshot = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        collections: new Map(snapshot.collections),
      };

      for (const collection of mediaOperations.collectionsToCreate) {
        snapshotWithMedia.collections.set(collection.name, collection);
      }

      const filesCollectionFromSnapshot = snapshotWithMedia.collections.get("Files");
      expect(filesCollectionFromSnapshot).toBeDefined();
      expect(filesCollectionFromSnapshot?.id).toBeDefined();
      const filesCollectionId = filesCollectionFromSnapshot!.id!;

      // Step 3: Add relation field to Media collection
      const mediaCollectionWithRelation: CollectionSchema = {
        name: "Media",
        type: "base",
        fields: [
          {
            name: "title",
            type: "text",
            required: true,
          },
          {
            name: "proxyFileRef",
            type: "relation",
            required: false,
            relation: {
              collection: "Files",
              maxSelect: 1,
              minSelect: 0,
              cascadeDelete: false,
            },
          },
        ],
      };

      const updatedSchema: SchemaDefinition = {
        collections: new Map([...Array.from(snapshotWithMedia.collections), ["Media", mediaCollectionWithRelation]]),
      };

      const relationDiff = compare(updatedSchema, snapshotWithMedia);
      expect(relationDiff.collectionsToModify.length).toBeGreaterThan(0);
      expect(relationDiff.collectionsToModify[0].fieldsToAdd.length).toBe(1);

      const relationMigrationPaths = generate(relationDiff, tempDir);
      expect(relationMigrationPaths.length).toBeGreaterThan(0);
      generatedFiles.push(...relationMigrationPaths);

      // Step 4: Verify the migration uses the actual collection ID
      const relationMigrationContent = fs.readFileSync(relationMigrationPaths[0], "utf-8");
      expect(relationMigrationContent).toContain(`collectionId: "${filesCollectionId}"`);
      expect(relationMigrationContent).not.toContain('app.findCollectionByNameOrId("Files").id');

      // Step 5: Verify idempotency
      const finalSnapshot: SchemaSnapshot = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        collections: new Map(snapshotWithMedia.collections),
      };

      // Apply the modification to the snapshot
      const mediaCollectionInSnapshot = finalSnapshot.collections.get("Media");
      if (mediaCollectionInSnapshot) {
        const updatedMediaCollection: CollectionSchema = {
          ...mediaCollectionInSnapshot,
          fields: [
            ...mediaCollectionInSnapshot.fields,
            {
              name: "proxyFileRef",
              type: "relation",
              required: false,
              relation: {
                collection: "Files",
                maxSelect: 1,
                minSelect: 0,
                cascadeDelete: false,
              },
            },
          ],
        };
        finalSnapshot.collections.set("Media", updatedMediaCollection);
      }

      const finalDiff = compare(updatedSchema, finalSnapshot);
      expect(finalDiff.collectionsToCreate).toHaveLength(0);
      expect(finalDiff.collectionsToModify).toHaveLength(0);
      expect(finalDiff.collectionsToDelete).toHaveLength(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty options object", () => {
      assertIdempotent("empty-options", {
        name: "test_empty_options",
        type: "base",
        fields: [
          {
            name: "title",
            type: "text",
            required: true,
            options: {},
          },
        ],
      });
    });

    it("should handle undefined options", () => {
      assertIdempotent("undefined-options", {
        name: "test_undefined_options",
        type: "base",
        fields: [
          {
            name: "title",
            type: "text",
            required: true,
          },
        ],
      });
    });

    it("should handle collection with no fields", () => {
      assertIdempotent("no-fields", {
        name: "test_no_fields",
        type: "base",
        fields: [],
      });
    });

    it("should handle boolean field", () => {
      assertIdempotent("bool-field", {
        name: "test_bool",
        type: "base",
        fields: [
          {
            name: "active",
            type: "bool",
            required: false,
          },
        ],
      });
    });

    it("should handle json field", () => {
      assertIdempotent("json-field", {
        name: "test_json",
        type: "base",
        fields: [
          {
            name: "metadata",
            type: "json",
            required: false,
          },
        ],
      });
    });

    it("should handle email field", () => {
      assertIdempotent("email-field", {
        name: "test_email",
        type: "base",
        fields: [
          {
            name: "contact",
            type: "email",
            required: true,
          },
        ],
      });
    });

    it("should handle url field", () => {
      assertIdempotent("url-field", {
        name: "test_url",
        type: "base",
        fields: [
          {
            name: "website",
            type: "url",
            required: false,
          },
        ],
      });
    });
  });

  describe("Real-World Scenarios", () => {
    it("should handle Projects-like schema (reproduces actual bug)", () => {
      // This test reproduces the exact issue seen in the Projects collection
      // where title and summary fields were causing migration loops
      assertIdempotent("projects-like", {
        name: "Projects",
        type: "base",
        fields: [
          {
            name: "title",
            type: "text",
            required: true,
            options: { min: 1, max: 200 },
          },
          {
            name: "content",
            type: "editor",
            required: true,
          },
          {
            name: "status",
            type: "select",
            required: true,
            options: { values: ["draft", "active", "complete", "fail"], maxSelect: 1 },
          },
          {
            name: "summary",
            type: "text",
            required: false,
            options: { max: 500 },
          },
          {
            name: "OwnerUser",
            type: "relation",
            required: true,
            relation: {
              collection: "users",
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
              collection: "users",
              maxSelect: 999,
              minSelect: 0,
              cascadeDelete: false,
            },
          },
        ],
        permissions: {
          listRule: '@request.auth.id != ""',
          viewRule: '@request.auth.id != "" && (OwnerUser = @request.auth.id || SubscriberUsers ?= @request.auth.id)',
          createRule: '@request.auth.id != ""',
          updateRule: '@request.auth.id != "" && OwnerUser = @request.auth.id',
          deleteRule: '@request.auth.id != "" && OwnerUser = @request.auth.id',
          manageRule: null,
        },
      });
    });
  });
});
