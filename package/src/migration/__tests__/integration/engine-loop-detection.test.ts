/**
 * Engine-based Migration Loop Detection Tests
 *
 * The execution-engine variant of migration-loop-detection.test.ts: instead
 * of statically parsing generated migrations back into a snapshot, the
 * generated files are EXECUTED in the simulated PocketBase JSVM and the
 * resulting state is compared against the original schema.
 *
 * The contract is identical: schema -> generate -> reconstruct -> compare
 * must detect zero changes, otherwise `generate` followed by `status` would
 * loop forever proposing the same migration.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { compare } from "../../diff";
import { replayMigrations } from "../../engine";
import { generate } from "../../generator";
import type { CollectionSchema, SchemaDefinition } from "../../types";

describe("Engine-based Migration Loop Detection", () => {
  const tempDir = path.join(os.tmpdir(), "engine-loop-test-" + Date.now());
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

  function createSchemaDefinition(...collectionSchemas: CollectionSchema[]): SchemaDefinition {
    const collections = new Map<string, CollectionSchema>([["users", usersStub]]);
    for (const schema of collectionSchemas) {
      collections.set(schema.name, schema);
    }
    return { collections };
  }

  /**
   * Generates migrations for a schema (empty database), EXECUTES them
   * through the engine, and re-compares. Returns the second diff.
   */
  function roundTripViaExecution(...collectionSchemas: CollectionSchema[]) {
    const originalSchema = createSchemaDefinition(...collectionSchemas);

    const diff = compare(originalSchema, null);
    expect(diff.collectionsToCreate.length).toBeGreaterThan(0);

    const generatedPaths = generate(diff, tempDir);
    generatedFiles.push(...generatedPaths);
    expect(generatedPaths.length).toBeGreaterThan(0);

    // Execute every generated file in order (creation order is dependency-sorted)
    const replay = replayMigrations(generatedPaths);
    const snapshot = replay.snapshot;

    // Mirror the static loop-detection test: the users stub in the schema is
    // a placeholder, not a full auth collection — normalize it on both sides
    snapshot.collections.set("users", usersStub);

    const diffAfterExecution = compare(originalSchema, snapshot);
    return { diffAfterExecution, generatedPaths, replay };
  }

  function assertIdempotent(testName: string, ...collectionSchemas: CollectionSchema[]) {
    const { diffAfterExecution, generatedPaths } = roundTripViaExecution(...collectionSchemas);

    const success =
      diffAfterExecution.collectionsToCreate.length === 0 &&
      diffAfterExecution.collectionsToModify.length === 0 &&
      diffAfterExecution.collectionsToDelete.length === 0;

    if (!success) {
      console.error(`\n=== Engine Migration Loop Detected: ${testName} ===`);
      console.error("Generated migrations:");
      for (const file of generatedPaths) {
        console.error(`--- ${path.basename(file)} ---`);
        console.error(fs.readFileSync(file, "utf-8").substring(0, 2000));
      }
      console.error("Detected diff:", JSON.stringify(diffAfterExecution, null, 2));
    }

    expect(success, `${testName}: engine round-trip must detect zero changes`).toBe(true);
  }

  it("simple text collection", () => {
    assertIdempotent("simple text", {
      name: "posts",
      type: "base",
      fields: [{ name: "title", id: "text0000000001", type: "text", required: true, options: { max: 200 } }],
    });
  });

  it("text options and patterns", () => {
    assertIdempotent("text options", {
      name: "articles",
      type: "base",
      fields: [
        { name: "slug", id: "text0000000002", type: "text", required: true, options: { min: 3, max: 60, pattern: "^[a-z0-9-]+$" } },
        { name: "summary", id: "text0000000003", type: "text", required: false },
      ],
    });
  });

  it("select field with values", () => {
    assertIdempotent("select", {
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

  it("relation to users", () => {
    assertIdempotent("relation to users", {
      name: "projects",
      type: "base",
      fields: [
        { name: "name", id: "text0000000004", type: "text", required: true },
        {
          name: "owner",
          id: "relation0000001",
          type: "relation",
          required: true,
          relation: { collection: "users", cascadeDelete: true, maxSelect: 1 },
        },
      ],
    });
  });

  it("relation between two custom collections", () => {
    assertIdempotent(
      "relation between collections",
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
    assertIdempotent("indexes", {
      name: "tags",
      type: "base",
      fields: [{ name: "label", id: "text0000000007", type: "text", required: true }],
      indexes: ["CREATE UNIQUE INDEX `idx_tags_label` ON `tags` (`label`)"],
    });
  });

  it("rules and permissions", () => {
    // The analyzer emits both `rules` and `permissions` (same values) —
    // mirror that shape here
    const rules = {
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: null,
      deleteRule: null,
    };
    assertIdempotent("rules", {
      name: "notes",
      type: "base",
      fields: [{ name: "body", id: "text0000000008", type: "text", required: false }],
      rules,
      permissions: { ...rules },
    });
  });

  it("view collection", () => {
    const rules = { listRule: "", viewRule: "" };
    assertIdempotent("view", {
      name: "post_stats",
      type: "view",
      fields: [],
      viewQuery: "SELECT posts.id AS id, COUNT(*) AS total FROM posts GROUP BY posts.id",
      rules,
      permissions: { ...rules },
    });
  });

  it("create followed by modify (multi-file sequence)", () => {
    // Step 1: initial schema, generated and executed
    const v1: CollectionSchema = {
      name: "docs",
      type: "base",
      fields: [{ name: "title", id: "text0000000009", type: "text", required: true, options: { max: 100 } }],
    };
    const { replay } = roundTripViaExecution(v1);

    // Step 2: evolve the schema — change an option, add a field, add an index
    const v2: CollectionSchema = {
      ...v1,
      fields: [
        { name: "title", id: "text0000000009", type: "text", required: true, options: { max: 250 } },
        { name: "body", id: "text0000000010", type: "text", required: false },
      ],
      indexes: ["CREATE INDEX `idx_docs_title` ON `docs` (`title`)"],
    };
    const schemaV2 = createSchemaDefinition(v2);

    const snapshotV1 = replay.store.toSnapshot();
    snapshotV1.collections.set("users", usersStub);
    const diffV2 = compare(schemaV2, snapshotV1);
    expect(diffV2.collectionsToModify.length).toBe(1);

    const modificationPaths = generate(diffV2, tempDir);
    generatedFiles.push(...modificationPaths);
    expect(modificationPaths.length).toBeGreaterThan(0);

    // Step 3: execute the modification migrations on top of the v1 state
    const replayV2 = replayMigrations(modificationPaths, { initialStore: replay.store });
    const snapshotV2 = replayV2.snapshot;
    snapshotV2.collections.set("users", usersStub);

    // Step 4: the evolved schema and the executed state must now agree
    const finalDiff = compare(schemaV2, snapshotV2);
    expect(finalDiff.collectionsToCreate).toEqual([]);
    expect(finalDiff.collectionsToDelete).toEqual([]);
    if (finalDiff.collectionsToModify.length > 0) {
      console.error("Unexpected modifications:", JSON.stringify(finalDiff.collectionsToModify, null, 2));
    }
    expect(finalDiff.collectionsToModify).toEqual([]);
  });
});
