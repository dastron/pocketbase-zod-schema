/**
 * loadSnapshotWithMigrations engine-mode behavior:
 * - runtime (default) executes migrations, so dynamic constructs are applied
 * - runtime fails hard on broken migrations, naming the file
 * - static preserves the legacy lenient warn-and-continue behavior
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SnapshotError } from "../errors";
import { __resetStaticEngineDeprecationWarning, loadSnapshotWithMigrations } from "../snapshot";

const SNAPSHOT_FIXTURE = path.resolve(__dirname, "fixtures/native-snapshot-trimmed.js");

describe("loadSnapshotWithMigrations engine modes", () => {
  let migrationsDir: string;

  beforeEach(() => {
    migrationsDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-engine-test-"));
    fs.copyFileSync(SNAPSHOT_FIXTURE, path.join(migrationsDir, "1700000000_collections_snapshot.js"));
  });

  afterEach(() => {
    fs.rmSync(migrationsDir, { recursive: true, force: true });
  });

  it("defaults to the runtime engine", () => {
    const snapshot = loadSnapshotWithMigrations({ migrationsPath: migrationsDir });

    expect(snapshot).not.toBeNull();
    expect([...snapshot!.collections.keys()].sort()).toEqual(["article_stats", "articles", "users"]);
  });

  it("runtime mode applies dynamic (loop-based) migrations", () => {
    fs.writeFileSync(
      path.join(migrationsDir, "1700000001_add_loop_fields.js"),
      `migrate((app) => {
        const collection = app.findCollectionByNameOrId("articles");
        for (let i = 1; i <= 3; i++) {
          collection.fields.add(new TextField({ id: "text_extra_" + i, name: "extra_" + i }));
        }
        return app.save(collection);
      }, (app) => null);`
    );

    const snapshot = loadSnapshotWithMigrations({ migrationsPath: migrationsDir, engine: "runtime" })!;
    const articles = snapshot.collections.get("articles")!;
    const names = articles.fields.map((f) => f.name);

    expect(names).toContain("extra_1");
    expect(names).toContain("extra_2");
    expect(names).toContain("extra_3");
  });

  it("static mode misses those same dynamic migrations (legacy behavior)", () => {
    fs.writeFileSync(
      path.join(migrationsDir, "1700000001_add_loop_fields.js"),
      `migrate((app) => {
        const collection = app.findCollectionByNameOrId("articles");
        for (let i = 1; i <= 3; i++) {
          collection.fields.add(new TextField({ id: "text_extra_" + i, name: "extra_" + i }));
        }
        return app.save(collection);
      }, (app) => null);`
    );

    const snapshot = loadSnapshotWithMigrations({ migrationsPath: migrationsDir, engine: "static" })!;
    const articles = snapshot.collections.get("articles")!;

    expect(articles.fields.map((f) => f.name)).not.toContain("extra_1");
  });

  it("runtime mode fails hard on a broken migration, naming the file", () => {
    const brokenFile = path.join(migrationsDir, "1700000002_broken.js");
    fs.writeFileSync(
      brokenFile,
      `migrate((app) => {
        const collection = app.findCollectionByNameOrId("this_collection_does_not_exist");
        return app.save(collection);
      }, (app) => null);`
    );

    let caught: unknown;
    try {
      loadSnapshotWithMigrations({ migrationsPath: migrationsDir, engine: "runtime" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SnapshotError);
    expect((caught as SnapshotError).message).toContain("1700000002_broken.js");
    expect((caught as SnapshotError).message).toContain('"static"');
  });

  it("static mode continues past the same broken migration (legacy behavior)", () => {
    fs.writeFileSync(
      path.join(migrationsDir, "1700000002_broken.js"),
      `migrate((app) => {
        const collection = app.findCollectionByNameOrId("this_collection_does_not_exist");
        return app.save(collection);
      }, (app) => null);`
    );

    const snapshot = loadSnapshotWithMigrations({ migrationsPath: migrationsDir, engine: "static" });
    expect(snapshot).not.toBeNull();
  });

  it("runtime mode supports a single migration file path (back-compat)", () => {
    const snapshot = loadSnapshotWithMigrations({
      migrationsPath: path.join(migrationsDir, "1700000000_collections_snapshot.js"),
      engine: "runtime",
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot!.collections.get("articles")).toBeDefined();
  });

  it("warns about the static engine deprecation once per process", () => {
    __resetStaticEngineDeprecationWarning();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      loadSnapshotWithMigrations({ migrationsPath: migrationsDir, engine: "static" });
      loadSnapshotWithMigrations({ migrationsPath: migrationsDir, engine: "static" });

      const deprecations = warn.mock.calls.filter(([message]) => String(message).includes("deprecated"));
      expect(deprecations).toHaveLength(1);
      expect(String(deprecations[0]![0])).toContain('engine: "static"');
      expect(String(deprecations[0]![0])).toContain("next major release");
    } finally {
      warn.mockRestore();
    }
  });

  it("does not emit the deprecation warning for the runtime engine", () => {
    __resetStaticEngineDeprecationWarning();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      loadSnapshotWithMigrations({ migrationsPath: migrationsDir, engine: "runtime" });
      expect(warn.mock.calls.filter(([message]) => String(message).includes("deprecated"))).toHaveLength(0);
    } finally {
      warn.mockRestore();
    }
  });

  it("returns null when the directory has no snapshot", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-engine-empty-"));
    try {
      expect(loadSnapshotWithMigrations({ migrationsPath: emptyDir, engine: "runtime" })).toBeNull();
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
