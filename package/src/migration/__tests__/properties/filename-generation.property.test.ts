/**
 * Property-based tests for migration filename generation
 *
 * Feature: migration-generation-improvements
 * These tests verify filename format and collection name inclusion
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generateCollectionMigrationFilename } from "../../generator";
import type { CollectionOperation, CollectionSchema } from "../../types";

describe("Filename Generation Property Tests", () => {
  /**
   * Property 10: Filename Format Compliance
   * Feature: migration-generation-improvements, Property 10: Filename Format Compliance
   * Validates: Requirements 2.6
   *
   * For any generated migration filename, it SHALL match the pattern {timestamp}_{operation}_{collection_name}.js
   * where operation is one of: created, updated, deleted
   */
  describe("Property 10: Filename Format Compliance", () => {
    it("should generate filenames matching the pattern {timestamp}_{operation}_{collection_name}.js", () => {
      fc.assert(
        fc.property(
          fc.record({
            timestamp: fc.integer({ min: 1000000000, max: 9999999999 }).map(String),
            type: fc.constantFrom("create" as const, "modify" as const, "delete" as const),
            collectionName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/),
          }),
          ({ timestamp, type, collectionName }) => {
            const collection: CollectionSchema = {
              name: collectionName,
              type: "base",
              fields: [],
            };

            const operation: CollectionOperation = {
              type,
              collection: type === "delete" ? collectionName : collection,
              timestamp,
            };

            const filename = generateCollectionMigrationFilename(operation);

            // Should end with .js
            expect(filename).toMatch(/\.js$/);

            // Should match the general pattern: {timestamp}_{operation}_{name}.js
            expect(filename).toMatch(/^\d+_(created|updated|deleted)_[a-z0-9_]+\.js$/);

            // Should start with the timestamp
            expect(filename).toMatch(new RegExp(`^${timestamp}_`));

            // Should contain the operation type (mapped)
            const expectedOperation = type === "create" ? "created" : type === "modify" ? "updated" : "deleted";
            expect(filename).toContain(`_${expectedOperation}_`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should map operation types correctly (create->created, modify->updated, delete->deleted)", () => {
      fc.assert(
        fc.property(
          fc.record({
            timestamp: fc.integer({ min: 1000000000, max: 9999999999 }).map(String),
            collectionName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/),
          }),
          ({ timestamp, collectionName }) => {
            const collection: CollectionSchema = {
              name: collectionName,
              type: "base",
              fields: [],
            };

            // Test create -> created
            const createOp: CollectionOperation = {
              type: "create",
              collection,
              timestamp,
            };
            const createFilename = generateCollectionMigrationFilename(createOp);
            expect(createFilename).toContain("_created_");

            // Test modify -> updated
            const modifyOp: CollectionOperation = {
              type: "modify",
              collection: collectionName,
              timestamp,
            };
            const modifyFilename = generateCollectionMigrationFilename(modifyOp);
            expect(modifyFilename).toContain("_updated_");

            // Test delete -> deleted
            const deleteOp: CollectionOperation = {
              type: "delete",
              collection: collectionName,
              timestamp,
            };
            const deleteFilename = generateCollectionMigrationFilename(deleteOp);
            expect(deleteFilename).toContain("_deleted_");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should sanitize collection names for filesystem compatibility", () => {
      fc.assert(
        fc.property(
          fc.record({
            timestamp: fc.integer({ min: 1000000000, max: 9999999999 }).map(String),
            collectionName: fc.string({ minLength: 1, maxLength: 30 }),
          }),
          ({ timestamp, collectionName }) => {
            const collection: CollectionSchema = {
              name: collectionName,
              type: "base",
              fields: [],
            };

            const operation: CollectionOperation = {
              type: "create",
              collection,
              timestamp,
            };

            const filename = generateCollectionMigrationFilename(operation);

            // Should only contain safe filesystem characters
            // Pattern: timestamp_operation_sanitized_name.js
            expect(filename).toMatch(/^[0-9]+_[a-z]+_[a-z0-9_]+\.js$/);

            // Should not contain spaces or special characters (except underscore and dot for extension)
            // Note: We're checking the filename doesn't have problematic characters
            const problematicChars = /[ !@#$%^&*()\-+=\[\]{}|\\:;"'<>,?/]/;
            // Remove the .js extension before checking
            const filenameWithoutExt = filename.slice(0, -3);
            expect(filenameWithoutExt).not.toMatch(problematicChars);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 9: Filename Contains Collection Name
   * Feature: migration-generation-improvements, Property 9: Filename Contains Collection Name
   * Validates: Requirements 2.5
   *
   * For any generated migration file, the filename SHALL contain the collection name being operated on
   */
  describe("Property 9: Filename Contains Collection Name", () => {
    it("should include the collection name in the filename", () => {
      fc.assert(
        fc.property(
          fc.record({
            timestamp: fc.integer({ min: 1000000000, max: 9999999999 }).map(String),
            type: fc.constantFrom("create" as const, "modify" as const, "delete" as const),
            collectionName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/),
          }),
          ({ timestamp, type, collectionName }) => {
            const collection: CollectionSchema = {
              name: collectionName,
              type: "base",
              fields: [],
            };

            const operation: CollectionOperation = {
              type,
              collection: type === "delete" ? collectionName : collection,
              timestamp,
            };

            const filename = generateCollectionMigrationFilename(operation);

            // The filename should contain a sanitized version of the collection name
            // Sanitization converts to lowercase and replaces special chars with underscores
            const sanitizedName = collectionName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
            expect(filename).toContain(sanitizedName);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should preserve alphanumeric characters and underscores from collection name", () => {
      fc.assert(
        fc.property(
          fc.record({
            timestamp: fc.integer({ min: 1000000000, max: 9999999999 }).map(String),
            type: fc.constantFrom("create" as const, "modify" as const, "delete" as const),
            // Collection names with only safe characters
            collectionName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/),
          }),
          ({ timestamp, type, collectionName }) => {
            const collection: CollectionSchema = {
              name: collectionName,
              type: "base",
              fields: [],
            };

            const operation: CollectionOperation = {
              type,
              collection: type === "delete" ? collectionName : collection,
              timestamp,
            };

            const filename = generateCollectionMigrationFilename(operation);

            // For safe collection names, the lowercase version should appear in filename
            const lowercaseName = collectionName.toLowerCase();
            expect(filename).toContain(lowercaseName);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle collection names with special characters by sanitizing", () => {
      fc.assert(
        fc.property(
          fc.record({
            timestamp: fc.integer({ min: 1000000000, max: 9999999999 }).map(String),
            type: fc.constantFrom("create" as const, "modify" as const, "delete" as const),
          }),
          ({ timestamp, type }) => {
            // Test with various special characters
            const testCases = [
              { name: "My Collection", expected: "my_collection" },
              { name: "user-profile", expected: "user_profile" },
              { name: "data.table", expected: "data_table" },
              { name: "test@collection", expected: "test_collection" },
              { name: "collection#1", expected: "collection_1" },
            ];

            for (const { name: collectionName, expected } of testCases) {
              const collection: CollectionSchema = {
                name: collectionName,
                type: "base",
                fields: [],
              };

              const operation: CollectionOperation = {
                type,
                collection: type === "delete" ? collectionName : collection,
                timestamp,
              };

              const filename = generateCollectionMigrationFilename(operation);

              // Should contain the sanitized name
              expect(filename).toContain(expected);

              // Should not contain the original special characters in the collection name part
              // Extract the collection name part (after the second underscore, before .js)
              const parts = filename.split("_");
              const collectionPart = parts.slice(2).join("_").replace(".js", "");

              // Collection part should not have spaces, hyphens, dots, @, or #
              expect(collectionPart).not.toMatch(/[ \-.@#]/);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
