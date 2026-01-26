import { describe, expect, it } from "vitest";
import type { CollectionSchema, SchemaDefinition } from "../../migration/types";
import { TypeGenerator } from "../generator";

describe("TypeGenerator", () => {
  it("should generate types for simple collection", () => {
    const usersCollection: CollectionSchema = {
      name: "users",
      type: "auth",
      fields: [
        { id: "pb_name_field", name: "name", type: "text", required: false },
        { id: "pb_age_field", name: "age", type: "number", required: true },
      ],
    };

    const schema: SchemaDefinition = {
      collections: new Map([["users", usersCollection]]),
    };

    const generator = new TypeGenerator(schema);
    const output = generator.generate();

    expect(output).toContain("export interface UsersRecord {");
    expect(output).toContain("name?: string;");
    expect(output).toContain("age: number;");
    expect(output).toContain("export interface UsersResponse extends UsersRecord {");
  });

  it("should generate types with relations and expand", () => {
    const usersCollection: CollectionSchema = {
      name: "users",
      type: "auth",
      fields: [],
    };

    const postsCollection: CollectionSchema = {
      name: "posts",
      type: "base",
      fields: [
        { id: "pb_title_field", name: "title", type: "text", required: true },
        {
          id: "pb_author_field",
          name: "author",
          type: "relation",
          required: true,
          relation: { collection: "users", maxSelect: 1 },
        },
        {
          id: "pb_reviewers_field",
          name: "reviewers",
          type: "relation",
          required: false,
          relation: { collection: "users", maxSelect: 10 },
        },
      ],
    };

    const schema: SchemaDefinition = {
      collections: new Map([
        ["users", usersCollection],
        ["posts", postsCollection],
      ]),
    };

    const generator = new TypeGenerator(schema);
    const output = generator.generate();

    expect(output).toContain("author: string;");
    expect(output).toContain("reviewers?: string[];");

    expect(output).toContain("expand?: {");
    expect(output).toContain("author?: UsersResponse;");
    expect(output).toContain("reviewers?: UsersResponse[];");
  });

  it("should handle select with values", () => {
    const postsCollection: CollectionSchema = {
      name: "posts",
      type: "base",
      fields: [
        {
          id: "pb_status_field",
          name: "status",
          type: "select",
          required: true,
          options: { values: ["draft", "published"], maxSelect: 1 }
        },
        {
          id: "pb_tags_field",
          name: "tags",
          type: "select",
          required: false,
          options: { values: ["news", "tech"], maxSelect: 2 }
        },
      ],
    };

    const schema: SchemaDefinition = {
      collections: new Map([["posts", postsCollection]]),
    };

    const generator = new TypeGenerator(schema);
    const output = generator.generate();

    expect(output).toContain('status: "draft" | "published";');
    expect(output).toContain('tags?: ("news" | "tech")[];');
  });
});
