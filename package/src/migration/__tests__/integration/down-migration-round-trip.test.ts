/**
 * Down-migration round-trip tests for generated migrations
 *
 * `engine-loop-detection.test.ts` proves the forward contract (schema →
 * generate → execute → zero diff). This proves the reverse one: every
 * migration the generator writes must undo itself. Each scenario generates
 * migrations, executes `up()` against the state they were generated for,
 * then executes `down()` and asserts the state came back.
 *
 * A rollback that silently leaves fields, indexes or rules behind is
 * invisible until someone runs `pocketbase migrate down` on a real database,
 * so it is asserted here per generated file.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { compare } from "../../diff";
import { CollectionStore, verifyMigrationFiles, type MigrationRoundTripResult } from "../../engine";
import { generate } from "../../generator";
import type { CollectionSchema, SchemaDefinition, SchemaSnapshot } from "../../types";

describe("Generated down-migration round-trip", () => {
  const tempDir = path.join(os.tmpdir(), "down-round-trip-" + Date.now());
  let generatedFiles: string[] = [];

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    for (const file of generatedFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
    generatedFiles = [];
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const usersStub: CollectionSchema = { name: "users", id: "users_id", type: "auth", fields: [] };

  function schemaOf(...collectionSchemas: CollectionSchema[]): SchemaDefinition {
    const collections = new Map<string, CollectionSchema>([["users", usersStub]]);
    for (const schema of collectionSchemas) {
      collections.set(schema.name, schema);
    }
    return { collections };
  }

  function describeFailure(result: MigrationRoundTripResult): string {
    const header = `${path.basename(result.file)} did not return to its pre-migration state`;
    if (result.error) {
      return `${header}: ${result.error.phase}() failed — ${result.error.message}`;
    }
    return `${header}:\n  ${result.differences.map((difference) => difference.message).join("\n  ")}`;
  }

  function assertRoundTrips(results: MigrationRoundTripResult[]): void {
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.error, result.error && describeFailure(result)).toBeUndefined();
      expect(result.upApplied, `${path.basename(result.file)} up() must apply`).toBe(true);
      expect(result.downApplied, `${path.basename(result.file)} down() must apply`).toBe(true);
      expect(result.reversible, describeFailure(result)).toBe(true);
    }
  }

  /** Generates migrations for a schema against a baseline state and verifies them */
  function generateAndVerify(
    schema: SchemaDefinition,
    previous: SchemaSnapshot | null,
    baseline: CollectionStore
  ): { results: MigrationRoundTripResult[]; store: CollectionStore } {
    const diff = compare(schema, previous);
    const paths = generate(diff, tempDir);
    generatedFiles.push(...paths);
    expect(paths.length).toBeGreaterThan(0);

    const report = verifyMigrationFiles(paths, { initialStore: baseline });
    return { results: report.results, store: report.store };
  }

  function assertCreationRoundTrips(...collectionSchemas: CollectionSchema[]) {
    const { results } = generateAndVerify(schemaOf(...collectionSchemas), null, new CollectionStore());
    assertRoundTrips(results);
  }

  describe("collection creation rolls back to an empty database", () => {
    it("simple text collection", () => {
      assertCreationRoundTrips({
        name: "posts",
        type: "base",
        fields: [{ name: "title", id: "text0000000001", type: "text", required: true, options: { max: 200 } }],
      });
    });

    it("select field with values", () => {
      assertCreationRoundTrips({
        name: "tickets",
        type: "base",
        fields: [
          {
            name: "status",
            id: "select0000000001",
            type: "select",
            required: true,
            options: { values: ["open", "closed", "pending"], maxSelect: 1 },
          },
        ],
      });
    });

    it("relation between two custom collections", () => {
      assertCreationRoundTrips(
        {
          name: "authors",
          type: "base",
          fields: [{ name: "name", id: "text0000000005", type: "text", required: true }],
        },
        {
          name: "books",
          type: "base",
          fields: [
            { name: "title", id: "text0000000006", type: "text", required: true },
            {
              name: "author",
              id: "relation0000002",
              type: "relation",
              required: true,
              relation: { collection: "authors", cascadeDelete: false, maxSelect: 1 },
            },
          ],
        }
      );
    });

    it("indexes", () => {
      assertCreationRoundTrips({
        name: "tags",
        type: "base",
        fields: [{ name: "label", id: "text0000000007", type: "text", required: true }],
        indexes: ["CREATE UNIQUE INDEX `idx_tags_label` ON `tags` (`label`)"],
      });
    });

    it("rules and permissions", () => {
      const rules = {
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: null,
        deleteRule: null,
      };
      assertCreationRoundTrips({
        name: "notes",
        type: "base",
        fields: [{ name: "body", id: "text0000000008", type: "text", required: false }],
        rules,
        permissions: { ...rules },
      });
    });

    it("view collection", () => {
      const rules = { listRule: "", viewRule: "" };
      assertCreationRoundTrips({
        name: "post_stats",
        type: "view",
        fields: [],
        viewQuery: "SELECT posts.id AS id, COUNT(*) AS total FROM posts GROUP BY posts.id",
        rules,
        permissions: { ...rules },
      });
    });
  });

  describe("collection modification rolls back to the previous state", () => {
    /**
     * Creates v1, executes it, then generates the v1 -> v2 migration and
     * round-trips only that migration against the v1 state.
     */
    function assertModificationRoundTrips(v1: CollectionSchema, v2: CollectionSchema) {
      const creation = generateAndVerify(schemaOf(v1), null, new CollectionStore());
      assertRoundTrips(creation.results);

      const snapshotV1 = creation.store.toSnapshot();
      snapshotV1.collections.set("users", usersStub);

      const modification = generateAndVerify(schemaOf(v2), snapshotV1, creation.store);
      assertRoundTrips(modification.results);
    }

    const base: CollectionSchema = {
      name: "docs",
      type: "base",
      fields: [
        { name: "title", id: "text0000000009", type: "text", required: true, options: { max: 100 } },
        { name: "legacy", id: "text0000000011", type: "text", required: false },
      ],
      indexes: ["CREATE INDEX `idx_docs_legacy` ON `docs` (`legacy`)"],
    };

    it("added field", () => {
      assertModificationRoundTrips(base, {
        ...base,
        fields: [...base.fields, { name: "body", id: "text0000000010", type: "text", required: false }],
      });
    });

    it("removed field", () => {
      assertModificationRoundTrips(base, {
        ...base,
        fields: base.fields.filter((field) => field.name !== "legacy"),
        indexes: [],
      });
    });

    it("modified field option", () => {
      assertModificationRoundTrips(base, {
        ...base,
        fields: [
          { name: "title", id: "text0000000009", type: "text", required: true, options: { max: 250 } },
          ...base.fields.slice(1),
        ],
      });
    });

    it("added index", () => {
      assertModificationRoundTrips(base, {
        ...base,
        indexes: [...base.indexes!, "CREATE INDEX `idx_docs_title` ON `docs` (`title`)"],
      });
    });

    it("removed index", () => {
      assertModificationRoundTrips(base, { ...base, indexes: [] });
    });

    it("updated rules", () => {
      const rules = { listRule: "@request.auth.id != ''", viewRule: "@request.auth.id != ''" };
      assertModificationRoundTrips(
        { ...base, rules: {}, permissions: {} },
        { ...base, rules, permissions: { ...rules } }
      );
    });

    it("updated view query", () => {
      const view: CollectionSchema = {
        name: "doc_stats",
        type: "view",
        fields: [],
        viewQuery: "SELECT docs.id AS id, COUNT(*) AS total FROM docs GROUP BY docs.id",
        rules: { listRule: "", viewRule: "" },
        permissions: { listRule: "", viewRule: "" },
      };
      assertModificationRoundTrips(view, {
        ...view,
        viewQuery: "SELECT docs.id AS id, COUNT(*) AS total, MAX(docs.title) AS latest FROM docs GROUP BY docs.id",
      });
    });
  });

  describe("collection deletion rolls back by recreating the collection", () => {
    it("restores a deleted collection", () => {
      const collection: CollectionSchema = {
        name: "temporary",
        type: "base",
        fields: [{ name: "note", id: "text0000000012", type: "text", required: false }],
      };

      const creation = generateAndVerify(schemaOf(collection), null, new CollectionStore());
      assertRoundTrips(creation.results);

      const snapshot = creation.store.toSnapshot();
      snapshot.collections.set("users", usersStub);

      // Deleting is destructive, so the diff has to be taken with the
      // collection gone from the schema entirely
      const deletion = generateAndVerify(schemaOf(), snapshot, creation.store);
      assertRoundTrips(deletion.results);
    });
  });
});
