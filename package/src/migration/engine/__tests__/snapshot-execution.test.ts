/**
 * Executing a native snapshot migration (app.importCollections) through the
 * engine must produce the same SchemaSnapshot as the legacy regex extraction
 * in convertPocketBaseMigration — the two state-reconstruction paths have to
 * agree on the format the diff engine consumes.
 */

import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { convertPocketBaseMigration } from "../../pocketbase-converter";
import { replayMigrations } from "../replayer";
import { executeMigrationSource } from "../runner";

const FIXTURE = path.resolve(__dirname, "../../__tests__/fixtures/native-snapshot-trimmed.js");

describe("Snapshot migration execution", () => {
  it("engine execution matches the regex-based converter output", () => {
    const staticSnapshot = convertPocketBaseMigration(fs.readFileSync(FIXTURE, "utf-8"));
    const engineSnapshot = replayMigrations([FIXTURE]).snapshot;

    expect([...engineSnapshot.collections.keys()].sort()).toEqual([...staticSnapshot.collections.keys()].sort());

    for (const [name, staticCollection] of staticSnapshot.collections) {
      const engineCollection = engineSnapshot.collections.get(name)!;

      expect(engineCollection.type, `${name} type`).toBe(staticCollection.type);
      expect(engineCollection.id, `${name} id`).toBe(staticCollection.id);
      expect(engineCollection.fields, `${name} fields`).toEqual(staticCollection.fields);
      expect(engineCollection.indexes, `${name} indexes`).toEqual(staticCollection.indexes);
      expect(engineCollection.rules, `${name} rules`).toEqual(staticCollection.rules);
      expect(engineCollection.viewQuery, `${name} viewQuery`).toEqual(staticCollection.viewQuery);
    }
  });

  it("importCollections with deleteMissing removes collections absent from the import", () => {
    const replay = replayMigrations([FIXTURE]);
    const store = replay.store;
    expect(store.getByNameOrId("articles")).toBeDefined();

    // A second snapshot containing only users, with deleteMissing=true
    const followUp = `
      migrate((app) => {
        return app.importCollections([
          { id: "_pb_users_auth_", name: "users", type: "auth", fields: [] }
        ], true);
      }, (app) => null);
    `;
    executeMigrationSource(followUp, store, { filename: "follow-up.js" });

    expect(store.getByNameOrId("articles")).toBeUndefined();
    expect(store.getByNameOrId("users")).toBeDefined();
  });
});
