/**
 * Executes every captured native-PocketBase reference migration through the
 * engine and asserts the resulting state — including the constructs a text
 * scanner cannot handle (fields.addAt position, fields.removeById in down
 * bodies, unmarshal({indexes})).
 */

import * as fs from "fs";
import * as path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { convertPocketBaseCollection } from "../../pocketbase-converter";
import { CollectionStore } from "../store";
import { executeMigrationFile } from "../runner";

const FIXTURES_DIR = path.resolve(__dirname, "../../__tests__/fixtures/reference-migrations");

function fixtureFiles(): string[] {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".js"))
    .sort()
    .map((f) => path.join(FIXTURES_DIR, f));
}

describe("Reference fixture execution", () => {
  const store = new CollectionStore();

  beforeAll(() => {
    // The fixture set is self-contained: created_* fixtures define the
    // collections the updated_* fixtures then modify, in timestamp order
    for (const file of fixtureFiles()) {
      const result = executeMigrationFile(file, store);
      expect(result.applied).toBe(true);
    }
  });

  it("executes all reference fixtures without unsupported-API warnings", () => {
    // beforeAll already executed them; re-run on a fresh store to collect warnings
    const freshStore = new CollectionStore();
    const warnings = fixtureFiles().flatMap((file) => executeMigrationFile(file, freshStore).warnings);
    expect(warnings.filter((w) => w.kind === "unsupported-api")).toEqual([]);
  });

  it("reconstructs the full-columns collection with every field", () => {
    const collection = store.getByNameOrId("create_new_collection_with_columns");
    expect(collection).toBeDefined();
    expect(collection!.fields.length).toBe(16);
    const types = new Set(collection!.fields.map((f) => f.type));
    for (const type of ["text", "number", "bool", "email", "url", "date", "select", "json", "file", "relation"]) {
      expect(types).toContain(type);
    }
  });

  it("applies addAt at the correct position (updated_edit_collection_add_field)", () => {
    const collection = store.getByNameOrId("pbc_2980259303")!;
    const added = collection.fields.getById("text983189258");

    expect(added).toBeDefined();
    expect(added!.name).toBe("add_text_column");
    // addAt(1, ...) — position must be preserved, not appended at the end
    expect(collection.fields.at(1)!.id).toBe("text983189258");
  });

  it("applies unmarshal({indexes}) and addAt (updated_edit_collection_add_index)", () => {
    const collection = store.getByNameOrId("pbc_1780811710")!;

    expect(collection.indexes).toEqual([
      "CREATE INDEX `idx_gSNqhBRErC` ON `edit_collection_add_index` (`add_number_column`)",
    ]);
    expect(collection.fields.at(1)!.id).toBe("number2384605670");
    expect(collection.fields.at(1)!.name).toBe("add_number_column");
  });

  it("reconstructs the unique-index collection", () => {
    const collection = store.getByNameOrId("create_new_collection_with_unique_index")!;
    expect(collection.indexes.some((idx: string) => idx.includes("CREATE UNIQUE INDEX"))).toBe(true);
  });

  it("reconstructs rule fixtures verbatim", () => {
    const unrestricted = store.getByNameOrId("create_new_collection_with_unrestricted_api_rules")!;
    expect(unrestricted.listRule).toBe("");

    const nullPerms = store.getByNameOrId("create_new_collection_with_null_permissions")!;
    expect(nullPerms.listRule).toBeNull();

    const restricted = store.getByNameOrId("create_new_collection_with_restricted_api_rules")!;
    expect(typeof restricted.listRule).toBe("string");
    expect(restricted.listRule!.length).toBeGreaterThan(0);
  });

  it("reconstructs the auth collection with its system fields", () => {
    const auth = store.getByNameOrId("test_auth_users")!;
    expect(auth.type).toBe("auth");
    for (const name of ["email", "password", "tokenKey", "emailVisibility", "verified"]) {
      expect(auth.fields.getByName(name), `auth system field ${name}`).toBeDefined();
    }
  });

  it("reconstructs the view collection with its query", () => {
    const view = store.getByNameOrId("view_collection")!;
    expect(view.type).toBe("view");
    expect(String(view.viewQuery).toUpperCase()).toContain("SELECT");
  });

  it("creates exactly one collection per creation fixture, convertible for the diff engine", () => {
    for (const file of fixtureFiles()) {
      if (!path.basename(file).includes("_created_")) {
        continue;
      }

      const engineStore = new CollectionStore();
      executeMigrationFile(file, engineStore);

      const created = engineStore.list();
      expect(created.length, path.basename(file)).toBe(1);

      // The reconstructed collection has to survive conversion into the model
      // the diff engine consumes, with its identity and user fields intact.
      // The converter drops PocketBase's own bookkeeping: a view's derived
      // fields and the id/created/updated system fields.
      const raw = created[0].serialize();
      const schema = convertPocketBaseCollection(raw);
      expect(schema.name, path.basename(file)).toBe(raw.name);
      expect(schema.type, path.basename(file)).toBe(raw.type);
      expect(schema.indexes ?? [], path.basename(file)).toEqual(raw.indexes ?? []);

      if (raw.type !== "view") {
        const userFields = (raw.fields ?? [])
          .filter((f: any) => !f.system && !["id", "created", "updated"].includes(f.name))
          .map((f: any) => f.name);
        expect(schema.fields.map((f) => f.name), path.basename(file)).toEqual(
          expect.arrayContaining(userFields)
        );
      }
    }
  });
});
