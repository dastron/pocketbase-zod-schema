/**
 * Property-based tests for array syntax in generated migrations
 *
 * Feature: migration-generation-improvements
 * These tests verify that array values are generated with valid JavaScript array syntax
 */

import fc from "fast-check";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { generate } from "../../generator";
import type { CollectionSchema, SchemaDiff } from "../../types";
import { parseJavaScript } from "../helpers/javascript-parser";

describe("Array Syntax Property Tests", () => {
  const testDir = path.join(os.tmpdir(), `pocketbase-array-test-${Date.now()}`);
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
   * Property 17: Valid Array Syntax
   * Feature: migration-generation-improvements, Property 17: Valid Array Syntax
   * Validates: Requirements 4.4
   *
   * For any field with array values, the generated code SHALL use valid JavaScript array literal syntax
   */
  describe("Property 17: Valid Array Syntax", () => {
    it("should generate valid array syntax for empty arrays", () => {
      fc.assert(
        fc.property(fc.constant([]), (values) => {
          const schema: CollectionSchema = {
            name: "test_empty_array",
            type: "base",
            fields: [
              {
                name: "select_field",
                type: "select",
                required: false,
                options: {
                  values: values,
                  maxSelect: 1,
                },
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

          // Should contain empty array syntax
          expect(content).toContain("[]");

          const parseResult = parseJavaScript(content);
          expect(parseResult.success).toBe(true);
        }),
        { numRuns: 10 }
      );
    });

    it("should generate valid array syntax for indexes", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string().filter((s) => s.length > 0 && s.length < 20 && !s.includes("`") && !s.includes("$`")),
            { minLength: 0, maxLength: 3 }
          ),
          (indexes) => {
            const schema: CollectionSchema = {
              name: "test_indexes",
              type: "base",
              fields: [
                {
                  name: "text_field",
                  type: "text",
                  required: false,
                  options: {},
                },
              ],
              indexes: indexes,
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
              console.error("Indexes:", indexes);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
