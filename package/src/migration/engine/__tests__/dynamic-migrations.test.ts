/**
 * The motivating cases for the execution engine: migrations that use loops,
 * helper functions, conditionals, variable indirection, and computed values.
 * No amount of reading the file text reconstructs these — the fields and
 * collection names only exist once the code has run.
 */

import * as fs from "fs";
import * as path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { replayMigrations } from "../replayer";
import type { CollectionStore } from "../store";

const FIXTURES_DIR = path.resolve(__dirname, "../../__tests__/fixtures/dynamic-migrations");

function fixtureFiles(): string[] {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".js"))
    .sort()
    .map((f) => path.join(FIXTURES_DIR, f));
}

describe("Dynamic migration execution", () => {
  let store: CollectionStore;

  beforeAll(() => {
    store = replayMigrations(fixtureFiles()).store;
  });

  it("for-loop with computed names and options (loop_add_fields)", () => {
    const collection = store.getByNameOrId("dynamic_loop")!;
    // step_2 and step_4 are later removed by the remove_by_id fixture
    expect(collection.fields.map((f) => f.name)).toEqual(["id", "step_1", "step_3", "step_5"]);
    expect(collection.fields.getByName("step_3")!.max).toBe(30);
    expect(collection.fields.getByName("step_5")!.required).toBe(true);
  });

  it("forEach over data-driven field definitions (foreach_field_defs)", () => {
    const collection = store.getByNameOrId("dynamic_foreach")!;
    expect(collection.fields.map((f) => `${f.name}:${f.type}`)).toEqual([
      "title:text",
      "views:number",
      "published:bool",
    ]);
    expect(collection.fields.getByName("title")!.required).toBe(true);
  });

  it("helper function constructing fields (helper_function)", () => {
    const collection = store.getByNameOrId("dynamic_helper")!;
    expect(collection.fields.getByName("summary")!.max).toBe(280);
    expect(collection.fields.getByName("body")!.max).toBe(5000);
  });

  it("conditional field inclusion (conditional_add)", () => {
    const collection = store.getByNameOrId("dynamic_conditional")!;
    expect(collection.fields.getByName("audit_note")).toBeDefined();
    expect(collection.fields.getByName("legacy_field")).toBeNull();
  });

  it("variable indirection with Object.assign (variable_indirection)", () => {
    const collection = store.getByNameOrId("dynamic_indirect")!;
    const field = collection.fields.getByName("indirect_title")!;
    expect(field.required).toBe(true);
    expect(field.max).toBe(120);
  });

  it("removeById in the up body (remove_by_id)", () => {
    const collection = store.getByNameOrId("dynamic_loop")!;
    expect(collection.fields.getById("text_step_2")).toBeNull();
    expect(collection.fields.getById("text_step_4")).toBeNull();
  });

  it("computed unmarshal payload (computed_unmarshal)", () => {
    const collection = store.getByNameOrId("dynamic_foreach")!;
    expect(collection.listRule).toBe("@request.auth.id != ''");
    expect(collection.viewRule).toBe("@request.auth.id != ''");
    expect(collection.indexes).toEqual(["CREATE INDEX `idx_dynamic_foreach_title` ON `dynamic_foreach` (`title`)"]);
  });

  it("one migration creating several collections from data (bulk_collections)", () => {
    for (const name of ["bulk_alpha", "bulk_beta", "bulk_gamma"]) {
      const collection = store.getByNameOrId(name)!;
      expect(collection, name).toBeDefined();
      expect(collection.fields.getByName("label")!.max).toBe(64);
    }
  });

  it("converts to a snapshot the diff engine can consume", () => {
    const snapshot = store.toSnapshot();
    expect(snapshot.collections.get("dynamic_loop")!.fields.map((f) => f.name)).toEqual([
      "step_1",
      "step_3",
      "step_5",
    ]);
  });
});
