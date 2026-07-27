/**
 * Executes every captured native-PocketBase reference migration through the
 * engine and asserts the resulting state — including the constructs the
 * static parser cannot handle (fields.addAt position, fields.removeById in
 * down bodies, unmarshal({indexes})).
 *
 * For literal-only creation fixtures it additionally asserts parity: the
 * engine's reconstructed collection deep-equals what the static parser
 * extracts from the same file.
 */

import * as fs from "fs";
import * as path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseMigrationOperations } from "../../migration-parser";
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

  it("matches the static parser output for literal-only creation fixtures (parity)", () => {
    for (const file of fixtureFiles()) {
      if (!path.basename(file).includes("_created_")) {
        continue;
      }

      const content = fs.readFileSync(file, "utf-8");
      const operations = parseMigrationOperations(content);
      expect(operations.collectionsToCreate.length, path.basename(file)).toBe(1);
      const staticSchema = operations.collectionsToCreate[0];

      const engineStore = new CollectionStore();
      executeMigrationFile(file, engineStore);
      const engineCollection = engineStore.getByNameOrId(staticSchema.name);
      expect(engineCollection, path.basename(file)).toBeDefined();
      const engineSchema = convertPocketBaseCollection(engineCollection!.serialize());

      // Both paths must agree on the parts the diff engine consumes
      expect(engineSchema.name).toBe(staticSchema.name);
      expect(engineSchema.type).toBe(staticSchema.type);
      expect(engineSchema.fields.map((f) => f.name).sort()).toEqual(staticSchema.fields.map((f) => f.name).sort());
      for (const engineField of engineSchema.fields) {
        const staticField = staticSchema.fields.find((f) => f.name === engineField.name)!;
        expect(engineField.type, `${staticSchema.name}.${engineField.name} type`).toBe(staticField.type);
        expect(engineField.required ?? false, `${staticSchema.name}.${engineField.name} required`).toBe(
          staticField.required ?? false
        );
      }
      expect(engineSchema.indexes ?? []).toEqual(staticSchema.indexes ?? []);
    }
  });
});
