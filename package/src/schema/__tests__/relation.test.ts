/**
 * Tests for explicit relation field definition
 *
 * Tests the RelationField() and RelationsField() helper functions that provide
 * an explicit, declarative way to define PocketBase relation fields.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { convertZodSchemaToCollectionSchema } from "../../migration/analyzer";
import { generateFieldDefinitionObject } from "../../migration/generator";
import { extractRelationMetadata, RelationField, RelationsField, withPermissions } from "../base";

describe("Explicit Relation Definition", () => {
  describe("RelationField() helper", () => {
    it("should create a single relation with explicit collection target", () => {
      const schema = z.object({
        title: z.string(),
        author: RelationField({ collection: "users" }),
      });

      const collection = convertZodSchemaToCollectionSchema("posts", schema);
      const authorField = collection.fields.find((f) => f.name === "author");

      expect(authorField).toBeDefined();
      expect(authorField?.type).toBe("relation");
      expect(authorField?.relation).toBeDefined();
      expect(authorField?.relation?.collection).toBe("users");
      expect(authorField?.relation?.maxSelect).toBe(1);
      expect(authorField?.relation?.minSelect).toBe(0);
      expect(authorField?.relation?.cascadeDelete).toBe(false);
    });

    it("should support cascadeDelete option", () => {
      const schema = z.object({
        post: RelationField({ collection: "posts", cascadeDelete: true }),
      });

      const collection = convertZodSchemaToCollectionSchema("comments", schema);
      const postField = collection.fields.find((f) => f.name === "post");

      expect(postField?.relation?.cascadeDelete).toBe(true);
    });

    it("should generate correct migration output for explicit relation", () => {
      const schema = z.object({
        owner: RelationField({ collection: "users" }),
      });

      const collection = convertZodSchemaToCollectionSchema("projects", schema);
      const ownerField = collection.fields.find((f) => f.name === "owner");

      expect(ownerField).toBeDefined();
      const output = generateFieldDefinitionObject(ownerField!);

      expect(output).toContain('"name": "owner"');
      expect(output).toContain('"type": "relation"');
      expect(output).toContain('"collectionId": "_pb_users_auth_"'); // Special case for users
      expect(output).toContain('"maxSelect": 1');
      expect(output).toContain('"minSelect": 0');
    });

    it("should use findCollectionByNameOrId for non-users collections", () => {
      const schema = z.object({
        category: RelationField({ collection: "categories" }),
      });

      const collection = convertZodSchemaToCollectionSchema("posts", schema);
      const categoryField = collection.fields.find((f) => f.name === "category");

      expect(categoryField).toBeDefined();
      const output = generateFieldDefinitionObject(categoryField!);

      expect(output).toContain('"collectionId": app.findCollectionByNameOrId("categories").id');
    });
  });

  describe("RelationsField() helper", () => {
    it("should create a multiple relation with explicit collection target", () => {
      const schema = z.object({
        title: z.string(),
        tags: RelationsField({ collection: "tags" }),
      });

      const collection = convertZodSchemaToCollectionSchema("posts", schema);
      const tagsField = collection.fields.find((f) => f.name === "tags");

      expect(tagsField).toBeDefined();
      expect(tagsField?.type).toBe("relation");
      expect(tagsField?.relation).toBeDefined();
      expect(tagsField?.relation?.collection).toBe("tags");
      expect(tagsField?.relation?.maxSelect).toBe(999);
      expect(tagsField?.relation?.minSelect).toBe(0);
    });

    it("should support minSelect and maxSelect options", () => {
      const schema = z.object({
        collaborators: RelationsField({
          collection: "users",
          minSelect: 1,
          maxSelect: 10,
        }),
      });

      const collection = convertZodSchemaToCollectionSchema("projects", schema);
      const collaboratorsField = collection.fields.find((f) => f.name === "collaborators");

      expect(collaboratorsField?.relation?.minSelect).toBe(1);
      expect(collaboratorsField?.relation?.maxSelect).toBe(10);
    });

    it("should generate correct migration output for multiple relations", () => {
      const schema = z.object({
        subscribers: RelationsField({ collection: "users" }),
      });

      const collection = convertZodSchemaToCollectionSchema("projects", schema);
      const subscribersField = collection.fields.find((f) => f.name === "subscribers");

      expect(subscribersField).toBeDefined();
      const output = generateFieldDefinitionObject(subscribersField!);

      expect(output).toContain('"name": "subscribers"');
      expect(output).toContain('"type": "relation"');
      expect(output).toContain('"collectionId": "_pb_users_auth_"');
      expect(output).toContain('"maxSelect": 999');
    });
  });

  describe("extractRelationMetadata()", () => {
    it("should extract metadata from RelationField() output", () => {
      const field = RelationField({ collection: "users" });
      const metadata = extractRelationMetadata(field.description);

      expect(metadata).not.toBeNull();
      expect(metadata?.type).toBe("single");
      expect(metadata?.collection).toBe("users");
      expect(metadata?.maxSelect).toBe(1);
      expect(metadata?.minSelect).toBe(0);
      expect(metadata?.cascadeDelete).toBe(false);
    });

    it("should extract metadata from RelationsField() output", () => {
      const field = RelationsField({
        collection: "tags",
        minSelect: 2,
        maxSelect: 5,
        cascadeDelete: true,
      });
      const metadata = extractRelationMetadata(field.description);

      expect(metadata).not.toBeNull();
      expect(metadata?.type).toBe("multiple");
      expect(metadata?.collection).toBe("tags");
      expect(metadata?.maxSelect).toBe(5);
      expect(metadata?.minSelect).toBe(2);
      expect(metadata?.cascadeDelete).toBe(true);
    });

    it("should return null for non-relation fields", () => {
      const field = z.string();
      const metadata = extractRelationMetadata(field.description);

      expect(metadata).toBeNull();
    });

    it("should return null for undefined description", () => {
      const metadata = extractRelationMetadata(undefined);
      expect(metadata).toBeNull();
    });
  });

  describe("Explicit vs Implicit Relations", () => {
    it("should prefer explicit relation metadata over naming convention", () => {
      // Even with lowercase field name, explicit relation should work
      const schema = z.object({
        owner: RelationField({ collection: "users" }),
      });

      const collection = convertZodSchemaToCollectionSchema("projects", schema);
      const ownerField = collection.fields.find((f) => f.name === "owner");

      expect(ownerField?.type).toBe("relation");
      expect(ownerField?.relation?.collection).toBe("users");
    });

    it("should still support legacy uppercase naming convention", () => {
      // Legacy behavior: uppercase field name triggers relation detection
      const schema = z.object({
        User: z.string(),
      });

      const collection = convertZodSchemaToCollectionSchema("projects", schema);
      const userField = collection.fields.find((f) => f.name === "User");

      expect(userField?.type).toBe("relation");
      expect(userField?.relation?.collection).toBe("Users");
    });

    it("should work with withPermissions", () => {
      const schema = withPermissions(
        z.object({
          title: z.string(),
          author: RelationField({ collection: "users" }),
        }),
        { template: "authenticated" }
      );

      const collection = convertZodSchemaToCollectionSchema("posts", schema);
      const authorField = collection.fields.find((f) => f.name === "author");

      expect(authorField?.type).toBe("relation");
      expect(authorField?.relation?.collection).toBe("users");
      expect(collection.permissions).toBeDefined();
    });
  });

  describe("Real-world Usage Patterns", () => {
    it("should support a blog post schema with multiple relations", () => {
      const BlogPostSchema = z.object({
        title: z.string(),
        content: z.string(),
        author: RelationField({ collection: "users" }),
        category: RelationField({ collection: "categories" }),
        tags: RelationsField({ collection: "tags", maxSelect: 10 }),
        reviewers: RelationsField({
          collection: "users",
          minSelect: 1,
          maxSelect: 3,
        }),
      });

      const collection = convertZodSchemaToCollectionSchema("posts", BlogPostSchema);

      // Check all relation fields
      const authorField = collection.fields.find((f) => f.name === "author");
      const categoryField = collection.fields.find((f) => f.name === "category");
      const tagsField = collection.fields.find((f) => f.name === "tags");
      const reviewersField = collection.fields.find((f) => f.name === "reviewers");

      expect(authorField?.type).toBe("relation");
      expect(authorField?.relation?.collection).toBe("users");
      expect(authorField?.relation?.maxSelect).toBe(1);

      expect(categoryField?.type).toBe("relation");
      expect(categoryField?.relation?.collection).toBe("categories");
      expect(categoryField?.relation?.maxSelect).toBe(1);

      expect(tagsField?.type).toBe("relation");
      expect(tagsField?.relation?.collection).toBe("tags");
      expect(tagsField?.relation?.maxSelect).toBe(10);

      expect(reviewersField?.type).toBe("relation");
      expect(reviewersField?.relation?.collection).toBe("users");
      expect(reviewersField?.relation?.minSelect).toBe(1);
      expect(reviewersField?.relation?.maxSelect).toBe(3);
    });
  });
});
