
import { describe, expect, it } from "vitest";
import { aggregateChanges } from "../diff";
import type { SchemaDefinition, CollectionSchema } from "../types";

describe("Rename Detection Heuristic", () => {
  it("should detect a field rename when one field is removed and one added of same type", () => {
    const currentSchema: SchemaDefinition = {
      collections: new Map([
        [
          "posts",
          {
            name: "posts",
            type: "base",
            fields: [
              { name: "newField", type: "text", required: false },
            ],
          },
        ],
      ]),
    };

    const previousSnapshot = {
      version: "1.0.0",
      timestamp: "2024-01-01",
      collections: new Map<string, CollectionSchema>([
        ["posts", {
            name: "posts",
            type: "base",
            fields: [
                { name: "oldField", type: "text", required: false }
            ]
        }],
      ]),
    };

    const diff = aggregateChanges(currentSchema, previousSnapshot);

    expect(diff.collectionsToModify).toHaveLength(1);
    const mod = diff.collectionsToModify[0];

    // Should be identified as a modification (rename), not add+remove
    expect(mod.fieldsToAdd).toHaveLength(0);
    expect(mod.fieldsToRemove).toHaveLength(0);
    expect(mod.fieldsToModify).toHaveLength(1);

    const fieldMod = mod.fieldsToModify[0];
    expect(fieldMod.fieldName).toBe("oldField"); // Should reference old name
    expect(fieldMod.changes).toContainEqual({
      property: "name",
      oldValue: "oldField",
      newValue: "newField",
    });
  });

  it("should NOT detect rename if types differ", () => {
    const currentSchema: SchemaDefinition = {
      collections: new Map([
        [
          "posts",
          {
            name: "posts",
            type: "base",
            fields: [
              { name: "newField", type: "number", required: false },
            ],
          },
        ],
      ]),
    };

    const previousSnapshot = {
      version: "1.0.0",
      timestamp: "2024-01-01",
      collections: new Map<string, CollectionSchema>([
        ["posts", {
            name: "posts",
            type: "base",
            fields: [
                { name: "oldField", type: "text", required: false }
            ]
        }],
      ]),
    };

    const diff = aggregateChanges(currentSchema, previousSnapshot);

    const mod = diff.collectionsToModify[0];
    // Should be add + remove
    expect(mod.fieldsToAdd).toHaveLength(1);
    expect(mod.fieldsToRemove).toHaveLength(1);
    expect(mod.fieldsToModify).toHaveLength(0);
  });

  it("should detect rename for relation fields if target collection matches", () => {
    const currentSchema: SchemaDefinition = {
      collections: new Map([
        [
          "posts",
          {
            name: "posts",
            type: "base",
            fields: [
              {
                  name: "newRel",
                  type: "relation",
                  required: false,
                  relation: { collection: "users" }
              },
            ],
          },
        ],
      ]),
    };

    const previousSnapshot = {
      version: "1.0.0",
      timestamp: "2024-01-01",
      collections: new Map<string, CollectionSchema>([
        ["posts", {
            name: "posts",
            type: "base",
            fields: [
                {
                    name: "oldRel",
                    type: "relation",
                    required: false,
                    relation: { collection: "users" }
                }
            ]
        }],
      ]),
    };

    const diff = aggregateChanges(currentSchema, previousSnapshot);

    const mod = diff.collectionsToModify[0];
    expect(mod.fieldsToModify).toHaveLength(1);
    expect(mod.fieldsToAdd).toHaveLength(0);
    expect(mod.fieldsToRemove).toHaveLength(0);

    expect(mod.fieldsToModify[0].fieldName).toBe("oldRel");
    expect(mod.fieldsToModify[0].changes).toContainEqual({
        property: "name",
        oldValue: "oldRel",
        newValue: "newRel"
    });
  });

  it("should NOT detect rename for relation fields if target collection differs", () => {
    const currentSchema: SchemaDefinition = {
      collections: new Map([
        [
          "posts",
          {
            name: "posts",
            type: "base",
            fields: [
              {
                  name: "newRel",
                  type: "relation",
                  required: false,
                  relation: { collection: "tags" }
              },
            ],
          },
        ],
      ]),
    };

    const previousSnapshot = {
      version: "1.0.0",
      timestamp: "2024-01-01",
      collections: new Map<string, CollectionSchema>([
        ["posts", {
            name: "posts",
            type: "base",
            fields: [
                {
                    name: "oldRel",
                    type: "relation",
                    required: false,
                    relation: { collection: "users" }
                }
            ]
        }],
      ]),
    };

    const diff = aggregateChanges(currentSchema, previousSnapshot);

    const mod = diff.collectionsToModify[0];
    // Should be add + remove because target differs
    expect(mod.fieldsToAdd).toHaveLength(1);
    expect(mod.fieldsToRemove).toHaveLength(1);
    expect(mod.fieldsToModify).toHaveLength(0);
  });

  it("should NOT detect rename if multiple fields of same type are added/removed (ambiguous)", () => {
     const currentSchema: SchemaDefinition = {
      collections: new Map([
        [
          "posts",
          {
            name: "posts",
            type: "base",
            fields: [
              { name: "newField1", type: "text", required: false },
              { name: "newField2", type: "text", required: false },
            ],
          },
        ],
      ]),
    };

    const previousSnapshot = {
      version: "1.0.0",
      timestamp: "2024-01-01",
      collections: new Map<string, CollectionSchema>([
        ["posts", {
            name: "posts",
            type: "base",
            fields: [
                { name: "oldField1", type: "text", required: false },
                { name: "oldField2", type: "text", required: false }
            ]
        }],
      ]),
    };

    const diff = aggregateChanges(currentSchema, previousSnapshot);
    const mod = diff.collectionsToModify[0];

    // Ambiguous -> Fallback to add/remove
    expect(mod.fieldsToAdd).toHaveLength(2);
    expect(mod.fieldsToRemove).toHaveLength(2);
    expect(mod.fieldsToModify).toHaveLength(0);
  });
});
