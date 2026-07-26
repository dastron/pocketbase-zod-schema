/**
 * Integration tests for view collection generation
 *
 * Validates that collections defined with defineView() produce PocketBase
 * migrations that:
 * - set type "view" and carry the SQL query
 * - omit fields and indexes (PocketBase derives fields from the query)
 * - lock every write rule
 * - update the query in place when the SQL changes
 * - round-trip through the migration parser, so no follow-up migration is
 *   generated for an unchanged schema
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { baseSchema } from "../../../schema/base";
import { defineView, sql } from "../../../schema/view";
import { convertZodSchemaToCollectionSchema } from "../../analyzer";
import { compare } from "../../diff";
import { filterDiff } from "../../diff/filter";
import { generate } from "../../generator";
import { parseMigrationOperations } from "../../migration-parser";
import { detectDestructiveChanges } from "../../validation";
import type { CollectionSchema, SchemaDefinition, SchemaSnapshot } from "../../types";

const ProjectStatsSchema = z
  .object({
    OwnerUser: z.string(),
    projectCount: z.number(),
  })
  .extend(baseSchema);

const BASE_QUERY = sql`
  SELECT p.OwnerUser AS id,
         p.OwnerUser AS OwnerUser,
         COUNT(*)    AS projectCount
    FROM Projects p
   GROUP BY p.OwnerUser
`;

const CHANGED_QUERY = sql`
  SELECT p.OwnerUser AS id,
         p.OwnerUser AS OwnerUser,
         COUNT(*)    AS projectCount
    FROM Projects p
   WHERE p.status = 'active'
   GROUP BY p.OwnerUser
`;

/**
 * Builds a SchemaDefinition holding a single ProjectStats view
 */
function viewSchemaDefinition(viewQuery: string): SchemaDefinition {
  const collection = defineView({
    collectionName: "ProjectStats",
    schema: ProjectStatsSchema,
    viewQuery,
    permissions: {
      listRule: "OwnerUser = @request.auth.id",
      viewRule: "OwnerUser = @request.auth.id",
    },
  });

  return {
    collections: new Map([["ProjectStats", convertZodSchemaToCollectionSchema("ProjectStats", collection)]]),
  };
}

/**
 * Reconstructs the database state by replaying generated migration files,
 * the same way loadSnapshotWithMigrations() does at generate time
 */
function snapshotFromMigrations(migrationPaths: string[]): SchemaSnapshot {
  const collections = new Map<string, CollectionSchema>();

  for (const migrationPath of migrationPaths) {
    const operations = parseMigrationOperations(fs.readFileSync(migrationPath, "utf-8"));

    for (const collection of operations.collectionsToCreate) {
      collections.set(collection.name, collection);
    }

    for (const name of operations.collectionsToDelete) {
      collections.delete(name);
    }

    for (const update of operations.collectionsToUpdate) {
      const collection = collections.get(update.collectionName);
      if (collection && update.viewQuery !== undefined) {
        collection.viewQuery = update.viewQuery;
      }
    }
  }

  return { version: "1.0.0", timestamp: new Date().toISOString(), collections };
}

describe("View Collection Generation", () => {
  const tempDir = path.join(os.tmpdir(), "migration-test-view-" + Date.now());

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

  describe("creating a view", () => {
    const dir = path.join(tempDir, "create");
    let content: string;

    beforeAll(() => {
      fs.mkdirSync(dir, { recursive: true });
      const diff = compare(viewSchemaDefinition(BASE_QUERY), null);
      const paths = generate(diff, dir);
      content = fs.readFileSync(paths[0], "utf-8");
    });

    it("marks the collection as a view", () => {
      expect(content).toContain('"type": "view"');
      expect(content).toContain('"name": "ProjectStats"');
    });

    it("includes the SQL query", () => {
      expect(content).toContain('"viewQuery":');
      expect(content).toContain("FROM Projects p");
      expect(content).toContain("GROUP BY p.OwnerUser");
    });

    it("omits fields and indexes - PocketBase derives them from the query", () => {
      expect(content).not.toContain('"fields":');
      expect(content).not.toContain('"indexes":');
    });

    it("keeps the read rules and locks the write rules", () => {
      expect(content).toContain('"listRule": "OwnerUser = @request.auth.id"');
      expect(content).toContain('"viewRule": "OwnerUser = @request.auth.id"');
      expect(content).toContain('"createRule": null');
      expect(content).toContain('"updateRule": null');
      expect(content).toContain('"deleteRule": null');
      expect(content).not.toContain("manageRule");
    });

    it("deletes the collection on rollback", () => {
      expect(content).toContain("app.findCollectionByNameOrId(");
      expect(content).toContain("// ProjectStats");
      expect(content).toContain("app.delete(collection)");
    });

    it("produces a valid migration filename", () => {
      const files = fs.readdirSync(dir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^\d+_created_ProjectStats\.js$/);
    });
  });

  describe("round-trip", () => {
    it("needs no follow-up migration for an unchanged schema", () => {
      const dir = path.join(tempDir, "roundtrip");
      fs.mkdirSync(dir, { recursive: true });

      const schema = viewSchemaDefinition(BASE_QUERY);
      const paths = generate(compare(schema, null), dir);

      const snapshot = snapshotFromMigrations(paths);
      const secondDiff = compare(schema, snapshot);

      expect(secondDiff.collectionsToCreate).toHaveLength(0);
      expect(secondDiff.collectionsToDelete).toHaveLength(0);
      expect(secondDiff.collectionsToModify).toHaveLength(0);
    });

    it("recovers the query verbatim through the parser", () => {
      const dir = path.join(tempDir, "roundtrip-query");
      fs.mkdirSync(dir, { recursive: true });

      const paths = generate(compare(viewSchemaDefinition(BASE_QUERY), null), dir);
      const snapshot = snapshotFromMigrations(paths);

      expect(snapshot.collections.get("ProjectStats")?.viewQuery).toBe(BASE_QUERY);
    });

    it("survives SQL containing apostrophes, braces and quotes", () => {
      const dir = path.join(tempDir, "roundtrip-tricky");
      fs.mkdirSync(dir, { recursive: true });

      const trickyQuery = sql`
        -- the curator's whole-media tag {not an object}
        SELECT p.id AS id,
               json_object('key', p.title, 'note', "quoted") AS meta
          FROM Projects p
         WHERE p.title != '}'
      `;

      const schema = viewSchemaDefinition(trickyQuery);
      const paths = generate(compare(schema, null), dir);
      const snapshot = snapshotFromMigrations(paths);

      expect(snapshot.collections.get("ProjectStats")?.viewQuery).toBe(trickyQuery);
      expect(compare(schema, snapshot).collectionsToModify).toHaveLength(0);
    });
  });

  describe("changing the query", () => {
    it("emits a single in-place viewQuery update", () => {
      const dir = path.join(tempDir, "update");
      fs.mkdirSync(dir, { recursive: true });

      const createPaths = generate(compare(viewSchemaDefinition(BASE_QUERY), null), dir);
      const snapshot = snapshotFromMigrations(createPaths);

      const diff = compare(viewSchemaDefinition(CHANGED_QUERY), snapshot);
      expect(diff.collectionsToModify).toHaveLength(1);
      expect(diff.collectionsToModify[0].viewQueryUpdate?.oldValue).toBe(BASE_QUERY);
      expect(diff.collectionsToModify[0].viewQueryUpdate?.newValue).toBe(CHANGED_QUERY);
      expect(diff.collectionsToModify[0].fieldsToAdd).toHaveLength(0);
      expect(diff.collectionsToModify[0].fieldsToRemove).toHaveLength(0);

      const updatePaths = generate(diff, dir);
      expect(updatePaths).toHaveLength(1);

      const content = fs.readFileSync(updatePaths[0], "utf-8");
      // unmarshal, not a direct assignment: PocketBase silently drops
      // `collection.viewQuery = ...` from the migration runtime
      expect(content).toContain("unmarshal({");
      expect(content).toContain('"viewQuery":');
      expect(content).toContain("WHERE p.status = 'active'");
      // The collection is updated, never recreated
      expect(content).not.toContain("new Collection(");
      // The down migration restores the previous query
      expect(content).toContain("revert_viewQuery");
    });

    it("applies the update when replaying migrations", () => {
      const dir = path.join(tempDir, "update-replay");
      fs.mkdirSync(dir, { recursive: true });

      const createPaths = generate(compare(viewSchemaDefinition(BASE_QUERY), null), dir);
      const changedSchema = viewSchemaDefinition(CHANGED_QUERY);
      const updatePaths = generate(compare(changedSchema, snapshotFromMigrations(createPaths)), dir);

      const snapshot = snapshotFromMigrations([...createPaths, ...updatePaths]);
      expect(snapshot.collections.get("ProjectStats")?.viewQuery).toBe(CHANGED_QUERY);
      expect(compare(changedSchema, snapshot).collectionsToModify).toHaveLength(0);
    });

    it("ignores re-indentation of an otherwise identical query", () => {
      const dir = path.join(tempDir, "reindent");
      fs.mkdirSync(dir, { recursive: true });

      const paths = generate(compare(viewSchemaDefinition(BASE_QUERY), null), dir);
      const snapshot = snapshotFromMigrations(paths);

      const reindented = sql`
              SELECT p.OwnerUser AS id,
                     p.OwnerUser AS OwnerUser,
                     COUNT(*)    AS projectCount
                FROM Projects p
               GROUP BY p.OwnerUser
      `;

      const diff = compare(viewSchemaDefinition(reindented), snapshot);
      expect(diff.collectionsToModify).toHaveLength(0);
    });
  });

  describe("deleting a view", () => {
    it("is not treated as a destructive change", () => {
      const dir = path.join(tempDir, "delete");
      fs.mkdirSync(dir, { recursive: true });

      const paths = generate(compare(viewSchemaDefinition(BASE_QUERY), null), dir);
      const snapshot = snapshotFromMigrations(paths);

      const diff = compare({ collections: new Map() }, snapshot);
      expect(diff.collectionsToDelete).toHaveLength(1);
      expect(detectDestructiveChanges(diff)).toHaveLength(0);

      // Not dropped when generating without --force
      const filtered = filterDiff(diff, { patterns: [], skipDestructive: true });
      expect(filtered.collectionsToDelete).toHaveLength(1);
    });
  });
});
