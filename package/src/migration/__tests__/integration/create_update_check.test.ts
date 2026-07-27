import { describe, expect, it } from "vitest";
import { executeMigrationSources, requireCollection } from "../helpers/migration-executor";

describe("Integration: Create, Update, Check Status", () => {
  it("should correctly update schema state by applying update migrations", () => {
    // 1. Initial state: one collection with a single required field
    const baseline = [
      {
        id: "test_collection_id",
        name: "test_collection",
        type: "base",
        fields: [{ id: "title_id", name: "title", type: "text", required: true }],
      },
    ];

    // 2. Migration: add a field and relax an existing one
    const updateMigration = `
      migrate((app) => {
        const collection = app.findCollectionByNameOrId("test_collection");

        // Add field
        collection.fields.add(new TextField({
          name: "description",
          required: false
        }));

        // Modify field
        const titleField = collection.fields.getByName("title");
        titleField.required = false;

        return app.save(collection);
      }, (app) => {});
    `;

    // 3. Execute the migration against that state
    const result = executeMigrationSources([updateMigration], { baseline });

    expect(result.created).toHaveLength(0);
    expect(result.deleted).toHaveLength(0);
    expect(result.updated).toHaveLength(1);

    // 4. Verify the resulting state
    const collection = requireCollection(result.snapshot, "test_collection");
    expect(collection.fields).toHaveLength(2); // title + description

    const titleField = collection.fields.find((f) => f.name === "title");
    expect(titleField?.required).toBe(false); // Modified

    const descField = collection.fields.find((f) => f.name === "description");
    expect(descField).toBeDefined();
    expect(descField?.type).toBe("text");
  });
});
