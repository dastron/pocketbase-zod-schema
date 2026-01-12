import { describe, expect, it } from "vitest";
import { parseMigrationOperations } from "../migration-parser";

describe("Reproduction: Missed Updates", () => {
  it("should detect field additions and removals in update migrations", () => {
    const migrationContent = `
      migrate((app) => {
        const collection = app.findCollectionByNameOrId("test_collection");

        // Add a new field
        collection.fields.add(new TextField({
          name: "new_field",
          required: false
        }));

        // Remove a field
        collection.fields.removeByName("old_field");

        return app.save(collection);
      }, (app) => {});
    `;

    const result = parseMigrationOperations(migrationContent);

    expect(result.collectionsToCreate).toHaveLength(0);
    expect(result.collectionsToDelete).toHaveLength(0);

    // Check for updates
    expect(result.collectionsToUpdate).toHaveLength(1);
    const update = result.collectionsToUpdate[0];

    expect(update.collectionName).toBe("test_collection");
    expect(update.fieldsToAdd).toHaveLength(1);
    expect(update.fieldsToAdd[0].name).toBe("new_field");
    expect(update.fieldsToRemove).toContain("old_field");
  });

  it("should detect property updates on fields", () => {
    const migrationContent = `
      migrate((app) => {
        const collection = app.findCollectionByNameOrId("test_collection");

        // Update a field
        const field = collection.fields.getByName("existing_field");
        field.required = true;
        field.options.pattern = "\\w+";

        return app.save(collection);
      }, (app) => {});
    `;

    const result = parseMigrationOperations(migrationContent);

    expect(result.collectionsToUpdate).toHaveLength(1);
    const update = result.collectionsToUpdate[0];

    expect(update.fieldsToUpdate).toHaveLength(1);
    const fieldUpdate = update.fieldsToUpdate[0];
    expect(fieldUpdate.fieldName).toBe("existing_field");
    expect(fieldUpdate.changes).toHaveProperty("required", true);
    // Note: my parser stores nested options with 'options.' prefix if they are assigned like field.options.prop = val
    // But here I'm testing assignment `field.options.pattern = ...`
    // Let's see how my regex handles it.
    // My regex: /(\w+)\.([\w\.]+)\s*=\s*([^;]+);/g
    // It captures "field", "options.pattern", "\w+" (quoted)

    expect(fieldUpdate.changes).toHaveProperty("options.pattern");
  });
});
