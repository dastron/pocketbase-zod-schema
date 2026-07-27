/**
 * Native PocketBase snapshot migrations (app.importCollections) executed
 * through the engine, which is the only reader for them: the state has to come
 * out in the format the diff engine consumes, and importCollections has to
 * honour its deleteMissing flag.
 */

import * as path from "path";
import { describe, expect, it } from "vitest";
import { replayMigrations } from "../replayer";
import { executeMigrationSource } from "../runner";

const FIXTURE = path.resolve(__dirname, "../../__tests__/fixtures/native-snapshot-trimmed.js");

describe("Snapshot migration execution", () => {
  it("imports every collection in the snapshot array", () => {
    const snapshot = replayMigrations([FIXTURE]).snapshot;

    expect([...snapshot.collections.keys()].sort()).toEqual(["article_stats", "articles", "users"]);

    const articles = snapshot.collections.get("articles")!;
    expect(articles.type).toBe("base");
    expect(articles.fields.map((f) => f.name)).toContain("title");

    const users = snapshot.collections.get("users")!;
    expect(users.type).toBe("auth");
    expect(users.id).toBe("_pb_users_auth_");

    // A view's fields are derived by PocketBase from its query, so the
    // converted form carries the query and no fields
    const stats = snapshot.collections.get("article_stats")!;
    expect(stats.type).toBe("view");
    expect(String(stats.viewQuery).toUpperCase()).toContain("SELECT");
    expect(stats.fields).toEqual([]);
  });

  it("importCollections with deleteMissing removes collections absent from the import", () => {
    const store = replayMigrations([FIXTURE]).store;
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
