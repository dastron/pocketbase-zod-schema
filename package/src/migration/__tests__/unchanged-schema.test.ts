/**
 * Unit tests to ensure unchanged schemas don't trigger migrations
 * Tests that parsing and converting migrations produces consistent results
 * that can be correctly compared to detect no changes
 */

import * as fs from "fs";
import * as path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { compare } from "../diff";
import { executeMigrationFiles } from "./helpers/migration-executor";
import { convertPocketBaseCollection } from "../pocketbase-converter";
import type { CollectionSchema, SchemaDefinition, SchemaSnapshot } from "../types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("unchanged-schema detection", () => {
  /**
   * Helper to create a schema definition from a collection
   */
  function createSchemaFromCollection(collection: CollectionSchema): SchemaDefinition {
    return {
      collections: new Map([[collection.name, collection]]),
    };
  }

  /**
   * Helper to create a snapshot from a collection
   */
  function createSnapshotFromCollection(collection: CollectionSchema): SchemaSnapshot {
    return {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      collections: new Map([[collection.name, collection]]),
    };
  }

  describe("round-trip conversion consistency", () => {
    it("should produce identical schema when parsing migration operations and comparing to itself", () => {
      const migrationPath = path.join(
        __dirname,
        "fixtures/reference-migrations/1764625735_created_create_new_collection_blank.js"
      );
      // Execute the migration and read the collections it created
      const created = executeMigrationFiles([migrationPath]).created;

      const schema: SchemaDefinition = {
        collections: new Map(created.map((c) => [c.name, c])),
      };

      const snapshot: SchemaSnapshot = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        collections: new Map(created.map((c) => [c.name, c])),
      };

      // Compare schema with itself (should show no changes)
      const diff = compare(schema, snapshot);

      expect(diff.collectionsToCreate).toHaveLength(0);
      expect(diff.collectionsToDelete).toHaveLength(0);
      expect(diff.collectionsToModify).toHaveLength(0);
    });

    it("should detect no changes when parsing the same migration twice", () => {
      const migrationPath = path.join(
        __dirname,
        "fixtures/reference-migrations/1764625712_created_create_new_collection_with_columns.js"
      );
      // Execute the migration twice, in independent stores
      const created1 = executeMigrationFiles([migrationPath]).created;
      const created2 = executeMigrationFiles([migrationPath]).created;

      // Create schemas from both
      const schema1: SchemaDefinition = {
        collections: new Map(created1.map((c) => [c.name, c])),
      };

      const snapshot2: SchemaSnapshot = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        collections: new Map(created2.map((c) => [c.name, c])),
      };

      // Compare the two
      const diff = compare(schema1, snapshot2);

      expect(diff.collectionsToCreate).toHaveLength(0);
      expect(diff.collectionsToDelete).toHaveLength(0);
      expect(diff.collectionsToModify).toHaveLength(0);
    });

    it("should detect no changes when parsing migration operations and comparing", () => {
      const migrationPath = path.join(
        __dirname,
        "fixtures/reference-migrations/1764625943_created_create_new_collection_with_restricted_api_rules.js"
      );
      // Execute the migration and read the collections it created
      const created = executeMigrationFiles([migrationPath]).created;

      const schema: SchemaDefinition = {
        collections: new Map(created.map((c) => [c.name, c])),
      };

      // Build a snapshot from the same collections
      const snapshot: SchemaSnapshot = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        collections: new Map(created.map((c) => [c.name, c])),
      };

      // Compare - should show no changes
      const diff = compare(schema, snapshot);

      expect(diff.collectionsToCreate).toHaveLength(0);
      expect(diff.collectionsToDelete).toHaveLength(0);
      expect(diff.collectionsToModify).toHaveLength(0);
    });
  });

  describe("field-level consistency", () => {
    it("should preserve select field values through conversion", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [
          {
            name: "status",
            id: "status_id",
            type: "select",
            required: true,
            values: ["draft", "active", "complete"],
          },
        ],
      };

      const converted = convertPocketBaseCollection(pbCollection);
      const schema = createSchemaFromCollection(converted);
      const snapshot = createSnapshotFromCollection(converted);

      const diff = compare(schema, snapshot);

      expect(diff.collectionsToModify).toHaveLength(0);
      expect(converted.fields[0].options?.values).toEqual(["draft", "active", "complete"]);
    });

    it("should preserve relation field configuration through conversion", () => {
      const pbCollection = {
        name: "projects",
        id: "projects_id",
        type: "base",
        fields: [
          {
            name: "owner",
            id: "owner_id",
            type: "relation",
            required: true,
            collectionId: "_pb_users_auth_",
            maxSelect: 1,
            minSelect: 0,
            cascadeDelete: false,
          },
          {
            name: "subscribers",
            id: "subscribers_id",
            type: "relation",
            required: true,
            collectionId: "_pb_users_auth_",
            maxSelect: 999,
            minSelect: 0,
            cascadeDelete: false,
          },
        ],
      };

      const converted = convertPocketBaseCollection(pbCollection);
      const schema = createSchemaFromCollection(converted);
      const snapshot = createSnapshotFromCollection(converted);

      const diff = compare(schema, snapshot);

      expect(diff.collectionsToModify).toHaveLength(0);
      expect(converted.fields[0].relation?.collection).toBe("users");
      expect(converted.fields[0].relation?.maxSelect).toBe(1);
      expect(converted.fields[1].relation?.maxSelect).toBe(999);
    });

    it("should preserve permissions through conversion", () => {
      const pbCollection = {
        name: "projects",
        id: "projects_id",
        type: "base",
        fields: [],
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != '' && owner = @request.auth.id",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && owner = @request.auth.id",
        deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
        manageRule: null,
      };

      const converted = convertPocketBaseCollection(pbCollection);
      const schema = createSchemaFromCollection(converted);
      const snapshot = createSnapshotFromCollection(converted);

      const diff = compare(schema, snapshot);

      expect(diff.collectionsToModify).toHaveLength(0);
      expect(converted.rules?.listRule).toBe("@request.auth.id != ''");
      expect(converted.rules?.updateRule).toBe("@request.auth.id != '' && owner = @request.auth.id");
    });

    it("should preserve null permissions through conversion", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [],
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        manageRule: null,
      };

      const converted = convertPocketBaseCollection(pbCollection);
      const schema = createSchemaFromCollection(converted);
      const snapshot = createSnapshotFromCollection(converted);

      const diff = compare(schema, snapshot);

      expect(diff.collectionsToModify).toHaveLength(0);
      expect(converted.rules?.listRule).toBeNull();
      expect(converted.rules?.viewRule).toBeNull();
    });

    it("should preserve empty string permissions through conversion", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [],
        listRule: "",
        viewRule: "",
      };

      const converted = convertPocketBaseCollection(pbCollection);
      const schema = createSchemaFromCollection(converted);
      const snapshot = createSnapshotFromCollection(converted);

      const diff = compare(schema, snapshot);

      expect(diff.collectionsToModify).toHaveLength(0);
      expect(converted.rules?.listRule).toBe("");
      expect(converted.rules?.viewRule).toBe("");
    });
  });

  describe("real migration file consistency", () => {
    it("should detect no changes for projects migration when parsed and compared", () => {
      const migrationPath = path.join(__dirname, "../../../../pocketbase/pb_migrations/1766190074_created_projects.js");

      if (!fs.existsSync(migrationPath)) {
        // Skip if migration doesn't exist
        return;
      }

      const created = executeMigrationFiles([migrationPath]).created;

      expect(created.length).toBeGreaterThan(0);

      // Create schema and snapshot from the executed state
      const schema: SchemaDefinition = {
        collections: new Map(created.map((c) => [c.name, c])),
      };

      const snapshot: SchemaSnapshot = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        collections: new Map(created.map((c) => [c.name, c])),
      };

      // Compare - should show no changes
      const diff = compare(schema, snapshot);

      expect(diff.collectionsToCreate).toHaveLength(0);
      expect(diff.collectionsToDelete).toHaveLength(0);
      expect(diff.collectionsToModify).toHaveLength(0);
    });

    it("should handle all reference migrations without false positives", () => {
      const migrationsDir = path.join(__dirname, "fixtures/reference-migrations");
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".js"));

      for (const file of files) {
        // Skip update migrations (they don't create new collections)
        if (file.includes("updated_")) {
          continue;
        }

        const migrationPath = path.join(migrationsDir, file);

        // A migration the engine cannot execute is a real defect — let it throw
        const created = executeMigrationFiles([migrationPath]).created;

        if (created.length > 0) {
          const schema: SchemaDefinition = {
            collections: new Map(created.map((c) => [c.name, c])),
          };

          const snapshot: SchemaSnapshot = {
            version: "1.0.0",
            timestamp: new Date().toISOString(),
            collections: new Map(created.map((c) => [c.name, c])),
          };

          // Compare with itself - should show no changes
          const diff = compare(schema, snapshot);

          expect(diff.collectionsToCreate).toHaveLength(0);
          expect(diff.collectionsToDelete).toHaveLength(0);
          expect(diff.collectionsToModify).toHaveLength(0);
        }
      }
    });
  });
});
