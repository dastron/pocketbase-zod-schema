/**
 * Property-based tests for object syntax in generated migrations
 *
 * Feature: migration-generation-improvements
 * These tests verify that object values are generated with valid JavaScript object literal syntax
 */

import fc from "fast-check";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { generate } from "../../generator";
import type { CollectionSchema, SchemaDiff } from "../../types";
import { parseJavaScript } from "../helpers/javascript-parser";

describe("Object Syntax Property Tests", () => {
  const testDir = path.join(os.tmpdir(), `pocketbase-object-test-${Date.now()}`);
  let generatedFiles: string[] = [];

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    generatedFiles.forEach((file) => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    });
    generatedFiles = [];
  });

  /**
   * Property 18: Valid Object Syntax
   * Feature: migration-generation-improvements, Property 18: Valid Object Syntax
   * Validates: Requirements 4.5
   *
   * For any field with object values, the generated code SHALL use valid JavaScript object literal syntax
   */
  describe("Property 18: Valid Object Syntax", () => {
    it("should generate valid object syntax for field options", () => {
      fc.assert(
        fc.property(
          fc.record({
            min: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
            max: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
            pattern: fc.option(fc.string(), { nil: undefined }),
          }),
          (options) => {
            const schema: CollectionSchema = {
              name: "test_object",
              type: "base",
              fields: [
                {
                  name: "text_field",
                  type: "text",
                  required: false,
                  options: options,
                },
              ],
              indexes: [],
              permissions: {
                listRule: "",
                viewRule: "",
                createRule: "",
                updateRule: "",
                deleteRule: "",
              },
            };

            const diff: SchemaDiff = {
              collectionsToCreate: [schema],
              collectionsToModify: [],
              collectionsToDelete: [],
            };

            const migrationFiles = generate(diff, { migrationDir: testDir });
            generatedFiles.push(...migrationFiles);

            expect(migrationFiles.length).toBeGreaterThan(0);

            const content = fs.readFileSync(migrationFiles[0], "utf-8");
            const parseResult = parseJavaScript(content);

            expect(parseResult.success).toBe(true);
            if (!parseResult.success) {
              console.error("Parse error:", parseResult.error);
              console.error("Options:", options);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it("should generate valid object syntax for file field options", () => {
      fc.assert(
        fc.property(
          fc.record({
            maxSelect: fc.integer({ min: 1, max: 10 }),
            maxSize: fc.integer({ min: 0, max: 10485760 }),
            mimeTypes: fc.array(fc.string(), { maxLength: 3 }),
            thumbs: fc.array(fc.string(), { maxLength: 3 }),
            protected: fc.boolean(),
          }),
          (options) => {
            const schema: CollectionSchema = {
              name: "test_file_object",
              type: "base",
              fields: [
                {
                  name: "file_field",
                  type: "file",
                  required: false,
                  options: options,
                },
              ],
              indexes: [],
              permissions: {
                listRule: "",
                viewRule: "",
                createRule: "",
                updateRule: "",
                deleteRule: "",
              },
            };

            const diff: SchemaDiff = {
              collectionsToCreate: [schema],
              collectionsToModify: [],
              collectionsToDelete: [],
            };

            const migrationFiles = generate(diff, { migrationDir: testDir });
            generatedFiles.push(...migrationFiles);

            expect(migrationFiles.length).toBeGreaterThan(0);

            const content = fs.readFileSync(migrationFiles[0], "utf-8");
            const parseResult = parseJavaScript(content);

            expect(parseResult.success).toBe(true);
            if (!parseResult.success) {
              console.error("Parse error:", parseResult.error);
              console.error("Options:", options);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it("should generate valid object syntax for number field options", () => {
      fc.assert(
        fc.property(
          fc.record({
            min: fc.option(fc.float(), { nil: undefined }),
            max: fc.option(fc.float(), { nil: undefined }),
            noDecimal: fc.option(fc.boolean(), { nil: undefined }),
          }),
          (options) => {
            const schema: CollectionSchema = {
              name: "test_number_object",
              type: "base",
              fields: [
                {
                  name: "number_field",
                  type: "number",
                  required: false,
                  options: options,
                },
              ],
              indexes: [],
              permissions: {
                listRule: "",
                viewRule: "",
                createRule: "",
                updateRule: "",
                deleteRule: "",
              },
            };

            const diff: SchemaDiff = {
              collectionsToCreate: [schema],
              collectionsToModify: [],
              collectionsToDelete: [],
            };

            const migrationFiles = generate(diff, { migrationDir: testDir });
            generatedFiles.push(...migrationFiles);

            expect(migrationFiles.length).toBeGreaterThan(0);

            const content = fs.readFileSync(migrationFiles[0], "utf-8");
            const parseResult = parseJavaScript(content);

            expect(parseResult.success).toBe(true);
            if (!parseResult.success) {
              console.error("Parse error:", parseResult.error);
              console.error("Options:", options);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it("should generate valid object syntax for autodate field options", () => {
      fc.assert(
        fc.property(
          fc.record({
            onCreate: fc.boolean(),
            onUpdate: fc.boolean(),
          }),
          (options) => {
            const schema: CollectionSchema = {
              name: "test_autodate_object",
              type: "base",
              fields: [
                {
                  name: "autodate_field",
                  type: "autodate",
                  required: false,
                  options: options,
                },
              ],
              indexes: [],
              permissions: {
                listRule: "",
                viewRule: "",
                createRule: "",
                updateRule: "",
                deleteRule: "",
              },
            };

            const diff: SchemaDiff = {
              collectionsToCreate: [schema],
              collectionsToModify: [],
              collectionsToDelete: [],
            };

            const migrationFiles = generate(diff, { migrationDir: testDir });
            generatedFiles.push(...migrationFiles);

            expect(migrationFiles.length).toBeGreaterThan(0);

            const content = fs.readFileSync(migrationFiles[0], "utf-8");
            const parseResult = parseJavaScript(content);

            expect(parseResult.success).toBe(true);
            if (!parseResult.success) {
              console.error("Parse error:", parseResult.error);
              console.error("Options:", options);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it("should generate valid object syntax for relation field properties", () => {
      fc.assert(
        fc.property(
          fc.record({
            collection: fc.constantFrom("users", "test_collection"),
            maxSelect: fc.integer({ min: 1, max: 10 }),
            minSelect: fc.option(fc.integer({ min: 0, max: 5 }), { nil: undefined }),
            cascadeDelete: fc.boolean(),
          }),
          (relation) => {
            const schema: CollectionSchema = {
              name: "test_relation_object",
              type: "base",
              fields: [
                {
                  name: "relation_field",
                  type: "relation",
                  required: false,
                  options: {},
                  relation: relation,
                },
              ],
              indexes: [],
              permissions: {
                listRule: "",
                viewRule: "",
                createRule: "",
                updateRule: "",
                deleteRule: "",
              },
            };

            const diff: SchemaDiff = {
              collectionsToCreate: [schema],
              collectionsToModify: [],
              collectionsToDelete: [],
            };

            const migrationFiles = generate(diff, { migrationDir: testDir });
            generatedFiles.push(...migrationFiles);

            expect(migrationFiles.length).toBeGreaterThan(0);

            const content = fs.readFileSync(migrationFiles[0], "utf-8");
            const parseResult = parseJavaScript(content);

            expect(parseResult.success).toBe(true);
            if (!parseResult.success) {
              console.error("Parse error:", parseResult.error);
              console.error("Relation:", relation);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it("should generate valid object syntax for permissions", () => {
      fc.assert(
        fc.property(
          fc.record({
            listRule: fc.option(fc.oneof(fc.constant(null), fc.constant(""), fc.string()), { nil: undefined }),
            viewRule: fc.option(fc.oneof(fc.constant(null), fc.constant(""), fc.string()), { nil: undefined }),
            createRule: fc.option(fc.oneof(fc.constant(null), fc.constant(""), fc.string()), { nil: undefined }),
            updateRule: fc.option(fc.oneof(fc.constant(null), fc.constant(""), fc.string()), { nil: undefined }),
            deleteRule: fc.option(fc.oneof(fc.constant(null), fc.constant(""), fc.string()), { nil: undefined }),
          }),
          (permissions) => {
            const schema: CollectionSchema = {
              name: "test_permissions_object",
              type: "base",
              fields: [],
              indexes: [],
              permissions: permissions,
            };

            const diff: SchemaDiff = {
              collectionsToCreate: [schema],
              collectionsToModify: [],
              collectionsToDelete: [],
            };

            const migrationFiles = generate(diff, { migrationDir: testDir });
            generatedFiles.push(...migrationFiles);

            expect(migrationFiles.length).toBeGreaterThan(0);

            const content = fs.readFileSync(migrationFiles[0], "utf-8");
            const parseResult = parseJavaScript(content);

            expect(parseResult.success).toBe(true);
            if (!parseResult.success) {
              console.error("Parse error:", parseResult.error);
              console.error("Permissions:", permissions);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
