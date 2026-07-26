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
    expect(output).toContain("export type UsersResponse = UsersRecord;");
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

  it("should generate types for view collections without created/updated or expand", () => {
    const projectStatsCollection: CollectionSchema = {
      name: "ProjectStats",
      type: "view",
      viewQuery: "SELECT p.OwnerUser AS id, COUNT(*) AS projectCount FROM Projects p GROUP BY p.OwnerUser",
      fields: [
        {
          id: "pb_owner_field",
          name: "OwnerUser",
          type: "relation",
          required: true,
          relation: { collection: "Users", maxSelect: 1 },
        },
        { id: "pb_count_field", name: "projectCount", type: "number", required: true },
      ],
    };

    const usersCollection: CollectionSchema = {
      name: "Users",
      type: "auth",
      fields: [],
    };

    const schema: SchemaDefinition = {
      collections: new Map([
        ["Users", usersCollection],
        ["ProjectStats", projectStatsCollection],
      ]),
    };

    const output = new TypeGenerator(schema).generate();

    expect(output).toContain("export interface ProjectStatsRecord {");
    expect(output).toContain("projectCount: number;");
    expect(output).toContain('collectionName: "ProjectStats";');

    // A view only has the columns its query selects
    const recordBody = output.slice(
      output.indexOf("export interface ProjectStatsRecord {"),
      output.indexOf("export type ProjectStatsResponse")
    );
    expect(recordBody).not.toContain("created: string;");
    expect(recordBody).not.toContain("updated: string;");

    // Relation expansion does not cross a view
    expect(output).toContain("export type ProjectStatsResponse = ProjectStatsRecord;");

    // Views are still reachable through the typed client
    expect(output).toContain("ProjectStats: ProjectStatsResponse;");
    expect(output).toContain('collection(idOrName: "ProjectStats"): RecordService<ProjectStatsResponse>;');
  });
});
