/**
 * Integration tests for collection creation scenarios
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compare } from "../../diff";
import { generate } from "../../generator";
import type { SchemaDefinition } from "../../types";
import {
  CreateCollectionBlankSchema,
  CreateCollectionWithColumnsSchema,
  CreateCollectionWithRestrictedApiRulesSchema,
  CreateCollectionWithUniqueIndexSchema,
  CreateCollectionWithUnrestrictedApiRulesSchema,
} from "../fixtures/schemas";

function createSchemaDefinition(collectionSchema: any): SchemaDefinition {
  return {
    collections: new Map([[collectionSchema.name, collectionSchema]]),
  };
}

describe("Collection Creation Integration Tests", () => {
  const tempDir = path.join(os.tmpdir(), "migration-test-" + Date.now());

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("5.1 Collection with all field types", () => {
    it("should generate migration for collection with multiple field types", () => {
      const currentSchema = createSchemaDefinition(CreateCollectionWithColumnsSchema);
      const diff = compare(currentSchema, null);

      expect(diff.collectionsToCreate).toHaveLength(1);
      expect(diff.collectionsToCreate[0].name).toBe(CreateCollectionWithColumnsSchema.name);

      const generatedPaths = generate(diff, tempDir);
      expect(generatedPaths).toHaveLength(1);
      const generatedPath = generatedPaths[0];
      expect(fs.existsSync(generatedPath)).toBe(true);

      const content = fs.readFileSync(generatedPath, "utf-8");
      expect(content).toContain("migrate(");
      expect(content).toContain("new Collection(");
      expect(content).toContain('name: "' + CreateCollectionWithColumnsSchema.name + '"');
      expect(content).toContain('type: "base"');
      expect(content).toContain("app.save(");

      for (const field of CreateCollectionWithColumnsSchema.fields) {
        expect(content).toContain('name: "' + field.name + '"');
      }
    });
  });

  describe("5.3 Blank collection", () => {
    it("should generate migration for blank collection with no custom fields", () => {
      const currentSchema = createSchemaDefinition(CreateCollectionBlankSchema);
      const diff = compare(currentSchema, null);

      expect(diff.collectionsToCreate).toHaveLength(1);
      expect(diff.collectionsToCreate[0].name).toBe(CreateCollectionBlankSchema.name);

      const generatedPaths = generate(diff, tempDir);
      expect(generatedPaths).toHaveLength(1);
      const generatedPath = generatedPaths[0];
      expect(fs.existsSync(generatedPath)).toBe(true);

      const content = fs.readFileSync(generatedPath, "utf-8");
      expect(content).toContain("migrate(");
      expect(content).toContain("new Collection(");
      expect(content).toContain('name: "' + CreateCollectionBlankSchema.name + '"');
      expect(content).toContain('type: "base"');

      // Only 'id' system field should be included unless explicitly provided
      // 'created' and 'updated' are system fields that PocketBase manages automatically
      expect(content).toContain('name: "id"');
      expect(content).not.toContain('name: "created"');
      expect(content).not.toContain('name: "updated"');
    });
  });

  describe("5.4 Collection with unique index", () => {
    it("should generate migration with CREATE UNIQUE INDEX statement", () => {
      const currentSchema = createSchemaDefinition(CreateCollectionWithUniqueIndexSchema);
      const diff = compare(currentSchema, null);

      expect(diff.collectionsToCreate).toHaveLength(1);
      expect(diff.collectionsToCreate[0].name).toBe(CreateCollectionWithUniqueIndexSchema.name);

      const generatedPaths = generate(diff, tempDir);
      expect(generatedPaths).toHaveLength(1);
      const generatedPath = generatedPaths[0];
      expect(fs.existsSync(generatedPath)).toBe(true);

      const content = fs.readFileSync(generatedPath, "utf-8");
      expect(content).toContain("migrate(");
      expect(content).toContain("new Collection(");
      expect(content).toContain("CREATE UNIQUE INDEX");
      expect(content).toContain("indexes:");
    });
  });

  describe("5.6 Collection with unrestricted API rules", () => {
    it("should generate migration with empty string rule values", () => {
      const currentSchema = createSchemaDefinition(CreateCollectionWithUnrestrictedApiRulesSchema);
      const diff = compare(currentSchema, null);

      expect(diff.collectionsToCreate).toHaveLength(1);
      expect(diff.collectionsToCreate[0].name).toBe(CreateCollectionWithUnrestrictedApiRulesSchema.name);

      const generatedPaths = generate(diff, tempDir);
      expect(generatedPaths).toHaveLength(1);
      const generatedPath = generatedPaths[0];
      expect(fs.existsSync(generatedPath)).toBe(true);

      const content = fs.readFileSync(generatedPath, "utf-8");
      expect(content).toContain("migrate(");
      expect(content).toContain("new Collection(");
      expect(content).toContain('listRule: ""');
      expect(content).toContain('viewRule: ""');
      expect(content).toContain('createRule: ""');
      expect(content).toContain('updateRule: ""');
      expect(content).toContain('deleteRule: ""');
    });
  });

  describe("5.8 Collection with restricted API rules", () => {
    it("should generate migration with filter expressions preserved exactly", () => {
      const currentSchema = createSchemaDefinition(CreateCollectionWithRestrictedApiRulesSchema);
      const diff = compare(currentSchema, null);

      expect(diff.collectionsToCreate).toHaveLength(1);
      expect(diff.collectionsToCreate[0].name).toBe(CreateCollectionWithRestrictedApiRulesSchema.name);

      const generatedPaths = generate(diff, tempDir);
      expect(generatedPaths).toHaveLength(1);
      const generatedPath = generatedPaths[0];
      expect(fs.existsSync(generatedPath)).toBe(true);

      const content = fs.readFileSync(generatedPath, "utf-8");
      expect(content).toContain("migrate(");
      expect(content).toContain("new Collection(");

      const permissions = CreateCollectionWithRestrictedApiRulesSchema.permissions;
      if (permissions?.listRule) {
        expect(content).toContain(permissions.listRule);
      }
      if (permissions?.viewRule) {
        expect(content).toContain(permissions.viewRule);
      }
      if (permissions?.createRule) {
        expect(content).toContain(permissions.createRule);
      }
      if (permissions?.updateRule) {
        expect(content).toContain(permissions.updateRule);
      }
      if (permissions?.deleteRule) {
        expect(content).toContain(permissions.deleteRule);
      }
    });
  });

  describe("5.9 Collection with explicit ID", () => {
    it("should generate migration with explicit id property", () => {
      const CustomSchema = {
        ...CreateCollectionBlankSchema,
        id: "pb_1234567890abcde",
        name: "CustomWithId",
      };
      const currentSchema = createSchemaDefinition(CustomSchema);
      const diff = compare(currentSchema, null);

      expect(diff.collectionsToCreate).toHaveLength(1);
      expect(diff.collectionsToCreate[0].id).toBe("pb_1234567890abcde");

      const generatedPaths = generate(diff, tempDir);
      expect(generatedPaths).toHaveLength(1);
      const generatedPath = generatedPaths[0];

      const content = fs.readFileSync(generatedPath, "utf-8");
      expect(content).toContain('id: "pb_1234567890abcde"');
    });
  });
});
