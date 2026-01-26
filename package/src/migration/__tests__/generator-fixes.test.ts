
import { describe, it, expect } from "vitest";
import { splitDiffByCollection, generateCollectionMigrationFilename, generateOperationDownMigration } from "../generator";
import type { SchemaDiff, CollectionSchema } from "../types";

describe("Reproduction of Issues", () => {
  it("should generate filenames preserving case", () => {
    const operation = {
      type: "create" as const,
      collection: {
        name: "LabelClips",
        id: "LabelClips_id",
        type: "base" as const,
        fields: [],
      },
      timestamp: "1234567890",
    };

    const filename = generateCollectionMigrationFilename(operation);
    expect(filename).toBe("1234567890_created_LabelClips.js");
  });

  it("should generate correct delete migration with reconstruction in down", () => {
    const collectionToDelete: CollectionSchema = {
      id: "pb_hfau4b1bi8yfufa",
      name: "LabelClips",
      type: "base",
      fields: [
        { name: "title", id: "title_id", type: "text", required: false },
      ],
      indexes: [],
      rules: {},
    };

    const diff: SchemaDiff = {
      collectionsToCreate: [],
      collectionsToDelete: [collectionToDelete],
      collectionsToModify: [],
    };

    const baseTimestamp = "1234567890";
    const operations = splitDiffByCollection(diff, baseTimestamp);

    expect(operations).toHaveLength(1);
    const deleteOp = operations[0];

    // Check if the collection object is preserved
    expect(typeof deleteOp.collection).toBe("object");
    expect((deleteOp.collection as CollectionSchema).name).toBe("LabelClips");

    // Check generated down migration (recreation)
    // We need a map for IDs if we want them to be resolved, but for delete/recreate it uses the schema
    const collectionIdMap = new Map<string, string>();
    const downCode = generateOperationDownMigration(deleteOp, collectionIdMap);

    expect(downCode).toContain('const collection = new Collection({');
    expect(downCode).toContain('"name": "LabelClips"');
    expect(downCode).toContain('return app.save(collection);');
  });
});
