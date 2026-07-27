/**
 * Anything the generator writes, the engine must be able to read back.
 *
 * This drives the whole loop through the real funnel: generate migrations for
 * every construct the generator emits, reconstruct the state by executing them
 * with loadSnapshotWithMigrations(), and require that reconstructed state to
 * produce no follow-up migration. A construct the engine misreads shows up
 * here as a phantom diff — which in production is the "db:generate emits the
 * same migration forever" bug.
 *
 * Constructs covered: create base/auth/view collections, field add/remove/
 * update, index add/remove, rule updates, view query updates, collection
 * deletes — all on top of a native PocketBase snapshot file.
 *
 * The other two migration sources have their own suites:
 * - PocketBase-authored reference migrations -> engine/__tests__/reference-fixtures.test.ts
 * - native snapshot files                    -> engine/__tests__/snapshot-execution.test.ts
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compare } from "../../diff";
import { generate } from "../../generator";
import { loadSnapshotWithMigrations } from "../../snapshot";
import type { CollectionSchema, SchemaSnapshot } from "../../types";
import {
  CreateAuthCollectionWithManageRuleSchema,
  CreateCollectionWithColumnsSchema,
  CreateCollectionWithUniqueIndexSchema,
  CreateViewCollectionSchema,
} from "../fixtures/schemas";

const SNAPSHOT_FIXTURE = path.resolve(__dirname, "../fixtures/native-snapshot-trimmed.js");

/**
 * Projects a collection down to the parts the diff engine consumes, so
 * assertions are about what actually drives generation (field ids and ordering
 * are engine implementation details).
 */
function diffRelevantView(collection: CollectionSchema) {
  const rules = collection.rules ?? collection.permissions ?? {};
  return {
    type: collection.type,
    fields: [...collection.fields]
      .map((field) => ({
        name: field.name,
        type: field.type,
        required: field.required ?? false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    indexes: [...(collection.indexes ?? [])].sort(),
    viewQuery: collection.viewQuery ? collection.viewQuery.replace(/\s+/g, " ").trim() : undefined,
    rules: {
      listRule: rules.listRule ?? null,
      viewRule: rules.viewRule ?? null,
      createRule: rules.createRule ?? null,
      updateRule: rules.updateRule ?? null,
      deleteRule: rules.deleteRule ?? null,
      manageRule: rules.manageRule ?? null,
    },
  };
}

function cloneCollections(snapshot: SchemaSnapshot): Map<string, CollectionSchema> {
  return structuredClone(snapshot.collections);
}

describe("Generated migrations replay back to the state that produced them", () => {
  let migrationsDir: string;
  /** What round 2 asked for — the state replay has to reproduce */
  let desiredFinalState: Map<string, CollectionSchema>;

  beforeAll(() => {
    migrationsDir = fs.mkdtempSync(path.join(os.tmpdir(), "generated-migration-replay-"));
    fs.copyFileSync(SNAPSHOT_FIXTURE, path.join(migrationsDir, "1700000000_collections_snapshot.js"));

    // Round 1: create one collection of every type the generator emits
    // (base with every field class + indexes + rules, auth with manageRule,
    // view with a SQL query)
    const state0 = loadSnapshotWithMigrations({ migrationsPath: migrationsDir })!;
    const desired1 = cloneCollections(state0);
    for (const schema of [
      CreateCollectionWithColumnsSchema,
      CreateCollectionWithUniqueIndexSchema,
      CreateAuthCollectionWithManageRuleSchema,
      CreateViewCollectionSchema,
    ]) {
      desired1.set(schema.name, structuredClone(schema));
    }

    const diff1 = compare({ collections: desired1 }, state0);
    expect(diff1.collectionsToCreate.length).toBe(4);
    let nextTimestamp = 1700000100;
    generate(diff1, { migrationDir: migrationsDir, timestampGenerator: () => String(nextTimestamp) });

    // Round 2: every update construct the generator emits, plus a delete
    const state1 = loadSnapshotWithMigrations({ migrationsPath: migrationsDir })!;
    const desired2 = cloneCollections(state1);

    const columns = desired2.get(CreateCollectionWithColumnsSchema.name)!;
    columns.fields.push({ id: "parity_added_text_id", name: "parity_added_text", type: "text", required: true });
    columns.fields = columns.fields.filter((field) => field.name !== "url_column");
    const numberField = columns.fields.find((field) => field.name === "number_column")!;
    numberField.options = { ...numberField.options, min: 5, max: 500 };
    columns.indexes = [
      ...(columns.indexes ?? []),
      "CREATE INDEX `idx_parity_added` ON `create_new_collection_with_columns` (`parity_added_text`)",
    ];
    columns.rules = { ...columns.rules, listRule: '@request.auth.id != ""' };
    columns.permissions = { ...columns.permissions, listRule: '@request.auth.id != ""' };

    const view = desired2.get(CreateViewCollectionSchema.name)!;
    view.viewQuery = [
      "SELECT p.id AS id,",
      "       p.title AS title,",
      "       p.number_column AS number_column",
      "  FROM create_new_collection_with_columns p",
    ].join("\n");

    desired2.delete(CreateCollectionWithUniqueIndexSchema.name);

    const diff2 = compare({ collections: desired2 }, state1);
    expect(diff2.collectionsToModify.length).toBe(2);
    expect(diff2.collectionsToDelete.length).toBe(1);
    nextTimestamp = 1700000200;
    generate(diff2, { migrationDir: migrationsDir, timestampGenerator: () => String(nextTimestamp) });

    desiredFinalState = desired2;
  });

  afterAll(() => {
    fs.rmSync(migrationsDir, { recursive: true, force: true });
  });

  it("reconstructs the state the migrations were generated for", () => {
    const state = loadSnapshotWithMigrations({ migrationsPath: migrationsDir })!;

    expect([...state.collections.keys()].sort()).toEqual([...desiredFinalState.keys()].sort());

    for (const [name, desired] of desiredFinalState) {
      expect(diffRelevantView(state.collections.get(name)!), name).toEqual(diffRelevantView(desired));
    }
  });

  it("produces no follow-up migration (idempotency)", () => {
    const state = loadSnapshotWithMigrations({ migrationsPath: migrationsDir })!;
    const followUp = compare({ collections: cloneCollections(state) }, state);

    expect(followUp.collectionsToCreate).toEqual([]);
    expect(followUp.collectionsToDelete).toEqual([]);
    expect(followUp.collectionsToModify).toEqual([]);
  });

  it("is stable across repeated reconstruction", () => {
    const first = loadSnapshotWithMigrations({ migrationsPath: migrationsDir })!;
    const second = loadSnapshotWithMigrations({ migrationsPath: migrationsDir })!;

    const followUp = compare({ collections: cloneCollections(first) }, second);
    expect(followUp.collectionsToCreate).toEqual([]);
    expect(followUp.collectionsToDelete).toEqual([]);
    expect(followUp.collectionsToModify).toEqual([]);
  });
});
