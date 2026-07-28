/**
 * `status` compares the schema against two different states, and the two must
 * not be confused:
 *
 * - the migration files on disk answer "does this schema still need a
 *   migration written?" — the question `generate` answers, so both commands
 *   have to agree.
 * - the migrations PocketBase has actually run answer "is the database behind
 *   its files?" — reported as drift, not as a schema change.
 *
 * Sharing one baseline made `status --verify` list collections that already
 * had a migration file waiting, and then tell the user to run `generate`,
 * which correctly wrote nothing.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { loadStatusBaselines } from "../commands/status";
import { convertZodSchemaToCollectionSchema } from "../../migration/analyzer";
import { compare } from "../../migration/diff";
import { appliedMigrationsFromList } from "../../migration/engine/applied-migrations";
import { planMigrationReplay } from "../../migration/engine/migration-plan";
import { defineCollection } from "../../schema/base";
import type { SchemaDefinition } from "../../migration/types";

const SNAPSHOT_FILE = "1700000000_collections_snapshot.js";
const PENDING_FILE = "1700000100_created_Posts.js";

const SNAPSHOT_SOURCE = `migrate((app) => {
  const snapshot = [
    {
      id: "pbc_notes",
      name: "notes",
      type: "base",
      fields: [
        { id: "text_body", name: "body", type: "text", required: true },
      ],
      indexes: [],
    },
  ];
  return app.importCollections(snapshot, false);
}, (app) => {});
`;

const PENDING_SOURCE = `migrate((app) => {
  const collection = new Collection({
    id: "pbc_posts",
    name: "posts",
    type: "base",
    fields: [
      { id: "text_title", name: "title", type: "text", required: true },
    ],
    indexes: [],
  });
  return app.save(collection);
}, (app) => {
  return app.delete(app.findCollectionByNameOrId("posts"));
});
`;

/** The schema both migration files together describe */
function schemaOnDisk(): SchemaDefinition {
  const notes = defineCollection({
    collectionName: "notes",
    schema: z.object({ body: z.string() }),
  });
  const posts = defineCollection({
    collectionName: "posts",
    schema: z.object({ title: z.string() }),
  });

  return {
    collections: new Map([
      ["notes", convertZodSchemaToCollectionSchema("notes", notes)],
      ["posts", convertZodSchemaToCollectionSchema("posts", posts)],
    ]),
  };
}

describe("status baselines", () => {
  let workdir: string;
  let migrationsDir: string;

  beforeEach(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), "status-baselines-"));
    migrationsDir = path.join(workdir, "pb_migrations");
    fs.mkdirSync(migrationsDir);
    fs.writeFileSync(path.join(migrationsDir, SNAPSHOT_FILE), SNAPSHOT_SOURCE, "utf-8");
    fs.writeFileSync(path.join(migrationsDir, PENDING_FILE), PENDING_SOURCE, "utf-8");
  });

  afterEach(() => {
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  /** A database that has run the snapshot but not the file after it */
  function appliedSnapshotOnly() {
    const applied = appliedMigrationsFromList([SNAPSHOT_FILE], path.join(workdir, "pb_data/data.db"));
    return {
      status: "found" as const,
      applied,
      plan: planMigrationReplay(migrationsDir, { applied }),
    };
  }

  it("diffs the schema against every file on disk, not against the database", () => {
    const currentSchema = schemaOnDisk();
    const lookup = appliedSnapshotOnly();
    expect(lookup.plan.pending).toEqual([PENDING_FILE]);

    const { previousSnapshot } = loadStatusBaselines(currentSchema, migrationsDir, workdir, lookup);

    // `posts` already has a migration file, so there is nothing to generate —
    // the same answer `generate` gives
    const diff = compare(currentSchema, previousSnapshot);
    expect(diff.collectionsToCreate).toEqual([]);
    expect(diff.collectionsToModify).toEqual([]);
    expect(diff.collectionsToDelete).toEqual([]);
  });

  it("reports what the pending files still owe the database separately", () => {
    const { appliedDiff } = loadStatusBaselines(schemaOnDisk(), migrationsDir, workdir, appliedSnapshotOnly());

    expect(appliedDiff).not.toBeNull();
    expect(appliedDiff!.collectionsToCreate.map((c) => c.name)).toEqual(["posts"]);
  });

  it("keeps reporting genuinely unmigrated schema changes", () => {
    const currentSchema = schemaOnDisk();
    currentSchema.collections.set(
      "comments",
      convertZodSchemaToCollectionSchema(
        "comments",
        defineCollection({ collectionName: "comments", schema: z.object({ text: z.string() }) })
      )
    );

    const { previousSnapshot, appliedDiff } = loadStatusBaselines(
      currentSchema,
      migrationsDir,
      workdir,
      appliedSnapshotOnly()
    );

    expect(compare(currentSchema, previousSnapshot).collectionsToCreate.map((c) => c.name)).toEqual(["comments"]);
    // The database is behind on both: the pending file and the unwritten one
    expect(appliedDiff!.collectionsToCreate.map((c) => c.name).sort()).toEqual(["comments", "posts"]);
  });

  it("skips the applied diff when disk and the database agree", () => {
    const applied = appliedMigrationsFromList([SNAPSHOT_FILE, PENDING_FILE], path.join(workdir, "pb_data/data.db"));
    const lookup = {
      status: "found" as const,
      applied,
      plan: planMigrationReplay(migrationsDir, { applied }),
    };
    expect(lookup.plan.inSync).toBe(true);

    const { appliedDiff } = loadStatusBaselines(schemaOnDisk(), migrationsDir, workdir, lookup);
    expect(appliedDiff).toBeNull();
  });

  it("uses the disk baseline when no database was read", () => {
    const { previousSnapshot, appliedDiff } = loadStatusBaselines(schemaOnDisk(), migrationsDir, workdir, null);

    expect(appliedDiff).toBeNull();
    expect(previousSnapshot?.collections.has("posts")).toBe(true);
  });
});
