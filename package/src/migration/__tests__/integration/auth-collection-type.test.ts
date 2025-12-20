/**
 * Integration test for Auth collection type generation
 *
 * This test validates that collections with type: "auth" correctly generate
 * PocketBase migration files with:
 * - Correct collection type set to "auth"
 * - Auth system fields excluded from field definitions (email, password, tokenKey, etc.)
 * - Custom fields included in the migration
 * - Proper permission rules
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCollection } from "../../../schema/base";
import { convertZodSchemaToCollectionSchema, extractCollectionNameFromSchema } from "../../analyzer";
import { compare } from "../../diff";
import { generate } from "../../generator";
import type { SchemaDefinition } from "../../types";
import { parseMigrationFile } from "../helpers";

/**
 * Helper function to create a schema definition from a Zod schema
 * Extracts collection name from schema metadata if available
 */
function createSchemaDefinitionFromZod(zodSchema: any): SchemaDefinition {
  const collectionName = extractCollectionNameFromSchema(zodSchema) || "test_auth_users";
  const collectionSchema = convertZodSchemaToCollectionSchema(collectionName, zodSchema);
  return {
    collections: new Map([[collectionName, collectionSchema]]),
  };
}

/**
 * Test schema matching the reference migration fixture
 * This defines an auth collection with a custom "name" field
 * Auth system fields (email, password, tokenKey, etc.) should NOT be included
 * in the schema as they are automatically added by PocketBase
 */
const TestAuthUserSchema = z.object({
  name: z.string().max(100).optional(),
});

const TestAuthUserCollection = defineCollection({
  collectionName: "test_auth_users",
  type: "auth",
  schema: TestAuthUserSchema,
  permissions: {
    listRule: "id = @request.auth.id",
    viewRule: "id = @request.auth.id",
    createRule: "",
    updateRule: "id = @request.auth.id",
    deleteRule: "id = @request.auth.id",
    manageRule: "id = @request.auth.id",
  },
});

describe("Auth Collection Type Generation", () => {
  const tempDir = path.join(os.tmpdir(), "migration-test-auth-type-" + Date.now());

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

  it("should correctly set collection type to 'auth' in generated migration", () => {
    const currentSchema = createSchemaDefinitionFromZod(TestAuthUserCollection);
    const diff = compare(currentSchema, null);

    // Verify diff detected the new collection
    expect(diff.collectionsToCreate).toHaveLength(1);
    expect(diff.collectionsToCreate[0].name).toBe("test_auth_users");
    expect(diff.collectionsToCreate[0].type).toBe("auth");

    // Generate migration file
    const generatedPath = generate(diff, tempDir);
    expect(fs.existsSync(generatedPath)).toBe(true);

    // Read and validate migration content
    const content = fs.readFileSync(generatedPath, "utf-8");

    // Should contain type: "auth"
    expect(content).toContain('type: "auth"');
    expect(content).toContain('name: "test_auth_users"');
  });

  it("should exclude auth system fields from field definitions", () => {
    const currentSchema = createSchemaDefinitionFromZod(TestAuthUserCollection);
    const collection = currentSchema.collections.get("test_auth_users");

    expect(collection).toBeDefined();
    expect(collection?.type).toBe("auth");

    // Auth system fields should NOT be in the field definitions
    // (PocketBase adds them automatically)
    const fieldNames = collection?.fields.map((f) => f.name) || [];
    const authSystemFields = ["email", "password", "tokenKey", "emailVisibility", "verified"];

    for (const systemField of authSystemFields) {
      expect(fieldNames).not.toContain(systemField);
    }

    // Custom fields should be present
    expect(fieldNames).toContain("name");
  });

  it("should include custom fields in the generated migration", () => {
    const currentSchema = createSchemaDefinitionFromZod(TestAuthUserCollection);
    const diff = compare(currentSchema, null);

    const generatedPath = generate(diff, tempDir);
    const content = fs.readFileSync(generatedPath, "utf-8");

    // Should contain custom field
    expect(content).toContain('name: "name"');
  });

  it("should generate correct permission rules for auth collection", () => {
    const currentSchema = createSchemaDefinitionFromZod(TestAuthUserCollection);
    const collection = currentSchema.collections.get("test_auth_users");

    expect(collection).toBeDefined();
    expect(collection?.permissions).toBeDefined();

    const permissions = collection?.permissions;
    expect(permissions?.listRule).toBe("id = @request.auth.id");
    expect(permissions?.viewRule).toBe("id = @request.auth.id");
    expect(permissions?.createRule).toBe("");
    expect(permissions?.updateRule).toBe("id = @request.auth.id");
    expect(permissions?.deleteRule).toBe("id = @request.auth.id");
    expect(permissions?.manageRule).toBe("id = @request.auth.id");
  });

  it("should generate migration with all permission rules in the code", () => {
    const currentSchema = createSchemaDefinitionFromZod(TestAuthUserCollection);
    const diff = compare(currentSchema, null);

    const generatedPath = generate(diff, tempDir);
    const content = fs.readFileSync(generatedPath, "utf-8");

    // Verify all permission rules are in the generated code
    expect(content).toContain("listRule:");
    expect(content).toContain("viewRule:");
    expect(content).toContain("createRule:");
    expect(content).toContain("updateRule:");
    expect(content).toContain("deleteRule:");
    expect(content).toContain("manageRule:");

    // Verify rule values
    expect(content).toContain('listRule: "id = @request.auth.id"');
    expect(content).toContain('viewRule: "id = @request.auth.id"');
    expect(content).toContain('createRule: ""');
    expect(content).toContain('updateRule: "id = @request.auth.id"');
    expect(content).toContain('deleteRule: "id = @request.auth.id"');
    expect(content).toContain('manageRule: "id = @request.auth.id"');
  });

  it("should parse generated migration and verify structure", () => {
    const currentSchema = createSchemaDefinitionFromZod(TestAuthUserCollection);
    const diff = compare(currentSchema, null);

    const generatedPath = generate(diff, tempDir);

    // Parse the generated migration
    const generatedMigration = parseMigrationFile(generatedPath);

    // Verify migration structure
    expect(generatedMigration.upFunction).toBeDefined();
    expect(generatedMigration.upFunction.collections).toHaveLength(1);

    const collection = generatedMigration.upFunction.collections[0];
    expect(collection.name).toBe("test_auth_users");
    expect(collection.type).toBe("auth");

    // Verify fields - should only have custom fields, not auth system fields
    const fieldNames = collection.fields.map((f: any) => f.name);
    expect(fieldNames).toContain("name");
    expect(fieldNames).not.toContain("email");
    expect(fieldNames).not.toContain("password");
    expect(fieldNames).not.toContain("tokenKey");
    expect(fieldNames).not.toContain("emailVisibility");
    expect(fieldNames).not.toContain("verified");

    // Verify permissions
    expect(collection.rules).toBeDefined();
    expect(collection.rules.listRule).toBe("id = @request.auth.id");
    expect(collection.rules.viewRule).toBe("id = @request.auth.id");
    expect(collection.rules.createRule).toBe("");
    expect(collection.rules.updateRule).toBe("id = @request.auth.id");
    expect(collection.rules.deleteRule).toBe("id = @request.auth.id");
    expect(collection.rules.manageRule).toBe("id = @request.auth.id");
  });

  it("should work with explicit type specification even when email/password fields are in schema", () => {
    // This tests that explicit type: "auth" takes precedence over field-based detection
    // Even if email and password are in the schema (for validation), they should be excluded
    const schemaWithAuthFields = z.object({
      name: z.string().optional(),
      email: z.string().email(), // This would trigger auto-detection, but explicit type should win
      password: z.string().min(8), // This would trigger auto-detection, but explicit type should win
    });

    const collectionWithAuthFields = defineCollection({
      collectionName: "test_auth_with_fields",
      type: "auth", // Explicit type should take precedence
      schema: schemaWithAuthFields,
      permissions: {
        listRule: "id = @request.auth.id",
        viewRule: "id = @request.auth.id",
        createRule: "",
        updateRule: "id = @request.auth.id",
        deleteRule: "id = @request.auth.id",
      },
    });

    const currentSchema = createSchemaDefinitionFromZod(collectionWithAuthFields);
    const collection = currentSchema.collections.get("test_auth_with_fields");

    expect(collection).toBeDefined();
    expect(collection?.type).toBe("auth");

    // Even though email and password were in the schema, they should be excluded
    // because they are auth system fields
    const fieldNames = collection?.fields.map((f) => f.name) || [];
    expect(fieldNames).not.toContain("email");
    expect(fieldNames).not.toContain("password");
    expect(fieldNames).toContain("name"); // Custom field should remain
  });
});
