/**
 * Integration test for Project schema migration generation
 *
 * This test validates that the ProjectSchema correctly generates
 * a PocketBase migration file with all expected fields, permissions, and relations.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { convertZodSchemaToCollectionSchema, extractCollectionNameFromSchema } from "../../migration/analyzer";
import { compare } from "../../migration/diff";
import { generate } from "../../migration/generator";
import type { SchemaDefinition } from "../../migration/types";
import { ProjectCollection } from "../project";

/**
 * Helper function to create a schema definition from a Zod schema
 * Extracts collection name from schema metadata if available
 */
function createSchemaDefinitionFromZod(zodSchema: any): SchemaDefinition {
  const collectionName = extractCollectionNameFromSchema(zodSchema) || "projects";
  const collectionSchema = convertZodSchemaToCollectionSchema(collectionName, zodSchema);
  return {
    collections: new Map([[collectionName, collectionSchema]]),
  };
}

describe("Project Schema Migration Generation", () => {
  const tempDir = path.join(os.tmpdir(), "migration-test-project-" + Date.now());

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

  it("should generate migration for project collection with all fields", () => {
    const currentSchema = createSchemaDefinitionFromZod(ProjectCollection);
    const collectionName = Array.from(currentSchema.collections.keys())[0];
    const diff = compare(currentSchema, null);

    // Should have one collection to create
    expect(diff.collectionsToCreate).toHaveLength(1);
    expect(diff.collectionsToCreate[0].name).toBe(collectionName);

    // Generate migration file
    const generatedPath = generate(diff, tempDir);
    expect(fs.existsSync(generatedPath)).toBe(true);

    // Read and validate migration content
    const content = fs.readFileSync(generatedPath, "utf-8");

    // Should contain basic migration structure
    expect(content).toContain("migrate(");
    expect(content).toContain("new Collection(");
    expect(content).toContain(`name: "${collectionName}"`);
    expect(content).toContain('type: "base"');
    expect(content).toContain("app.save(");

    // Should contain all expected fields
    // Note: thumbnailURL and imageFiles are excluded as they are image file handling fields,
    // not actual database fields (they're handled by PocketBase's file system)
    expect(content).toContain('name: "title"');
    expect(content).toContain('name: "content"');
    expect(content).toContain('name: "status"');
    expect(content).toContain('name: "summary"');
    expect(content).toContain('name: "OwnerUser"');
    expect(content).toContain('name: "SubscriberUsers"');

    // Should contain field types
    expect(content).toContain('type: "text"'); // title, content, summary
    expect(content).toContain('type: "select"'); // status
    expect(content).toContain('type: "relation"'); // OwnerUser, SubscriberUsers

    // Should contain permissions
    expect(content).toContain("listRule:");
    expect(content).toContain("viewRule:");
    expect(content).toContain("createRule:");
    expect(content).toContain("updateRule:");
    expect(content).toContain("deleteRule:");

    // Should contain custom permission rules
    // Note: The migration file uses escaped quotes in the string literal
    expect(content).toContain("@request.auth.id");
    expect(content).toContain("OwnerUser = @request.auth.id");
    expect(content).toContain("SubscriberUsers ?= @request.auth.id");
  });

  it("should correctly identify relation fields using explicit RelationField() helpers", () => {
    const currentSchema = createSchemaDefinitionFromZod(ProjectCollection);
    const collectionName = Array.from(currentSchema.collections.keys())[0];
    const collection = currentSchema.collections.get(collectionName);

    expect(collection).toBeDefined();
    expect(collection?.fields).toBeDefined();

    // Find relation fields (using explicit RelationField() and RelationsField() helpers)
    const ownerField = collection?.fields.find((f) => f.name === "OwnerUser");
    const subscribersField = collection?.fields.find((f) => f.name === "SubscriberUsers");

    expect(ownerField).toBeDefined();
    expect(ownerField?.type).toBe("relation");
    expect(ownerField?.relation).toBeDefined();
    expect(ownerField?.relation?.collection).toBe("Users");
    expect(ownerField?.relation?.maxSelect).toBe(1);

    expect(subscribersField).toBeDefined();
    expect(subscribersField?.type).toBe("relation");
    expect(subscribersField?.relation).toBeDefined();
    expect(subscribersField?.relation?.collection).toBe("Users");
    expect(subscribersField?.relation?.maxSelect).toBeGreaterThan(1);
  });

  it("should correctly apply permissions with template and custom rules", () => {
    const currentSchema = createSchemaDefinitionFromZod(ProjectCollection);
    const collectionName = Array.from(currentSchema.collections.keys())[0];
    const collection = currentSchema.collections.get(collectionName);

    expect(collection).toBeDefined();
    expect(collection?.permissions).toBeDefined();

    const permissions = collection?.permissions;

    // Should have list rule with custom override
    expect(permissions?.listRule).toBe('@request.auth.id != ""');

    // Should have view rule with custom logic
    expect(permissions?.viewRule).toContain('@request.auth.id != ""');
    expect(permissions?.viewRule).toContain("OwnerUser = @request.auth.id");
    expect(permissions?.viewRule).toContain("SubscriberUsers ?= @request.auth.id");

    // Should have create/update/delete rules from owner-only template
    expect(permissions?.createRule).toBeDefined();
    expect(permissions?.updateRule).toBeDefined();
    expect(permissions?.deleteRule).toBeDefined();
  });

  it("should correctly handle select field for status enum", () => {
    const currentSchema = createSchemaDefinitionFromZod(ProjectCollection);
    const collectionName = Array.from(currentSchema.collections.keys())[0];
    const collection = currentSchema.collections.get(collectionName);

    expect(collection).toBeDefined();

    const statusField = collection?.fields.find((f) => f.name === "status");
    expect(statusField).toBeDefined();
    expect(statusField?.type).toBe("select");
    expect(statusField?.options).toBeDefined();
    expect(statusField?.options?.values).toBeDefined();
    expect(statusField?.options?.values).toContain("draft");
    expect(statusField?.options?.values).toContain("active");
    expect(statusField?.options?.values).toContain("complete");
    expect(statusField?.options?.values).toContain("fail");
  });

  it("should correctly handle optional fields", () => {
    const currentSchema = createSchemaDefinitionFromZod(ProjectCollection);
    const collectionName = Array.from(currentSchema.collections.keys())[0];
    const collection = currentSchema.collections.get(collectionName);

    expect(collection).toBeDefined();

    const summaryField = collection?.fields.find((f) => f.name === "summary");

    expect(summaryField).toBeDefined();
    expect(summaryField?.required).toBe(false);

    // Note: thumbnailURL and imageFiles are excluded from database fields
    // as they are image file handling fields, not actual database columns
  });
});
