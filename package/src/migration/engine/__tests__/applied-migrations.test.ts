/**
 * `_migrations` awareness: reading PocketBase's applied list and planning a
 * partial replay from it.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AppliedMigrationsError,
  appliedMigrationsFromList,
  defaultDataDirectory,
  readAppliedMigrations,
  readAppliedMigrationsIfPresent,
  resolveDatabasePath,
} from "../applied-migrations";
import { discoverMigrations, planMigrationReplay } from "../migration-plan";
import { replayMigrationsDirectory } from "../replayer";

const SNAPSHOT = `migrate((app) => {
  const snapshot = [
    {
      id: "pbc_posts",
      name: "posts",
      type: "base",
      fields: [{ id: "text_title", name: "title", type: "text" }],
      indexes: [],
    },
  ];
  return app.importCollections(snapshot, false);
}, (app) => {});
`;

function createdCollection(id: string, name: string): string {
  return `migrate((app) => {
  const collection = new Collection({
    id: ${JSON.stringify(id)},
    name: ${JSON.stringify(name)},
    type: "base",
    fields: [{ id: "text_name", name: "name", type: "text" }],
    indexes: [],
  });
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId(${JSON.stringify(name)});
  return app.delete(collection);
});
`;
}

let workdir: string;
let migrationsDir: string;

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), "pbzs-applied-"));
  migrationsDir = path.join(workdir, "pb_migrations");
  fs.mkdirSync(migrationsDir);
});

afterEach(() => {
  fs.rmSync(workdir, { recursive: true, force: true });
});

function writeMigration(name: string, source: string): void {
  fs.writeFileSync(path.join(migrationsDir, name), source, "utf-8");
}

function seedDirectory(): void {
  writeMigration("1700000000_collections_snapshot.js", SNAPSHOT);
  writeMigration("1700000100_created_Authors.js", createdCollection("pbc_authors", "authors"));
  writeMigration("1700000200_created_Tags.js", createdCollection("pbc_tags", "tags"));
}

describe("discoverMigrations", () => {
  it("lists timestamped .js files in timestamp order and flags snapshots", () => {
    seedDirectory();
    fs.writeFileSync(path.join(migrationsDir, "notes.md"), "ignored", "utf-8");
    fs.writeFileSync(path.join(migrationsDir, "helper.js"), "// no timestamp", "utf-8");

    const discovered = discoverMigrations(migrationsDir);

    expect(discovered.map((migration) => migration.name)).toEqual([
      "1700000000_collections_snapshot.js",
      "1700000100_created_Authors.js",
      "1700000200_created_Tags.js",
    ]);
    expect(discovered[0].isSnapshot).toBe(true);
    expect(discovered[1].isSnapshot).toBe(false);
  });

  it("returns an empty list for a directory that does not exist", () => {
    expect(discoverMigrations(path.join(workdir, "nope"))).toEqual([]);
  });
});

describe("planMigrationReplay without an applied list", () => {
  it("replays the newest snapshot plus everything after it", () => {
    seedDirectory();

    const plan = planMigrationReplay(migrationsDir);

    expect(plan.appliedKnown).toBe(false);
    expect(plan.inSync).toBe(true);
    expect(plan.filesToReplay.map((file) => path.basename(file))).toEqual([
      "1700000000_collections_snapshot.js",
      "1700000100_created_Authors.js",
      "1700000200_created_Tags.js",
    ]);
  });

  it("ignores migrations older than the newest snapshot", () => {
    writeMigration("1700000000_created_Old.js", createdCollection("pbc_old", "old"));
    writeMigration("1700000100_collections_snapshot.js", SNAPSHOT);
    writeMigration("1700000200_created_Tags.js", createdCollection("pbc_tags", "tags"));

    const plan = planMigrationReplay(migrationsDir);

    expect(plan.filesToReplay.map((file) => path.basename(file))).toEqual([
      "1700000100_collections_snapshot.js",
      "1700000200_created_Tags.js",
    ]);
  });
});

describe("planMigrationReplay with an applied list", () => {
  it("stops the replay at the applied set and names what is pending", () => {
    seedDirectory();

    const plan = planMigrationReplay(migrationsDir, {
      applied: ["1700000000_collections_snapshot.js", "1700000100_created_Authors.js"],
    });

    expect(plan.appliedKnown).toBe(true);
    expect(plan.filesToReplay.map((file) => path.basename(file))).toEqual([
      "1700000000_collections_snapshot.js",
      "1700000100_created_Authors.js",
    ]);
    expect(plan.pending).toEqual(["1700000200_created_Tags.js"]);
    expect(plan.missing).toEqual([]);
    expect(plan.inSync).toBe(false);
  });

  it("reports applied migrations that are no longer on disk", () => {
    seedDirectory();

    const plan = planMigrationReplay(migrationsDir, {
      applied: [
        "1700000000_collections_snapshot.js",
        "1700000100_created_Authors.js",
        "1700000150_created_Deleted.js",
        "1700000200_created_Tags.js",
      ],
    });

    expect(plan.missing).toEqual(["1700000150_created_Deleted.js"]);
    expect(plan.pending).toEqual([]);
    expect(plan.inSync).toBe(false);
  });

  it("flags a pending migration authored behind an applied one", () => {
    seedDirectory();
    writeMigration("1700000150_created_Late.js", createdCollection("pbc_late", "late"));

    const plan = planMigrationReplay(migrationsDir, {
      applied: ["1700000000_collections_snapshot.js", "1700000100_created_Authors.js", "1700000200_created_Tags.js"],
    });

    expect(plan.pending).toEqual(["1700000150_created_Late.js"]);
    expect(plan.outOfOrder).toEqual(["1700000150_created_Late.js"]);
  });

  it("starts from the newest snapshot that was actually applied", () => {
    seedDirectory();
    // A newer snapshot exists on disk but the database never ran it
    writeMigration("1700000300_collections_snapshot.js", SNAPSHOT);

    const plan = planMigrationReplay(migrationsDir, {
      applied: ["1700000000_collections_snapshot.js", "1700000100_created_Authors.js", "1700000200_created_Tags.js"],
    });

    expect(plan.snapshotFile && path.basename(plan.snapshotFile)).toBe("1700000000_collections_snapshot.js");
    expect(plan.pending).toEqual(["1700000300_collections_snapshot.js"]);
  });

  it("is in sync when disk and the applied list match exactly", () => {
    seedDirectory();

    const plan = planMigrationReplay(migrationsDir, {
      applied: ["1700000000_collections_snapshot.js", "1700000100_created_Authors.js", "1700000200_created_Tags.js"],
    });

    expect(plan.inSync).toBe(true);
    expect(plan.pending).toEqual([]);
    expect(plan.missing).toEqual([]);
  });
});

describe("replayMigrationsDirectory with an applied list", () => {
  it("reconstructs only the state the database actually reached", () => {
    seedDirectory();

    const full = replayMigrationsDirectory(migrationsDir);
    expect([...(full?.snapshot.collections.keys() ?? [])].sort()).toEqual(["authors", "posts", "tags"]);

    const partial = replayMigrationsDirectory(migrationsDir, {
      applied: ["1700000000_collections_snapshot.js", "1700000100_created_Authors.js"],
    });

    expect([...(partial?.snapshot.collections.keys() ?? [])].sort()).toEqual(["authors", "posts"]);
    expect(partial?.plan?.pending).toEqual(["1700000200_created_Tags.js"]);
  });

  it("returns null when nothing has been applied", () => {
    seedDirectory();
    expect(replayMigrationsDirectory(migrationsDir, { applied: [] })).toBeNull();
  });
});

describe("appliedMigrationsFromList", () => {
  it("reduces paths to basenames and separates PocketBase's Go core migrations", () => {
    const source = appliedMigrationsFromList([
      "/somewhere/pb_migrations/1700000000_collections_snapshot.js",
      "1640988000_init.go",
    ]);

    expect(source.entries.map((entry) => entry.file)).toEqual(["1700000000_collections_snapshot.js"]);
    expect(source.coreEntries.map((entry) => entry.file)).toEqual(["1640988000_init.go"]);
  });
});

describe("defaultDataDirectory", () => {
  it("resolves pb_data as a sibling of the migrations directory", () => {
    expect(defaultDataDirectory("/project/pocketbase/pb_migrations")).toBe("/project/pocketbase/pb_data");
  });
});

const sqlite = (process as NodeJS.Process & { getBuiltinModule?: (id: string) => any }).getBuiltinModule?.(
  "node:sqlite"
);

describe.skipIf(!sqlite)("readAppliedMigrations", () => {
  function createDatabase(rows: { file: string; applied: number }[]): string {
    const dataDir = path.join(workdir, "pb_data");
    fs.mkdirSync(dataDir, { recursive: true });
    const databasePath = path.join(dataDir, "data.db");

    const database = new sqlite.DatabaseSync(databasePath);
    database.exec("CREATE TABLE _migrations (file TEXT PRIMARY KEY NOT NULL, applied INTEGER NOT NULL)");
    const insert = database.prepare("INSERT INTO _migrations (file, applied) VALUES (?, ?)");
    for (const row of rows) {
      insert.run(row.file, row.applied);
    }
    database.close();

    return dataDir;
  }

  it("reads the table in application order, separating Go core migrations", () => {
    const dataDir = createDatabase([
      { file: "1640988000_init.go", applied: 1 },
      { file: "1700000000_collections_snapshot.js", applied: 2 },
      { file: "1700000100_created_Authors.js", applied: 3 },
    ]);

    const source = readAppliedMigrations(dataDir);

    expect(source.entries.map((entry) => entry.file)).toEqual([
      "1700000000_collections_snapshot.js",
      "1700000100_created_Authors.js",
    ]);
    expect(source.entries[0].applied).toBe(2);
    expect(source.coreEntries.map((entry) => entry.file)).toEqual(["1640988000_init.go"]);
    expect(source.origin).toBe(path.join(dataDir, "data.db"));
  });

  it("accepts the database file directly", () => {
    const dataDir = createDatabase([{ file: "1700000000_collections_snapshot.js", applied: 1 }]);
    const source = readAppliedMigrations(path.join(dataDir, "data.db"));
    expect(source.entries).toHaveLength(1);
  });

  it("plans a replay from a real database", () => {
    seedDirectory();
    const dataDir = createDatabase([
      { file: "1640988000_init.go", applied: 1 },
      { file: "1700000000_collections_snapshot.js", applied: 2 },
      { file: "1700000100_created_Authors.js", applied: 3 },
    ]);

    const plan = planMigrationReplay(migrationsDir, { applied: readAppliedMigrations(dataDir) });

    expect(plan.appliedCount).toBe(2);
    expect(plan.pending).toEqual(["1700000200_created_Tags.js"]);
    expect(plan.appliedOrigin).toBe(path.join(dataDir, "data.db"));
  });

  it("throws when the database has no _migrations table", () => {
    const dataDir = path.join(workdir, "pb_data");
    fs.mkdirSync(dataDir, { recursive: true });
    const database = new sqlite.DatabaseSync(path.join(dataDir, "data.db"));
    database.exec("CREATE TABLE unrelated (id TEXT)");
    database.close();

    expect(() => readAppliedMigrations(dataDir)).toThrow(AppliedMigrationsError);
  });

  it("throws for a path with no database", () => {
    expect(() => readAppliedMigrations(path.join(workdir, "pb_data"))).toThrow(AppliedMigrationsError);
  });
});

describe("readAppliedMigrationsIfPresent", () => {
  it("returns null when there is no database to read", () => {
    expect(readAppliedMigrationsIfPresent(path.join(workdir, "pb_data"))).toBeNull();
  });
});

describe("resolveDatabasePath", () => {
  it("returns null for a directory without data.db", () => {
    expect(resolveDatabasePath(migrationsDir)).toBeNull();
  });
});
