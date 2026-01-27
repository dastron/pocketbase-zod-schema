import { describe, it, expect } from "vitest";
import { filterDiff } from "../diff/filter";
import type { SchemaDiff, FieldModification } from "../types";

// Mock helper
function createDiff(
  collectionsToCreate: any[] = [],
  collectionsToDelete: any[] = [],
  collectionsToModify: any[] = []
): SchemaDiff {
  return {
    collectionsToCreate,
    collectionsToDelete,
    collectionsToModify,
    existingCollectionIds: new Map(),
  };
}

describe("filterDiff", () => {
  describe("filtering by pattern", () => {
    it("should filter collectionsToCreate", () => {
      const diff = createDiff(
        [{ name: "User" }, { name: "Post" }],
        [],
        []
      );
      const filtered = filterDiff(diff, { patterns: ["User"] });
      expect(filtered.collectionsToCreate).toHaveLength(1);
      expect(filtered.collectionsToCreate[0].name).toBe("User");
    });

    it("should filter collectionsToDelete", () => {
      const diff = createDiff(
        [],
        [{ name: "User" }, { name: "Post" }],
        []
      );
      const filtered = filterDiff(diff, { patterns: ["User"] });
      expect(filtered.collectionsToDelete).toHaveLength(1);
      expect(filtered.collectionsToDelete[0].name).toBe("User");
    });

    it("should filter collectionsToModify (collection name match)", () => {
      const diff = createDiff(
        [],
        [],
        [
            {
                collection: "User",
                fieldsToAdd: [{ name: "name" }],
                fieldsToRemove: [],
                fieldsToModify: [],
                indexesToAdd: ["idx_1"],
                indexesToRemove: [],
                rulesToUpdate: [],
                permissionsToUpdate: []
            },
            {
                collection: "Post",
                fieldsToAdd: [{ name: "title" }],
                fieldsToRemove: [],
                fieldsToModify: [],
                indexesToAdd: [],
                indexesToRemove: [],
                rulesToUpdate: [],
                permissionsToUpdate: []
            }
        ]
      );
      const filtered = filterDiff(diff, { patterns: ["User"] });
      expect(filtered.collectionsToModify).toHaveLength(1);
      expect(filtered.collectionsToModify[0].collection).toBe("User");
      expect(filtered.collectionsToModify[0].fieldsToAdd).toHaveLength(1);
      expect(filtered.collectionsToModify[0].indexesToAdd).toHaveLength(1); // Kept because collection matches
    });

    it("should filter collectionsToModify (field match)", () => {
       const diff = createDiff(
        [],
        [],
        [
            {
                collection: "User",
                fieldsToAdd: [{ name: "name" }, { name: "age" }],
                fieldsToRemove: [],
                fieldsToModify: [],
                indexesToAdd: ["idx_1"], // Should be filtered out if collection doesn't match
                indexesToRemove: [],
                rulesToUpdate: [],
                permissionsToUpdate: []
            }
        ]
      );
      // Filter only User.name
      const filtered = filterDiff(diff, { patterns: ["User.name"] });

      expect(filtered.collectionsToModify).toHaveLength(1);
      expect(filtered.collectionsToModify[0].collection).toBe("User");
      expect(filtered.collectionsToModify[0].fieldsToAdd).toHaveLength(1);
      expect(filtered.collectionsToModify[0].fieldsToAdd[0].name).toBe("name");

      // Collection level stuff should be gone because "User.name" doesn't match "User"
      expect(filtered.collectionsToModify[0].indexesToAdd).toHaveLength(0);
    });

    it("should remove collection modification if no fields match", () => {
       const diff = createDiff(
        [],
        [],
        [
            {
                collection: "User",
                fieldsToAdd: [{ name: "age" }],
                fieldsToRemove: [],
                fieldsToModify: [],
                indexesToAdd: [],
                indexesToRemove: [],
                rulesToUpdate: [],
                permissionsToUpdate: []
            }
        ]
      );
      const filtered = filterDiff(diff, { patterns: ["User.name"] });
      expect(filtered.collectionsToModify).toHaveLength(0);
    });
  });

  describe("skipDestructive", () => {
    it("should remove collectionsToDelete", () => {
        const diff = createDiff(
          [],
          [{ name: "User" }],
          []
        );
        const filtered = filterDiff(diff, { skipDestructive: true });
        expect(filtered.collectionsToDelete).toHaveLength(0);
    });

    it("should remove fieldsToRemove", () => {
        const diff = createDiff(
          [],
          [],
          [
              {
                  collection: "User",
                  fieldsToAdd: [],
                  fieldsToRemove: [{ name: "old" }],
                  fieldsToModify: [],
                  indexesToAdd: [],
                  indexesToRemove: [],
                  rulesToUpdate: [],
                  permissionsToUpdate: []
              }
          ]
        );
        const filtered = filterDiff(diff, { skipDestructive: true });
        expect(filtered.collectionsToModify).toHaveLength(0); // collection mod removed because empty
    });

    it("should remove destructive field modifications (type change)", () => {
        const diff = createDiff(
          [],
          [],
          [
              {
                  collection: "User",
                  fieldsToAdd: [],
                  fieldsToRemove: [],
                  fieldsToModify: [
                      {
                          fieldName: "name",
                          changes: [{ property: "type", oldValue: "text", newValue: "number" }]
                      } as unknown as FieldModification,
                      {
                          fieldName: "bio",
                          changes: [{ property: "max", oldValue: 10, newValue: 20 }]
                      } as unknown as FieldModification
                  ],
                  indexesToAdd: [],
                  indexesToRemove: [],
                  rulesToUpdate: [],
                  permissionsToUpdate: []
              }
          ]
        );
        const filtered = filterDiff(diff, { skipDestructive: true });
        expect(filtered.collectionsToModify).toHaveLength(1);
        expect(filtered.collectionsToModify[0].fieldsToModify).toHaveLength(1);
        expect(filtered.collectionsToModify[0].fieldsToModify[0].fieldName).toBe("bio");
    });
  });
});
