/**
 * Tests for view collection definitions (defineView + the sql tagged template)
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { baseSchema } from "../base";
import { defineView, sql, validateViewQuery } from "../view";

const ProjectStatsSchema = z
  .object({
    OwnerUser: z.string(),
    projectCount: z.number(),
  })
  .extend(baseSchema);

describe("sql tagged template", () => {
  it("strips the common leading indentation", () => {
    const query = sql`
      SELECT p.id AS id
        FROM Projects p
    `;

    expect(query).toBe("SELECT p.id AS id\n  FROM Projects p");
  });

  it("interpolates values", () => {
    const table = "Projects";
    const query = sql`SELECT * FROM ${table}`;

    expect(query).toBe("SELECT * FROM Projects");
  });

  it("produces identical output for differently indented but equivalent queries", () => {
    const a = sql`
      SELECT 1 AS id
    `;
    const b = sql`
            SELECT 1 AS id
    `;

    expect(a).toBe(b);
  });

  it("preserves relative indentation and blank lines inside the query", () => {
    const query = sql`
      SELECT 1 AS id

        FROM Projects p
    `;

    expect(query).toBe("SELECT 1 AS id\n\n  FROM Projects p");
  });
});

describe("validateViewQuery", () => {
  it("accepts a SELECT query", () => {
    expect(() => validateViewQuery("Test", "SELECT 1 AS id")).not.toThrow();
  });

  it("accepts a WITH (CTE) query", () => {
    expect(() => validateViewQuery("Test", "WITH x AS (SELECT 1) SELECT * FROM x")).not.toThrow();
  });

  it("accepts a query that opens with comments", () => {
    expect(() =>
      validateViewQuery("Test", "-- the curator's tag\n/* block */\nSELECT 1 AS id")
    ).not.toThrow();
  });

  it("rejects an empty query", () => {
    expect(() => validateViewQuery("Test", "   ")).toThrow(/requires a non-empty viewQuery/);
  });

  it("rejects a non-SELECT statement", () => {
    expect(() => validateViewQuery("Test", "DELETE FROM Projects")).toThrow(/must start with SELECT or WITH/);
  });
});

describe("defineView", () => {
  const viewQuery = sql`
    SELECT p.OwnerUser AS id,
           p.OwnerUser AS OwnerUser,
           COUNT(*)    AS projectCount
      FROM Projects p
     GROUP BY p.OwnerUser
  `;

  const ProjectStatsCollection = defineView({
    collectionName: "ProjectStats",
    schema: ProjectStatsSchema,
    viewQuery,
    permissions: {
      listRule: "OwnerUser = @request.auth.id",
      viewRule: "OwnerUser = @request.auth.id",
    },
  });

  it("attaches the collection name, type and query as metadata", () => {
    const metadata = JSON.parse(ProjectStatsCollection.description!);

    expect(metadata.collectionName).toBe("ProjectStats");
    expect(metadata.type).toBe("view");
    expect(metadata.viewQuery).toBe(viewQuery);
  });

  it("locks every write rule", () => {
    const metadata = JSON.parse(ProjectStatsCollection.description!);

    expect(metadata.permissions.listRule).toBe("OwnerUser = @request.auth.id");
    expect(metadata.permissions.viewRule).toBe("OwnerUser = @request.auth.id");
    expect(metadata.permissions.createRule).toBeNull();
    expect(metadata.permissions.updateRule).toBeNull();
    expect(metadata.permissions.deleteRule).toBeNull();
  });

  it("defaults the read rules to null when no permissions are given", () => {
    const collection = defineView({
      collectionName: "Locked",
      schema: ProjectStatsSchema,
      viewQuery: "SELECT 1 AS id",
    });
    const metadata = JSON.parse(collection.description!);

    expect(metadata.permissions.listRule).toBeNull();
    expect(metadata.permissions.viewRule).toBeNull();
  });

  it("still validates as the underlying Zod schema", () => {
    const parsed = ProjectStatsCollection.parse({
      id: "abc123",
      collectionId: "pb_projectstats",
      collectionName: "ProjectStats",
      expand: {},
      created: "2026-01-01 00:00:00Z",
      updated: "2026-01-01 00:00:00Z",
      OwnerUser: "user1",
      projectCount: 3,
    });

    expect(parsed.projectCount).toBe(3);
  });

  it("rejects an invalid query at definition time", () => {
    expect(() =>
      defineView({
        collectionName: "Broken",
        schema: ProjectStatsSchema,
        viewQuery: "",
      })
    ).toThrow(/requires a non-empty viewQuery/);
  });
});
