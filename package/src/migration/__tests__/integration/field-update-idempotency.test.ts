import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compare } from "../../diff";
import { generate } from "../../generator";
import { parseMigrationOperations } from "../../migration-parser";
import { applyMigrationOperations } from "../../snapshot";
import type { SchemaDefinition, SchemaSnapshot } from "../../types";

describe("Field Update Idempotency Integration Tests", () => {
  const tempDir = path.join(os.tmpdir(), "field-update-test-" + Date.now());

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

  it("should not generate duplicate migrations for NumberField min:1 change and SelectField value expansion", async () => {
    const emptySnapshot: SchemaSnapshot = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      collections: new Map(),
    };

    // 1. Initial State: Create collection with NumberField (min: 1) and SelectField (initial values)
    const schema1: SchemaDefinition = {
      collections: new Map([
        [
          "test_collection",
          {
            name: "test_collection",
            id: "test_collection_id",
            type: "base",
            fields: [
              {
                name: "count",
                id: "count_id",
                type: "number",
                required: false,
                options: { min: 1 },
              },
              {
                name: "status",
                id: "status_id",
                type: "select",
                required: false,
                options: {
                  values: ["original", "proxy", "thumbnail", "sprite", "labels_json", "render"],
                  maxSelect: 1,
                },
              },
            ],
          },
        ],
      ]),
    };

    // Step 1: Generate initial migration
    const diff1 = compare(schema1, null);
    const paths1 = generate(diff1, { migrationDir: tempDir });
    expect(paths1).toHaveLength(1);

    // Apply Step 1 to get baseline snapshot
    const content1 = fs.readFileSync(paths1[0], "utf-8");
    const ops1 = parseMigrationOperations(content1);
    const snapshot1 = applyMigrationOperations(emptySnapshot, ops1);

    // 2. Update State: NumberField (min: undefined) and SelectField (added "filmstrip")
    const schema2: SchemaDefinition = {
      collections: new Map([
        [
          "test_collection",
          {
            name: "test_collection",
            id: "test_collection_id",
            type: "base",
            fields: [
              {
                name: "count",
                id: "count_id",
                type: "number",
                required: false,
                options: { min: undefined }, // min: 1 -> undefined
              },
              {
                name: "status",
                id: "status_id",
                type: "select",
                required: false,
                options: {
                  values: ["original", "proxy", "thumbnail", "sprite", "labels_json", "render", "filmstrip"],
                  maxSelect: 1,
                },
              },
            ],
          },
        ],
      ]),
    };

    // Step 2: Generate update migration
    const snapshot1Copy = JSON.parse(
      JSON.stringify({
        ...snapshot1,
        collections: Array.from(snapshot1.collections.entries()),
      })
    );
    // Re-reconstruct map
    const snapshot1Fixed: SchemaSnapshot = {
      ...snapshot1Copy,
      collections: new Map(snapshot1Copy.collections),
    };

    const diff2 = compare(schema2, snapshot1Fixed);
    const paths2 = generate(diff2, { migrationDir: tempDir });
    expect(paths2).toHaveLength(1);

    // Apply Step 2 to get updated snapshot
    const content2 = fs.readFileSync(paths2[0], "utf-8");
    const ops2 = parseMigrationOperations(content2);
    const snapshot2 = applyMigrationOperations(snapshot1Fixed, ops2);

    // 3. Final Check: Should have NO more changes
    const diff3 = compare(schema2, snapshot2);

    const totalChanges =
      diff3.collectionsToCreate.length + diff3.collectionsToDelete.length + diff3.collectionsToModify.length;

    if (totalChanges > 0) {
      console.log("Migration 2 Content:\n", content2);
      console.log("Parsed Ops 2:\n", JSON.stringify(ops2, null, 2));
      console.log("Final Diff Details:\n", JSON.stringify(diff3.collectionsToModify[0]?.fieldsToModify, null, 2));
    }

    expect(totalChanges).toBe(0);

    const paths3 = generate(diff3, { migrationDir: tempDir });
    expect(paths3).toHaveLength(0);
  });
});
