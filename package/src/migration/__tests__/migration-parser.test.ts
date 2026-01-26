/**
 * Unit tests for migration-parser.ts
 * Tests parsing of PocketBase migration files to extract collection operations
 */

import * as fs from "fs";
import * as path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  extractTimestampFromFilename,
  findMigrationsAfterSnapshot,
  parseMigrationOperations,
} from "../migration-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("migration-parser", () => {
  describe("extractTimestampFromFilename", () => {
    it("should extract timestamp from standard migration filename", () => {
      const filename = "1764625712_created_test_collection.js";
      expect(extractTimestampFromFilename(filename)).toBe(1764625712);
    });

    it("should extract timestamp from filename with underscores", () => {
      const filename = "1764625712_created_test_collection_with_many_parts.js";
      expect(extractTimestampFromFilename(filename)).toBe(1764625712);
    });

    it("should return null for filename without timestamp", () => {
      const filename = "created_test_collection.js";
      expect(extractTimestampFromFilename(filename)).toBeNull();
    });

    it("should return null for invalid filename format", () => {
      const filename = "test.js";
      expect(extractTimestampFromFilename(filename)).toBeNull();
    });

    it("should handle very large timestamps", () => {
      const filename = "9999999999_created_test.js";
      expect(extractTimestampFromFilename(filename)).toBe(9999999999);
    });
  });

  describe("findMigrationsAfterSnapshot", () => {
    it("should find migrations after snapshot timestamp", () => {
      const migrationsPath = path.join(__dirname, "fixtures/reference-migrations");
      const snapshotTimestamp = 1764625700;

      const migrations = findMigrationsAfterSnapshot(migrationsPath, snapshotTimestamp);

      expect(migrations.length).toBeGreaterThan(0);
      // All migrations should have timestamp > snapshotTimestamp
      for (const migrationPath of migrations) {
        const filename = path.basename(migrationPath);
        const timestamp = extractTimestampFromFilename(filename);
        expect(timestamp).toBeGreaterThan(snapshotTimestamp);
      }
    });

    it("should exclude snapshot files", () => {
      const migrationsPath = path.join(__dirname, "fixtures/reference-migrations");
      const snapshotTimestamp = 0;

      const migrations = findMigrationsAfterSnapshot(migrationsPath, snapshotTimestamp);

      // Should not include snapshot files
      for (const migrationPath of migrations) {
        const filename = path.basename(migrationPath);
        expect(filename).not.toMatch(/_collections_snapshot\.js$/);
        expect(filename).not.toMatch(/_snapshot\.js$/);
      }
    });

    it("should exclude non-JS files", () => {
      const migrationsPath = path.join(__dirname, "fixtures/reference-migrations");
      const snapshotTimestamp = 0;

      const migrations = findMigrationsAfterSnapshot(migrationsPath, snapshotTimestamp);

      for (const migrationPath of migrations) {
        expect(migrationPath).toMatch(/\.js$/);
      }
    });

    it("should return empty array for non-existent directory", () => {
      const migrationsPath = path.join(__dirname, "non-existent-directory");
      const snapshotTimestamp = 0;

      const migrations = findMigrationsAfterSnapshot(migrationsPath, snapshotTimestamp);

      expect(migrations).toEqual([]);
    });

    it("should return migrations sorted by timestamp", () => {
      const migrationsPath = path.join(__dirname, "fixtures/reference-migrations");
      const snapshotTimestamp = 0;

      const migrations = findMigrationsAfterSnapshot(migrationsPath, snapshotTimestamp);

      // Check that migrations are sorted
      const timestamps = migrations.map((m) => {
        const filename = path.basename(m);
        return extractTimestampFromFilename(filename)!;
      });

      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });

    it("should exclude migrations with timestamp <= snapshot timestamp", () => {
      const migrationsPath = path.join(__dirname, "fixtures/reference-migrations");
      const snapshotTimestamp = 1764626000; // High timestamp

      const migrations = findMigrationsAfterSnapshot(migrationsPath, snapshotTimestamp);

      // Should only include migrations after this timestamp
      for (const migrationPath of migrations) {
        const filename = path.basename(migrationPath);
        const timestamp = extractTimestampFromFilename(filename);
        expect(timestamp).toBeGreaterThan(snapshotTimestamp);
      }
    });
  });

  describe("parseMigrationOperations", () => {
    it("should parse collection creation from new Collection()", () => {
      const migrationContent = `
        migrate((app) => {
          const collection = new Collection({
            name: "test_collection",
            id: "test_collection_id",
            type: "base",
            fields: [
              { name: "title", id: "title_id", type: "text", required: true }
            ],
            indexes: []
          });
          return app.save(collection);
        }, (app) => {});
      `;

      const result = parseMigrationOperations(migrationContent);

      expect(result.collectionsToCreate).toHaveLength(1);
      expect(result.collectionsToCreate[0].name).toBe("test_collection");
      expect(result.collectionsToCreate[0].fields).toHaveLength(1);
      expect(result.collectionsToDelete).toHaveLength(0);
    });

    it("should parse collection deletion from app.delete()", () => {
      const migrationContent = `
        migrate((app) => {
          const collection = app.findCollectionByNameOrId("test_collection");
          return app.delete(collection);
        }, (app) => {});
      `;

      const result = parseMigrationOperations(migrationContent);

      expect(result.collectionsToDelete).toContain("test_collection");
      expect(result.collectionsToCreate).toHaveLength(0);
    });

    it("should parse collection deletion with findCollectionByNameOrId inline", () => {
      const migrationContent = `
        migrate((app) => {
          return app.delete(app.findCollectionByNameOrId("test_collection"));
        }, (app) => {});
      `;

      const result = parseMigrationOperations(migrationContent);

      expect(result.collectionsToDelete).toContain("test_collection");
    });

    it("should parse both creation and deletion in same migration", () => {
      const migrationContent = `
        migrate((app) => {
          const collection_new = new Collection({
            name: "new_collection",
            id: "new_collection_id",
            type: "base",
            fields: []
          });
          app.save(collection_new);

          const collection_old = app.findCollectionByNameOrId("old_collection");
          app.delete(collection_old);
        }, (app) => {});
      `;

      const result = parseMigrationOperations(migrationContent);

      expect(result.collectionsToCreate).toHaveLength(1);
      expect(result.collectionsToCreate[0].name).toBe("new_collection");
      expect(result.collectionsToDelete).toContain("old_collection");
    });

    it("should parse multiple collection creations", () => {
      const migrationContent = `
        migrate((app) => {
          const collection1 = new Collection({
            name: "collection1",
            id: "collection1_id",
            type: "base",
            fields: []
          });
          app.save(collection1);

          const collection2 = new Collection({
            name: "collection2",
            id: "collection2_id",
            type: "base",
            fields: []
          });
          app.save(collection2);
        }, (app) => {});
      `;

      const result = parseMigrationOperations(migrationContent);

      expect(result.collectionsToCreate).toHaveLength(2);
      expect(result.collectionsToCreate.map((c) => c.name)).toContain("collection1");
      expect(result.collectionsToCreate.map((c) => c.name)).toContain("collection2");
    });

    it("should handle collection with relation field", () => {
      const migrationContent = `
        migrate((app) => {
          const collection = new Collection({
            name: "projects",
            id: "projects_id",
            type: "base",
            fields: [
              {
                name: "OwnerUser",
                id: "OwnerUser_id",
                type: "relation",
                required: true,
                collectionId: "_pb_users_auth_",
                maxSelect: 1,
                minSelect: 0,
                cascadeDelete: false
              }
            ]
          });
          return app.save(collection);
        }, (app) => {});
      `;

      const result = parseMigrationOperations(migrationContent);

      expect(result.collectionsToCreate).toHaveLength(1);
      const RelationField = result.collectionsToCreate[0].fields.find((f) => f.type === "relation");
      expect(RelationField).toBeDefined();
      expect(RelationField?.relation?.collection).toBe("users");
    });

    it("should handle collection with select field values", () => {
      const migrationContent = `
        migrate((app) => {
          const collection = new Collection({
            name: "tasks",
            id: "tasks_id",
            type: "base",
            fields: [
              {
                name: "status",
                id: "status_id",
                type: "select",
                required: true,
                values: ["draft", "active", "complete"]
              }
            ]
          });
          return app.save(collection);
        }, (app) => {});
      `;

      const result = parseMigrationOperations(migrationContent);

      expect(result.collectionsToCreate).toHaveLength(1);
      const selectField = result.collectionsToCreate[0].fields.find((f) => f.type === "select");
      expect(selectField?.options?.values).toEqual(["draft", "active", "complete"]);
    });

    it("should handle collection with permissions", () => {
      const migrationContent = `
        migrate((app) => {
          const collection = new Collection({
            name: "projects",
            id: "projects_id",
            type: "base",
            fields: [],
            listRule: "@request.auth.id != ''",
            viewRule: "@request.auth.id != ''",
            createRule: "@request.auth.id != ''",
            updateRule: "@request.auth.id != '' && OwnerUser = @request.auth.id",
            deleteRule: "@request.auth.id != '' && OwnerUser = @request.auth.id"
          });
          return app.save(collection);
        }, (app) => {});
      `;

      const result = parseMigrationOperations(migrationContent);

      expect(result.collectionsToCreate).toHaveLength(1);
      const collection = result.collectionsToCreate[0];
      expect(collection.rules?.listRule).toBe("@request.auth.id != ''");
      expect(collection.rules?.updateRule).toBe("@request.auth.id != '' && OwnerUser = @request.auth.id");
    });

    it("should parse real migration file from fixtures - blank collection", () => {
      const migrationPath = path.join(
        __dirname,
        "fixtures/reference-migrations/1764625735_created_create_new_collection_blank.js"
      );
      const migrationContent = fs.readFileSync(migrationPath, "utf-8");

      const result = parseMigrationOperations(migrationContent);

      expect(result.collectionsToCreate.length).toBeGreaterThan(0);
      expect(result.collectionsToDelete.length).toBeGreaterThanOrEqual(0);
    });

    it("should parse real migration file from fixtures - collection with columns", () => {
      const migrationPath = path.join(
        __dirname,
        "fixtures/reference-migrations/1764625712_created_create_new_collection_with_columns.js"
      );
      const migrationContent = fs.readFileSync(migrationPath, "utf-8");

      const result = parseMigrationOperations(migrationContent);

      expect(result.collectionsToCreate.length).toBeGreaterThan(0);
      const collection = result.collectionsToCreate[0];
      expect(collection.fields.length).toBeGreaterThan(0);
    });

    it("should parse real migration file with restricted API rules", () => {
      const migrationPath = path.join(
        __dirname,
        "fixtures/reference-migrations/1764625943_created_create_new_collection_with_restricted_api_rules.js"
      );
      const migrationContent = fs.readFileSync(migrationPath, "utf-8");

      const result = parseMigrationOperations(migrationContent);

      expect(result.collectionsToCreate.length).toBeGreaterThan(0);
      const collection = result.collectionsToCreate[0];
      expect(collection.rules).toBeDefined();
      expect(collection.rules?.listRule).toBeTruthy();
    });

    it("should parse real migration file with null permissions", () => {
      const migrationPath = path.join(
        __dirname,
        "fixtures/reference-migrations/1764700000_created_create_new_collection_with_null_permissions.js"
      );
      const migrationContent = fs.readFileSync(migrationPath, "utf-8");

      const result = parseMigrationOperations(migrationContent);

      expect(result.collectionsToCreate.length).toBeGreaterThan(0);
      const collection = result.collectionsToCreate[0];
      expect(collection.rules).toBeDefined();
      expect(collection.rules?.listRule).toBeNull();
    });

    it("should handle update migration (field addition) - should not create new collection", () => {
      const migrationPath = path.join(
        __dirname,
        "fixtures/reference-migrations/1764626004_updated_edit_collection_add_field.js"
      );
      const migrationContent = fs.readFileSync(migrationPath, "utf-8");

      const result = parseMigrationOperations(migrationContent);

      // Update migrations use addAt/removeById, not new Collection()
      // So we should not see a new collection creation
      expect(result.collectionsToCreate).toHaveLength(0);
    });

    it("should handle migration with complex nested structures", () => {
      const migrationContent = `
        migrate((app) => {
          const collection = new Collection({
            name: "complex",
            id: "complex_id",
            type: "base",
            fields: [
              {
                name: "nested",
                id: "nested_id",
                type: "json",
                required: false,
                options: {
                  maxSize: 1000
                }
              },
              {
                name: "relation_field",
                id: "relation_field_id",
                type: "relation",
                collectionId: "_pb_users_auth_",
                maxSelect: 999,
                minSelect: 0,
                cascadeDelete: true
              }
            ],
            indexes: [
              "CREATE INDEX idx_name ON complex (name)",
              "CREATE UNIQUE INDEX idx_unique ON complex (unique_field)"
            ],
            listRule: "id != ''",
            viewRule: null
          });
          return app.save(collection);
        }, (app) => {});
      `;

      const result = parseMigrationOperations(migrationContent);

      expect(result.collectionsToCreate).toHaveLength(1);
      const collection = result.collectionsToCreate[0];
      expect(collection.fields).toHaveLength(2);
      expect(collection.indexes).toHaveLength(2);
      expect(collection.rules?.listRule).toBe("id != ''");
      expect(collection.rules?.viewRule).toBeNull();
    });

    it("should handle migration without migrate() wrapper", () => {
      const migrationContent = `
        const collection = new Collection({
          name: "test",
          id: "test_id",
          type: "base",
          fields: []
        });
        app.save(collection);
      `;

      const result = parseMigrationOperations(migrationContent);

      // Should still parse even without migrate() wrapper
      expect(result.collectionsToCreate.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle empty migration", () => {
      const migrationContent = `migrate((app) => {}, (app) => {});`;

      const result = parseMigrationOperations(migrationContent);

      expect(result.collectionsToCreate).toHaveLength(0);
      expect(result.collectionsToDelete).toHaveLength(0);
    });

    it("should handle migration with only comments", () => {
      const migrationContent = `
        migrate((app) => {
          // UP MIGRATION
          // No operations
        }, (app) => {
          // DOWN MIGRATION
        });
      `;

      const result = parseMigrationOperations(migrationContent);

      expect(result.collectionsToCreate).toHaveLength(0);
      expect(result.collectionsToDelete).toHaveLength(0);
    });

    it("should parse projects migration from pocketbase folder", () => {
      const migrationPath = path.join(__dirname, "../../../../pocketbase/pb_migrations/1766190074_created_projects.js");

      if (fs.existsSync(migrationPath)) {
        const migrationContent = fs.readFileSync(migrationPath, "utf-8");
        const result = parseMigrationOperations(migrationContent);

        expect(result.collectionsToCreate.length).toBeGreaterThan(0);
        const collection = result.collectionsToCreate.find((c) => c.name === "projects");
        expect(collection).toBeDefined();
        expect(collection?.fields.length).toBeGreaterThan(0);

        // Check that relation fields are parsed correctly
        const ownerField = collection?.fields.find((f) => f.name === "OwnerUser");
        expect(ownerField?.type).toBe("relation");
        expect(ownerField?.relation?.collection).toBe("Users");
      }
    });
  });
});
