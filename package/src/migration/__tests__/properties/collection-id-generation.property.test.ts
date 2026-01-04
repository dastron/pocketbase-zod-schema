/**
 * Property-based tests for collection ID generation
 *
 * Feature: migration-generation-improvements
 * These tests verify collection ID format, uniqueness, and special cases
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CollectionIdRegistry, generateCollectionId } from "../../utils/collection-id-generator";

describe("Collection ID Generation Property Tests", () => {
  /**
   * Property 1: Collection ID Format Validity
   * Feature: migration-generation-improvements, Property 1: Collection ID Format Validity
   * Validates: Requirements 1.1
   *
   * For any generated collection ID, it SHALL match the pattern pb_[a-z0-9]{15}
   */
  describe("Property 1: Collection ID Format Validity", () => {
    it("should generate IDs matching the pattern pb_[a-z0-9]{15}", () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const id = generateCollectionId();

          // Should start with "pb_"
          expect(id).toMatch(/^pb_/);

          // Should be exactly 18 characters (pb_ + 15 chars)
          expect(id).toHaveLength(18);

          // Should match the full pattern
          expect(id).toMatch(/^pb_[a-z0-9]{15}$/);

          // Should only contain lowercase alphanumeric after prefix
          const suffix = id.slice(3);
          expect(suffix).toMatch(/^[a-z0-9]+$/);
          expect(suffix).toHaveLength(15);
        }),
        { numRuns: 100 }
      );
    });

    it("should never generate IDs with uppercase letters", () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const id = generateCollectionId();

          // Should not contain any uppercase letters
          expect(id).not.toMatch(/[A-Z]/);
        }),
        { numRuns: 100 }
      );
    });

    it("should never generate IDs with special characters", () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const id = generateCollectionId();

          // Should not contain special characters (except underscore in prefix)
          expect(id).toMatch(/^pb_[a-z0-9]+$/);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Collection ID Uniqueness
   * Feature: migration-generation-improvements, Property 2: Collection ID Uniqueness
   * Validates: Requirements 1.5
   *
   * For any set of collections in a single migration batch, all generated collection IDs SHALL be unique
   */
  describe("Property 2: Collection ID Uniqueness", () => {
    it("should generate unique IDs across multiple generations", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (count) => {
          const registry = new CollectionIdRegistry();
          const generatedIds = new Set<string>();

          // Generate multiple IDs
          for (let i = 0; i < count; i++) {
            const id = registry.generate();
            generatedIds.add(id);
          }

          // All IDs should be unique
          expect(generatedIds.size).toBe(count);
        }),
        { numRuns: 100 }
      );
    });

    it("should track and prevent duplicate IDs in registry", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 50 }), (count) => {
          const registry = new CollectionIdRegistry();
          const ids: string[] = [];

          // Generate IDs and track them
          for (let i = 0; i < count; i++) {
            const id = registry.generate();
            ids.push(id);

            // Registry should have this ID
            expect(registry.has(id)).toBe(true);
          }

          // All IDs should be unique
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(count);
        }),
        { numRuns: 100 }
      );
    });

    it("should handle manual registration and prevent duplicates", () => {
      fc.assert(
        fc.property(fc.array(fc.constant(null), { minLength: 1, maxLength: 20 }), (items) => {
          const registry = new CollectionIdRegistry();
          const manualIds: string[] = [];

          // Manually register some IDs
          for (let i = 0; i < items.length; i++) {
            const id = generateCollectionId();
            registry.register(id);
            manualIds.push(id);
          }

          // Generate new IDs - they should not collide with manual ones
          const generatedIds: string[] = [];
          for (let i = 0; i < items.length; i++) {
            const id = registry.generate();
            generatedIds.push(id);
          }

          // Check no overlap between manual and generated
          const manualSet = new Set(manualIds);
          const generatedSet = new Set(generatedIds);

          for (const id of generatedIds) {
            expect(manualSet.has(id)).toBe(false);
          }

          // All generated IDs should be unique
          expect(generatedSet.size).toBe(generatedIds.length);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 5: Users Collection Constant
   * Feature: migration-generation-improvements, Property 5: Users Collection Constant
   * Validates: Requirements 1.4
   *
   * For any relation field referencing the users collection, the generated code SHALL use the constant _pb_users_auth_
   */
  describe("Property 5: Users Collection Constant", () => {
    it("should return constant _pb_users_auth_ for users collection (case-insensitive)", () => {
      fc.assert(
        fc.property(fc.constantFrom("users", "Users", "USERS", "UsErS"), (collectionName) => {
          const registry = new CollectionIdRegistry();
          const id = registry.generate(collectionName);

          // Should always return the constant for users collection
          expect(id).toBe("_pb_users_auth_");

          // Should be registered in the registry
          expect(registry.has("_pb_users_auth_")).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should not return users constant for non-users collections", () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/).filter((name) => name.toLowerCase() !== "users"),
          (collectionName) => {
            const registry = new CollectionIdRegistry();
            const id = registry.generate(collectionName);

            // Should NOT return the users constant
            expect(id).not.toBe("_pb_users_auth_");

            // Should match the standard pattern
            expect(id).toMatch(/^pb_[a-z0-9]{15}$/);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should consistently return same constant for users across multiple calls", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10 }), (count) => {
          const registry = new CollectionIdRegistry();
          const ids: string[] = [];

          // Generate users ID multiple times
          for (let i = 0; i < count; i++) {
            const id = registry.generate("users");
            ids.push(id);
          }

          // All should be the same constant
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(1);
          expect(ids[0]).toBe("_pb_users_auth_");
        }),
        { numRuns: 100 }
      );
    });
  });
});
