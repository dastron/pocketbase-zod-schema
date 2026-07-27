/**
 * loadSnapshotWithMigrations behavior:
 * - migrations are executed, so dynamic constructs are applied
 * - a migration that cannot be executed fails hard, naming the file, rather
 *   than being skipped into silent state drift
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SnapshotError } from "../errors";
import { loadSnapshotWithMigrations } from "../snapshot";

const SNAPSHOT_FIXTURE = path.resolve(__dirname, "fixtures/native-snapshot-trimmed.js");

const LOOP_MIGRATION = `migrate((app) => {
  const collection = app.findCollectionByNameOrId("articles");
  for (let i = 1; i <= 3; i++) {
    collection.fields.add(new TextField({ id: "text_extra_" + i, name: "extra_" + i }));
  }
  return app.save(collection);
}, (app) => null);`;

const BROKEN_MIGRATION = `migrate((app) => {
  const collection = app.findCollectionByNameOrId("this_collection_does_not_exist");
  return app.save(collection);
}, (app) => null);`;

describe("loadSnapshotWithMigrations", () => {
  let migrationsDir: string;

  beforeEach(() => {
    migrationsDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-engine-test-"));
    fs.copyFileSync(SNAPSHOT_FIXTURE, path.join(migrationsDir, "1700000000_collections_snapshot.js"));
  });

  afterEach(() => {
    fs.rmSync(migrationsDir, { recursive: true, force: true });
  });

  it("reconstructs state from a native snapshot", () => {
    const snapshot = loadSnapshotWithMigrations({ migrationsPath: migrationsDir });

    expect(snapshot).not.toBeNull();
    expect([...snapshot!.collections.keys()].sort()).toEqual(["article_stats", "articles", "users"]);
  });

  it("applies dynamic (loop-based) migrations", () => {
    fs.writeFileSync(path.join(migrationsDir, "1700000001_add_loop_fields.js"), LOOP_MIGRATION);

    const snapshot = loadSnapshotWithMigrations({ migrationsPath: migrationsDir })!;
    const articles = snapshot.collections.get("articles")!;
    const names = articles.fields.map((f) => f.name);

    expect(names).toContain("extra_1");
    expect(names).toContain("extra_2");
    expect(names).toContain("extra_3");
  });

  it("fails hard on a broken migration, naming the file", () => {
    fs.writeFileSync(path.join(migrationsDir, "1700000002_broken.js"), BROKEN_MIGRATION);

    let caught: unknown;
    try {
      loadSnapshotWithMigrations({ migrationsPath: migrationsDir });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SnapshotError);
    expect((caught as SnapshotError).message).toContain("1700000002_broken.js");
  });

  it("supports a single migration file path (back-compat)", () => {
    const snapshot = loadSnapshotWithMigrations({
      migrationsPath: path.join(migrationsDir, "1700000000_collections_snapshot.js"),
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot!.collections.get("articles")).toBeDefined();
  });

  it("returns null when the directory has no snapshot", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-engine-empty-"));
    try {
      expect(loadSnapshotWithMigrations({ migrationsPath: emptyDir })).toBeNull();
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
