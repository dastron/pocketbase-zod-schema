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
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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

  afterAll(() => {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
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
            pattern: fc.option(
              fc.string().filter((s) => !s.includes("`")),
              { nil: undefined }
            ),
          }),
          (options) => {
            const schema: CollectionSchema = {
              name: "test_object",
              id: "test_object_id",
              type: "base",
              fields: [
                {
                  name: "text_field",
                  id: "text_field_id",
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

            const migrationFiles = generate(diff, { migrationDir: testDir, force: true });
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
              id: "test_number_object_id",
              type: "base",
              fields: [
                {
                  name: "number_field",
                  id: "number_field_id",
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

            const migrationFiles = generate(diff, { migrationDir: testDir, force: true });
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
              id: "test_autodate_object_id",
              type: "base",
              fields: [
                {
                  name: "autodate_field",
                  id: "autodate_field_id",
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

            const migrationFiles = generate(diff, { migrationDir: testDir, force: true });
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
              id: "test_relation_object_id",
              type: "base",
              fields: [
                {
                  name: "relation_field",
                  id: "relation_field_id",
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

            const migrationFiles = generate(diff, { migrationDir: testDir, force: true });
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
  });
});
