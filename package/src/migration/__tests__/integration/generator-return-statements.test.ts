/**
 * Tests to verify that generated migrations have correct return statements
 *
 * PocketBase migrations must return app.save() or app.delete() instead of return true
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compare } from "../../diff";
import { generate } from "../../generator";
import type { SchemaDefinition, SchemaSnapshot } from "../../types";
import { CreateCollectionBlankSchema } from "../fixtures/schemas";

function createSchemaDefinition(collectionSchema: any): SchemaDefinition {
  return {
    collections: new Map([[collectionSchema.name, collectionSchema]]),
  };
}

function createSchemaSnapshot(collectionSchema: any): SchemaSnapshot {
  return {
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    collections: new Map([[collectionSchema.name, collectionSchema]]),
  };
}

describe("Generator Return Statements", () => {
  const tempDir = path.join(os.tmpdir(), "migration-return-test-" + Date.now());

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

  describe("Collection creation migrations", () => {
    it("should return app.save() in up migration, not return true", () => {
      const currentSchema = createSchemaDefinition(CreateCollectionBlankSchema);
      const diff = compare(currentSchema, null);

      expect(diff.collectionsToCreate).toHaveLength(1);

      const generatedPaths = generate(diff, tempDir);
      expect(generatedPaths).toHaveLength(1);
      const generatedPath = generatedPaths[0];
      expect(fs.existsSync(generatedPath)).toBe(true);

      const content = fs.readFileSync(generatedPath, "utf-8");

      // Should NOT contain return true
      expect(content).not.toContain("return true;");
      expect(content).not.toMatch(/return\s+true\s*;/);

      // Should contain return app.save() in up function
      const upFunctionMatch = content.match(/migrate\s*\(\s*\(app\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\(app\)\s*=>/);
      expect(upFunctionMatch).not.toBeNull();
      if (upFunctionMatch) {
        const upFunctionBody = upFunctionMatch[1];
        // Should have return app.save() somewhere in the up function
        expect(upFunctionBody).toMatch(/return\s+app\.save\(/);
        // Should not have bare app.save() as the last statement before closing brace
        const lastStatement = upFunctionBody.trim().split("\n").pop()?.trim();
        expect(lastStatement).toMatch(/^return\s+app\.save\(/);
      }
    });

    it("should return app.delete() in down migration, not return true", () => {
      const currentSchema = createSchemaDefinition(CreateCollectionBlankSchema);
      const diff = compare(currentSchema, null);

      expect(diff.collectionsToCreate).toHaveLength(1);

      const generatedPaths = generate(diff, tempDir);
      expect(generatedPaths).toHaveLength(1);
      const generatedPath = generatedPaths[0];
      expect(fs.existsSync(generatedPath)).toBe(true);

      const content = fs.readFileSync(generatedPath, "utf-8");

      // Should NOT contain return true
      expect(content).not.toContain("return true;");
      expect(content).not.toMatch(/return\s+true\s*;/);

      // Should contain return app.delete() in down function
      const downFunctionMatch = content.match(/,\s*\(app\)\s*=>\s*\{([\s\S]*?)\}\s*\)\s*;/);
      expect(downFunctionMatch).not.toBeNull();
      if (downFunctionMatch) {
        const downFunctionBody = downFunctionMatch[1];
        // Should have return app.delete() somewhere in the down function
        expect(downFunctionBody).toMatch(/return\s+app\.delete\(/);
        // Should not have bare app.delete() as the last statement before closing brace
        const lastStatement = downFunctionBody.trim().split("\n").pop()?.trim();
        expect(lastStatement).toMatch(/^return\s+app\.delete\(/);
      }
    });
  });

  describe("Collection update migrations", () => {
    it("should return app.save() for update operations, not return true", () => {
      // Create a collection, then update it
      const beforeSchema = createSchemaSnapshot({
        name: "test_update_return",
        id: "test_update_return_id",
        type: "base",
        fields: [
          {
            name: "old_field",
            id: "old_field_id",
            type: "text",
            required: false,
            options: {},
          },
        ],
        indexes: [],
        permissions: {
          listRule: null,
          viewRule: null,
          createRule: null,
          updateRule: null,
          deleteRule: null,
        },
      });

      const afterSchema = createSchemaDefinition({
        name: "test_update_return",
        id: "test_update_return_id",
        type: "base",
        fields: [
          {
            name: "old_field",
            id: "old_field_id",
            type: "text",
            required: false,
            options: {},
          },
          {
            name: "new_field",
            id: "new_field_id",
            type: "text",
            required: false,
            options: {},
          },
        ],
        indexes: [],
        permissions: {
          listRule: "id = @request.auth.id",
          viewRule: null,
          createRule: null,
          updateRule: null,
          deleteRule: null,
        },
      });

      const diff = compare(afterSchema, beforeSchema);

      expect(diff.collectionsToModify.length).toBeGreaterThan(0);

      const generatedPaths = generate(diff, tempDir);
      expect(generatedPaths).toHaveLength(1);
      const generatedPath = generatedPaths[0];
      expect(fs.existsSync(generatedPath)).toBe(true);

      const content = fs.readFileSync(generatedPath, "utf-8");

      // Should NOT contain return true
      expect(content).not.toContain("return true;");
      expect(content).not.toMatch(/return\s+true\s*;/);

      // Should contain return app.save() in up function
      const upFunctionMatch = content.match(/migrate\s*\(\s*\(app\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\(app\)\s*=>/);
      expect(upFunctionMatch).not.toBeNull();
      if (upFunctionMatch) {
        const upFunctionBody = upFunctionMatch[1];
        // Should have at least one return app.save() call
        expect(upFunctionBody).toMatch(/return\s+app\.save\(/);
      }

      // Should contain return app.save() in down function as well (for rollback)
      const downFunctionMatch = content.match(/,\s*\(app\)\s*=>\s*\{([\s\S]*?)\}\s*\)\s*;/);
      expect(downFunctionMatch).not.toBeNull();
      if (downFunctionMatch) {
        const downFunctionBody = downFunctionMatch[1];
        // Should have at least one return app.save() call
        expect(downFunctionBody).toMatch(/return\s+app\.save\(/);
      }
    });
  });

  describe("Reference migration comparison", () => {
    it("should match reference migration return statement patterns", () => {
      // Load all reference migrations and check they follow the correct pattern
      const fixturesDir = path.join(__dirname, "../fixtures");
      const referenceMigrationsDir = path.join(fixturesDir, "reference-migrations");

      if (!fs.existsSync(referenceMigrationsDir)) {
        // Skip if fixtures don't exist
        return;
      }

      const referenceFiles = fs.readdirSync(referenceMigrationsDir).filter((f) => f.endsWith(".js"));

      for (const file of referenceFiles) {
        const filePath = path.join(referenceMigrationsDir, file);
        const content = fs.readFileSync(filePath, "utf-8");

        // Reference migrations should NOT have return true
        expect(content).not.toContain("return true;");
        expect(content).not.toMatch(/return\s+true\s*;/);

        // Reference migrations should have return app.save() or return app.delete()
        expect(content).toMatch(/return\s+app\.(save|delete)\(/);

        // Verify both up and down functions have return statements
        const upFunctionMatch = content.match(/migrate\s*\(\s*\(app\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\(app\)\s*=>/);
        if (upFunctionMatch) {
          const upFunctionBody = upFunctionMatch[1];
          expect(upFunctionBody).toMatch(/return\s+app\.(save|delete)\(/);
        }

        const downFunctionMatch = content.match(/,\s*\(app\)\s*=>\s*\{([\s\S]*?)\}\s*\)\s*;/);
        if (downFunctionMatch) {
          const downFunctionBody = downFunctionMatch[1];
          expect(downFunctionBody).toMatch(/return\s+app\.(save|delete)\(/);
        }
      }
    });
  });

  describe("End-to-end validation", () => {
    it("should generate migrations that match the reference migration pattern exactly", () => {
      const currentSchema = createSchemaDefinition(CreateCollectionBlankSchema);
      const diff = compare(currentSchema, null);

      const generatedPaths = generate(diff, tempDir);
      expect(generatedPaths).toHaveLength(1);
      const generatedPath = generatedPaths[0];
      const content = fs.readFileSync(generatedPath, "utf-8");

      // Extract up and down function bodies
      const upMatch = content.match(/migrate\s*\(\s*\(app\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\(app\)\s*=>/);
      const downMatch = content.match(/,\s*\(app\)\s*=>\s*\{([\s\S]*?)\}\s*\)\s*;/);

      expect(upMatch).not.toBeNull();
      expect(downMatch).not.toBeNull();

      if (upMatch && downMatch) {
        const upBody = upMatch[1];
        const downBody = downMatch[1];

        // Both should end with a return statement (not just app.save() or app.delete())
        const upLines = upBody.trim().split("\n");
        const downLines = downBody.trim().split("\n");

        // Find the last non-empty, non-comment line in up function
        const lastUpLine = upLines.reverse().find((line) => line.trim() && !line.trim().startsWith("//"));
        expect(lastUpLine).toMatch(/^(\s*)return\s+app\.(save|delete)\(/);

        // Find the last non-empty, non-comment line in down function
        const lastDownLine = downLines.reverse().find((line) => line.trim() && !line.trim().startsWith("//"));
        expect(lastDownLine).toMatch(/^(\s*)return\s+app\.(save|delete)\(/);
      }
    });
  });
});
