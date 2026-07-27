/**
 * Engine parity: the runtime execution engine and the deprecated static
 * parser must reconstruct the same state for every fixture class the static
 * parser supports. This is the removal blocker tracked in
 * docs/EXECUTION_ENGINE_ROADMAP.md #1 — once these suites pass, deleting
 * migration-parser.ts cannot change the state reconstructed from
 * generator-emitted migrations.
 *
 * Where each fixture class's parity lives:
 * - created_* reference fixtures  -> engine/__tests__/reference-fixtures.test.ts
 * - native snapshot files         -> engine/__tests__/snapshot-execution.test.ts
 * - library-generated migrations  -> here, through the full
 *   loadSnapshotWithMigrations funnel (create base/auth/view, field
 *   add/remove/update, index add/remove, rule updates, view query updates,
 *   collection deletes)
 * - updated_* reference fixtures  -> here, pinned as a KNOWN DIVERGENCE:
 *   PocketBase-authored updates address collections by id, which the static
 *   parser resolves as a name and silently drops. The engine applies them
 *   (asserted against ground truth in reference-fixtures.test.ts), so removal
 *   only makes this class more correct.
 * - dynamic fixtures              -> deliberately no parity: the static
 *   parser cannot read them (snapshot-engine.test.ts asserts the divergence)
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compare } from "../../diff";
import { replayMigrations } from "../../engine/replayer";
import { generate } from "../../generator";
import { parseMigrationOperations } from "../../migration-parser";
import {
  __resetStaticEngineDeprecationWarning,
  applyMigrationOperations,
  loadSnapshotWithMigrations,
} from "../../snapshot";
import type { CollectionSchema, SchemaSnapshot } from "../../types";
import {
  CreateAuthCollectionWithManageRuleSchema,
  CreateCollectionWithColumnsSchema,
  CreateCollectionWithUniqueIndexSchema,
  CreateViewCollectionSchema,
} from "../fixtures/schemas";

const SNAPSHOT_FIXTURE = path.resolve(__dirname, "../fixtures/native-snapshot-trimmed.js");
const REFERENCE_DIR = path.resolve(__dirname, "../fixtures/reference-migrations");

/**
 * Projects a collection down to the parts the diff engine consumes, so the
 * two reconstruction paths are compared on what actually drives generation
 * (field ids and ordering are engine implementation details).
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

describe("Generated-migration parity: static vs runtime engine", () => {
  let migrationsDir: string;

  beforeAll(() => {
    __resetStaticEngineDeprecationWarning();
    migrationsDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-parity-"));
    fs.copyFileSync(SNAPSHOT_FIXTURE, path.join(migrationsDir, "1700000000_collections_snapshot.js"));

    // Round 1: create one collection of every type the generator emits
    // (base with every field class + indexes + rules, auth with manageRule,
    // view with a SQL query)
    const state0 = loadSnapshotWithMigrations({ migrationsPath: migrationsDir, engine: "runtime" })!;
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
    const state1 = loadSnapshotWithMigrations({ migrationsPath: migrationsDir, engine: "runtime" })!;
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
  });

  afterAll(() => {
    fs.rmSync(migrationsDir, { recursive: true, force: true });
  });

  it("both engines reconstruct the same diff-relevant state", () => {
    const staticState = loadSnapshotWithMigrations({ migrationsPath: migrationsDir, engine: "static" })!;
    const runtimeState = loadSnapshotWithMigrations({ migrationsPath: migrationsDir, engine: "runtime" })!;

    expect([...staticState.collections.keys()].sort()).toEqual([...runtimeState.collections.keys()].sort());

    for (const [name, runtimeCollection] of runtimeState.collections) {
      const staticCollection = staticState.collections.get(name)!;
      expect(diffRelevantView(staticCollection), name).toEqual(diffRelevantView(runtimeCollection));
    }
  });

  it("neither engine's reconstruction produces a follow-up migration (idempotency)", () => {
    const runtimeState = loadSnapshotWithMigrations({ migrationsPath: migrationsDir, engine: "runtime" })!;
    const desired = { collections: cloneCollections(runtimeState) };

    for (const engine of ["static", "runtime"] as const) {
      const state = loadSnapshotWithMigrations({ migrationsPath: migrationsDir, engine })!;
      const followUp = compare(desired, state);
      expect(followUp.collectionsToCreate, `${engine}: creates`).toEqual([]);
      expect(followUp.collectionsToDelete, `${engine}: deletes`).toEqual([]);
      expect(followUp.collectionsToModify, `${engine}: modifications`).toEqual([]);
    }
  });
});

describe("updated_* reference fixture divergence (pinned)", () => {
  // PocketBase-authored update migrations call
  // app.findCollectionByNameOrId("pbc_...") with a bare id. The static parser
  // records the id as a collection *name*, so applyMigrationOperations cannot
  // find the target and drops the whole update. This pin documents the loss;
  // if the static path ever starts resolving ids, strict parity should be
  // asserted here instead.
  function staticReferenceState(): SchemaSnapshot {
    let snapshot: SchemaSnapshot = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      collections: new Map(),
    };

    for (const file of fs
      .readdirSync(REFERENCE_DIR)
      .filter((f) => f.endsWith(".js"))
      .sort()) {
      const operations = parseMigrationOperations(fs.readFileSync(path.join(REFERENCE_DIR, file), "utf-8"));
      snapshot = applyMigrationOperations(snapshot, operations);
    }
    return snapshot;
  }

  function engineReferenceState(): SchemaSnapshot {
    const files = fs
      .readdirSync(REFERENCE_DIR)
      .filter((f) => f.endsWith(".js"))
      .sort()
      .map((f) => path.join(REFERENCE_DIR, f));
    return replayMigrations(files).snapshot;
  }

  it("static drops id-addressed updates that the engine applies", () => {
    const staticState = staticReferenceState();
    const engineState = engineReferenceState();

    // Same collections exist on both sides (creations are literal-only)
    expect([...staticState.collections.keys()].sort()).toEqual([...engineState.collections.keys()].sort());

    // updated_edit_collection_add_field: the engine has the added field,
    // the static path lost it
    const engineWithField = engineState.collections.get("edit_collection_add_field")!;
    const staticWithField = staticState.collections.get("edit_collection_add_field")!;
    expect(engineWithField.fields.map((f) => f.name)).toContain("add_text_column");
    expect(staticWithField.fields.map((f) => f.name)).not.toContain("add_text_column");

    // updated_edit_collection_add_index: the engine has the field and the
    // index, the static path lost both
    const engineWithIndex = engineState.collections.get("edit_collection_add_index")!;
    const staticWithIndex = staticState.collections.get("edit_collection_add_index")!;
    expect(engineWithIndex.fields.map((f) => f.name)).toContain("add_number_column");
    expect(engineWithIndex.indexes ?? []).toHaveLength(1);
    expect(staticWithIndex.fields.map((f) => f.name)).not.toContain("add_number_column");
    expect(staticWithIndex.indexes ?? []).toHaveLength(0);
  });

  it("collections untouched by updates agree on the diff-relevant state", () => {
    const staticState = staticReferenceState();
    const engineState = engineReferenceState();
    const updatedByFixtures = new Set(["edit_collection_add_field", "edit_collection_add_index"]);

    for (const [name, engineCollection] of engineState.collections) {
      if (updatedByFixtures.has(name)) {
        continue;
      }
      const staticCollection = staticState.collections.get(name)!;
      expect(diffRelevantView(staticCollection), name).toEqual(diffRelevantView(engineCollection));
    }
  });
});
