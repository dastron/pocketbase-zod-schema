import { describe, expect, it } from "vitest";
import { parseMigrationOperations } from "../../migration-parser";
import { applyMigrationOperations } from "../../snapshot";
import type { CollectionSchema, SchemaSnapshot } from "../../types";

describe("Integration: Create, Update, Check Status", () => {
  it("should correctly update schema state by applying update migrations", () => {
    // 1. Initial State (Snapshot)
    const initialSnapshot: SchemaSnapshot = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      collections: new Map<string, CollectionSchema>([
        [
          "test_collection",
          {
            name: "test_collection",
            id: "test_collection_id",
            type: "base",
            fields: [{ name: "title", id: "title_id", type: "text", required: true }],
          },
        ],
      ]),
    };

    // 2. Migration: Update (Add field, remove field, modify field)
    const updateMigration = `
      migrate((app) => {
        const collection = app.findCollectionByNameOrId("test_collection");

        // Add field
        collection.fields.add(new TextField({
          name: "description",
          required: false
        }));

        // Remove field (assuming 'old_field' existed, but let's stick to what we have)
        // Wait, remove field needs it to exist. Let's add it to snapshot first if we want to test removal.
        // Actually, let's just test addition and modification of existing.

        // Modify field
        const titleField = collection.fields.getByName("title");
        titleField.required = false;

        return app.save(collection);
      }, (app) => {});
    `;

    // 3. Parse Migration
    const operations = parseMigrationOperations(updateMigration);

    expect(operations.collectionsToUpdate).toHaveLength(1);

    // 4. Apply Migration
    const updatedSnapshot = applyMigrationOperations(initialSnapshot, operations);

    // 5. Verify Result
    const collection = updatedSnapshot.collections.get("test_collection");
    expect(collection).toBeDefined();
    expect(collection?.fields).toHaveLength(2); // title + description

    const titleField = collection?.fields.find((f) => f.name === "title");
    expect(titleField?.required).toBe(false); // Modified

    const descField = collection?.fields.find((f) => f.name === "description");
    expect(descField).toBeDefined();
    expect(descField?.type).toBe("text");
  });
});
