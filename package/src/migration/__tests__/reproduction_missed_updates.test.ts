
import { describe, expect, it } from "vitest";
import { parseMigrationOperations } from "../migration-parser";

describe("reproduction of missed updates", () => {
  it("should parse fields.addAt as an update or addition", () => {
    const migrationContent = `
/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pb_7mbdu2xml9nggre")

  // update field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "json2139012377",
    "maxSize": 0,
    "name": "boundingBox",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // update field
  collection.fields.addAt(6, new Field({
    "cascadeDelete": false,
    "collectionId": "pb_z3gb21s9dht9tr2",
    "hidden": false,
    "id": "relation4031382664",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "ImageRef",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  // down migration
})
    `;

    const result = parseMigrationOperations(migrationContent);

    // We expect to find updates for the collection
    expect(result.collectionsToUpdate.length).toBeGreaterThan(0);
    const update = result.collectionsToUpdate[0];

    // Since findCollectionByNameOrId uses an ID, we might not get the name back unless we mock it or infer it.
    // The parser mocks app.findCollectionByNameOrId to return { id: name, name: name }.
    // So collectionName will be "pb_7mbdu2xml9nggre".
    expect(update.collectionName).toBe("pb_7mbdu2xml9nggre");

    // fields.addAt should probably result in fieldsToAdd, because addAt adds/replaces a field definition.
    // If the parser supports it.
    expect(update.fieldsToAdd.length).toBe(2);

    const boundingBox = update.fieldsToAdd.find(f => f.name === "boundingBox");
    expect(boundingBox).toBeDefined();
    expect(boundingBox?.type).toBe("json");

    const imageRef = update.fieldsToAdd.find(f => f.name === "ImageRef");
    expect(imageRef).toBeDefined();
    expect(imageRef?.type).toBe("relation");
  });
});
