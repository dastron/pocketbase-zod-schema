/**
 * Property-based tests for JavaScript syntax validity in generated migrations
 *
 * Feature: migration-generation-improvements
 * These tests verify that all generated migration files are syntactically valid JavaScript
 */

import fc from "fast-check";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { generate } from "../../generator";
import type { CollectionSchema, FieldDefinition, SchemaDiff } from "../../types";
import { parseJavaScript } from "../helpers/javascript-parser";

describe("JavaScript Syntax Property Tests", () => {
  const testDir = path.join(os.tmpdir(), `pocketbase-syntax-test-${Date.now()}`);
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
   * Property 15: Valid JavaScript Syntax
   * Feature: migration-generation-improvements, Property 15: Valid JavaScript Syntax
   * Validates: Requirements 4.1
   *
   * For any generated migration file, the content SHALL be parseable as valid JavaScript without syntax errors
   */
  describe("Property 15: Valid JavaScript Syntax", () => {
    it("should generate syntactically valid JavaScript for any collection schema", () => {
      fc.assert(
        fc.property(
          fc.record({
            name: fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/),
            type: fc.constantFrom("base", "auth"),
            fields: fc.array(
              fc.record({
                name: fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/),
                type: fc.constantFrom("text", "number", "bool", "email", "url", "date", "select", "json"),
                required: fc.boolean(),
              }),
              { maxLength: 5 }
            ),
          }),
          (schemaData) => {
            const fields: FieldDefinition[] = schemaData.fields.map((f) => ({
              name: f.name,
              type: f.type as any,
              required: f.required,
              options: f.type === "select" ? { values: ["option1", "option2"], maxSelect: 1 } : {},
            }));

            const schema: CollectionSchema = {
              name: schemaData.name,
              type: schemaData.type as "base" | "auth",
              fields: fields,
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

            // Parse each generated file
            migrationFiles.forEach((file) => {
              const content = fs.readFileSync(file, "utf-8");
              const parseResult = parseJavaScript(content);

              expect(parseResult.success).toBe(true);
              if (!parseResult.success) {
                console.error("Parse error:", parseResult.error);
                console.error("File:", file);
                console.error("Schema:", schema);
              }
            });
          }
        ),
        { numRuns: 30 }
      );
    });

    it("should generate syntactically valid JavaScript for collection modifications", () => {
      fc.assert(
        fc.property(
          fc.record({
            name: fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/),
            newFields: fc.array(
              fc.record({
                name: fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/),
                type: fc.constantFrom("text", "number", "bool"),
              }),
              { minLength: 1, maxLength: 3 }
            ),
          }),
          (modData) => {
            const newFields: FieldDefinition[] = modData.newFields.map((f) => ({
              name: f.name,
              type: f.type as any,
              required: false,
              options: {},
            }));

            const diff: SchemaDiff = {
              collectionsToCreate: [],
              collectionsToModify: [
                {
                  collection: modData.name,
                  fieldsToAdd: newFields,
                  fieldsToModify: [],
                  fieldsToRemove: [],
                  indexesToAdd: [],
                  indexesToRemove: [],
                  rulesToUpdate: [],
                  permissionsToUpdate: [],
                },
              ],
              collectionsToDelete: [],
            };

            const migrationFiles = generate(diff, { migrationDir: testDir });
            generatedFiles.push(...migrationFiles);

            expect(migrationFiles.length).toBeGreaterThan(0);

            migrationFiles.forEach((file) => {
              const content = fs.readFileSync(file, "utf-8");
              const parseResult = parseJavaScript(content);

              expect(parseResult.success).toBe(true);
              if (!parseResult.success) {
                console.error("Parse error:", parseResult.error);
                console.error("File:", file);
              }
            });
          }
        ),
        { numRuns: 30 }
      );
    });

    it("should generate syntactically valid JavaScript for collection deletions", () => {
      fc.assert(
        fc.property(
          fc.array(fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/), { minLength: 1, maxLength: 3 }),
          (collectionNames) => {
            const diff: SchemaDiff = {
              collectionsToCreate: [],
              collectionsToModify: [],
              collectionsToDelete: collectionNames,
            };

            const migrationFiles = generate(diff, { migrationDir: testDir });
            generatedFiles.push(...migrationFiles);

            expect(migrationFiles.length).toBeGreaterThan(0);

            migrationFiles.forEach((file) => {
              const content = fs.readFileSync(file, "utf-8");
              const parseResult = parseJavaScript(content);

              expect(parseResult.success).toBe(true);
              if (!parseResult.success) {
                console.error("Parse error:", parseResult.error);
                console.error("File:", file);
              }
            });
          }
        ),
        { numRuns: 30 }
      );
    });

    it("should generate syntactically valid JavaScript for complex schemas with all field types", () => {
      fc.assert(
        fc.property(fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/), (collectionName) => {
          const fields: FieldDefinition[] = [
            { name: "text_field", type: "text", required: false, options: {} },
            { name: "number_field", type: "number", required: false, options: {} },
            { name: "bool_field", type: "bool", required: false, options: {} },
            { name: "email_field", type: "email", required: false, options: {} },
            { name: "url_field", type: "url", required: false, options: {} },
            { name: "date_field", type: "date", required: false, options: {} },
            {
              name: "select_field",
              type: "select",
              required: false,
              options: { values: ["a", "b", "c"], maxSelect: 1 },
            },
            { name: "json_field", type: "json", required: false, options: {} },
            {
              name: "file_field",
              type: "file",
              required: false,
              options: { maxSelect: 1, maxSize: 5242880, mimeTypes: [], thumbs: [], protected: false },
            },
            {
              name: "relation_field",
              type: "relation",
              required: false,
              options: {},
              relation: { collection: "users", maxSelect: 1, minSelect: 0, cascadeDelete: false },
            },
          ];

          const schema: CollectionSchema = {
            name: collectionName,
            type: "base",
            fields: fields,
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

          migrationFiles.forEach((file) => {
            const content = fs.readFileSync(file, "utf-8");
            const parseResult = parseJavaScript(content);

            expect(parseResult.success).toBe(true);
            if (!parseResult.success) {
              console.error("Parse error:", parseResult.error);
              console.error("File:", file);
            }
          });
        }),
        { numRuns: 30 }
      );
    });

    it("should generate syntactically valid JavaScript for auth collections", () => {
      fc.assert(
        fc.property(fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/), (collectionName) => {
          const schema: CollectionSchema = {
            name: collectionName,
            type: "auth",
            fields: [
              { name: "name", type: "text", required: false, options: {} },
              {
                name: "avatar",
                type: "file",
                required: false,
                options: { maxSelect: 1, maxSize: 5242880, mimeTypes: [], thumbs: [], protected: false },
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

          migrationFiles.forEach((file) => {
            const content = fs.readFileSync(file, "utf-8");
            const parseResult = parseJavaScript(content);

            expect(parseResult.success).toBe(true);
            if (!parseResult.success) {
              console.error("Parse error:", parseResult.error);
              console.error("File:", file);
            }
          });
        }),
        { numRuns: 30 }
      );
    });
  });
});
