import { describe, expect, it } from "vitest";
import { executeMigrationSources, requireCollection } from "./helpers/migration-executor";

/**
 * PocketBase writes its own field updates as `fields.addAt(index, new Field({...}))`
 * against a collection looked up by id. The regression this file guards is that
 * those land as real fields on the collection, and that addressing the
 * collection by id works — neither is visible from the file text alone.
 */
describe("reproduction of missed updates", () => {
  it("should apply fields.addAt to a collection addressed by id", () => {
    const baseline = [
      {
        id: "pb_7mbdu2xml9nggre",
        name: "Assets",
        type: "base",
        fields: [
          { id: "text1", name: "one", type: "text" },
          { id: "text2", name: "two", type: "text" },
          { id: "text3", name: "three", type: "text" },
          { id: "text4", name: "four", type: "text" },
          { id: "text5", name: "five", type: "text" },
        ],
      },
    ];

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

    const result = executeMigrationSources([migrationContent], { baseline });

    expect(result.created).toHaveLength(0);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0].name).toBe("Assets");

    const collection = requireCollection(result.snapshot, "Assets");
    expect(collection.fields).toHaveLength(7);

    const boundingBox = collection.fields.find((f) => f.name === "boundingBox");
    expect(boundingBox).toBeDefined();
    expect(boundingBox?.type).toBe("json");

    const imageRef = collection.fields.find((f) => f.name === "ImageRef");
    expect(imageRef).toBeDefined();
    expect(imageRef?.type).toBe("relation");

    // addAt honours position: the new fields land at indexes 5 and 6
    expect(collection.fields.map((f) => f.name).slice(5)).toEqual(["boundingBox", "ImageRef"]);
  });
});
