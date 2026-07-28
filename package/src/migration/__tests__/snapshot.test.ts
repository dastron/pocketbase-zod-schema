/**
 * Tests for snapshot reconstruction from migration files
 */

import * as fs from "fs";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findLatestSnapshot, loadSnapshotWithMigrations } from "../snapshot";

describe("loadSnapshotWithMigrations", () => {
  const testMigrationsDir = path.join(__dirname, ".test-migrations-base");

  beforeEach(() => {
    // Create test migrations directory
    if (!fs.existsSync(testMigrationsDir)) {
      fs.mkdirSync(testMigrationsDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test migrations directory
    if (fs.existsSync(testMigrationsDir)) {
      const files = fs.readdirSync(testMigrationsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testMigrationsDir, file));
      }
      fs.rmdirSync(testMigrationsDir);
    }
  });

  it("should return null when migrations directory is empty", () => {
    const snapshot = loadSnapshotWithMigrations({ migrationsPath: testMigrationsDir });
    expect(snapshot).toBeNull();
  });

  it("should return null when no migrationsPath is provided", () => {
    const snapshot = loadSnapshotWithMigrations({});
    expect(snapshot).toBeNull();
  });

  it("should return null for a nonexistent migrations path", () => {
    const invalidPath = "/nonexistent/path/to/migrations";
    const snapshot = loadSnapshotWithMigrations({ migrationsPath: invalidPath });
    expect(snapshot).toBeNull();
  });

  it("should reconstruct state from a snapshot file in the migrations directory", () => {
    const snapshotContent = `
      migrate((app) => {
        const snapshot = [
          {
            name: "projects",
            id: "projects_id",
            type: "base",
            fields: [
              { name: "title", id: "title_id", type: "text", required: true }
            ]
          }
        ];

        return app.importCollections(snapshot, false);
      });
    `;
    fs.writeFileSync(path.join(testMigrationsDir, "1234567890_collections_snapshot.js"), snapshotContent);

    const snapshot = loadSnapshotWithMigrations({ migrationsPath: testMigrationsDir });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.collections.has("projects")).toBe(true);
  });

  it("should replay from the most recent snapshot when multiple exist", () => {
    const oldSnapshotContent = `
      migrate((app) => {
        const snapshot = [
          {
            name: "users",
            id: "users_id",
            type: "auth",
            fields: [
              { name: "email", id: "email_id", type: "email", required: true }
            ]
          }
        ];

        return app.importCollections(snapshot, false);
      });
    `;

    const newestSnapshotContent = `
      migrate((app) => {
        const snapshot = [
          {
            name: "users",
            id: "users_id",
            type: "auth",
            fields: [
              { name: "email", id: "email_id", type: "email", required: true }
            ]
          },
          {
            name: "projects",
            id: "projects_id",
            type: "base",
            fields: [
              { name: "title", id: "title_id", type: "text", required: true }
            ]
          }
        ];

        return app.importCollections(snapshot, false);
      });
    `;

    fs.writeFileSync(path.join(testMigrationsDir, "1234567890_collections_snapshot.js"), oldSnapshotContent);
    fs.writeFileSync(path.join(testMigrationsDir, "1234567900_collections_snapshot.js"), newestSnapshotContent);

    const snapshot = loadSnapshotWithMigrations({ migrationsPath: testMigrationsDir });

    // Should have replayed from the newest snapshot
    expect(snapshot).not.toBeNull();
    expect(snapshot?.collections.size).toBe(2);
    expect(snapshot?.collections.has("users")).toBe(true);
    expect(snapshot?.collections.has("projects")).toBe(true);
  });

  it("should apply migrations that come after the snapshot", () => {
    const snapshotContent = `
      migrate((app) => {
        const snapshot = [
          {
            name: "projects",
            id: "projects_id",
            type: "base",
            fields: [
              { name: "title", id: "title_id", type: "text", required: true }
            ]
          }
        ];

        return app.importCollections(snapshot, false);
      });
    `;
    const followUpMigration = `
      migrate((app) => {
        const collection = app.findCollectionByNameOrId("projects");
        collection.fields.add(new Field({
          name: "summary",
          id: "summary_id",
          type: "text",
          required: false
        }));
        return app.save(collection);
      });
    `;

    fs.writeFileSync(path.join(testMigrationsDir, "1234567890_collections_snapshot.js"), snapshotContent);
    fs.writeFileSync(path.join(testMigrationsDir, "1234567895_add_summary.js"), followUpMigration);

    const snapshot = loadSnapshotWithMigrations({ migrationsPath: testMigrationsDir });

    expect(snapshot).not.toBeNull();
    const projects = snapshot?.collections.get("projects");
    expect(projects?.fields.find((f) => f.name === "summary")).toBeDefined();
  });
});

describe("findLatestSnapshot - Snapshot Generation Tests", () => {
  const testMigrationsDir = path.join(__dirname, ".test-migrations");

  beforeEach(() => {
    // Create test migrations directory
    if (!fs.existsSync(testMigrationsDir)) {
      fs.mkdirSync(testMigrationsDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test migrations directory
    if (fs.existsSync(testMigrationsDir)) {
      const files = fs.readdirSync(testMigrationsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testMigrationsDir, file));
      }
      fs.rmdirSync(testMigrationsDir);
    }
  });

  it("should return null when migrations directory does not exist", () => {
    const nonExistentDir = path.join(__dirname, ".nonexistent-migrations");
    const result = findLatestSnapshot(nonExistentDir);
    expect(result).toBeNull();
  });

  it("should return null when no snapshot files exist", () => {
    // Create some non-snapshot migration files
    fs.writeFileSync(path.join(testMigrationsDir, "1234567890_create_users.js"), "// migration");
    fs.writeFileSync(path.join(testMigrationsDir, "1234567891_create_projects.js"), "// migration");

    const result = findLatestSnapshot(testMigrationsDir);
    expect(result).toBeNull();
  });

  it("should find snapshot with _collections_snapshot.js pattern", () => {
    // Create a snapshot file
    const snapshotFile = "1234567890_collections_snapshot.js";
    fs.writeFileSync(path.join(testMigrationsDir, snapshotFile), "// snapshot");

    const result = findLatestSnapshot(testMigrationsDir);
    expect(result).toBe(path.join(testMigrationsDir, snapshotFile));
  });

  it("should find snapshot with _snapshot.js pattern", () => {
    // Create a snapshot file with shorter pattern
    const snapshotFile = "1234567890_snapshot.js";
    fs.writeFileSync(path.join(testMigrationsDir, snapshotFile), "// snapshot");

    const result = findLatestSnapshot(testMigrationsDir);
    expect(result).toBe(path.join(testMigrationsDir, snapshotFile));
  });

  it("should return the most recent snapshot when multiple exist", () => {
    // Create multiple snapshot files with different timestamps
    const oldSnapshot = "1234567890_collections_snapshot.js";
    const middleSnapshot = "1234567895_collections_snapshot.js";
    const newestSnapshot = "1234567900_collections_snapshot.js";

    fs.writeFileSync(path.join(testMigrationsDir, oldSnapshot), "// old snapshot");
    fs.writeFileSync(path.join(testMigrationsDir, middleSnapshot), "// middle snapshot");
    fs.writeFileSync(path.join(testMigrationsDir, newestSnapshot), "// newest snapshot");

    const result = findLatestSnapshot(testMigrationsDir);

    // Should return the newest snapshot (highest timestamp)
    expect(result).toBe(path.join(testMigrationsDir, newestSnapshot));
  });

  it("should handle mixed snapshot patterns and return most recent", () => {
    // Create snapshots with different patterns
    const oldCollectionsSnapshot = "1234567890_collections_snapshot.js";
    const newerSnapshot = "1234567895_snapshot.js";
    const newestCollectionsSnapshot = "1234567900_collections_snapshot.js";

    fs.writeFileSync(path.join(testMigrationsDir, oldCollectionsSnapshot), "// old");
    fs.writeFileSync(path.join(testMigrationsDir, newerSnapshot), "// newer");
    fs.writeFileSync(path.join(testMigrationsDir, newestCollectionsSnapshot), "// newest");

    const result = findLatestSnapshot(testMigrationsDir);

    // Should return the newest regardless of pattern
    expect(result).toBe(path.join(testMigrationsDir, newestCollectionsSnapshot));
  });

  it("should ignore non-snapshot migration files", () => {
    // Create regular migrations and one snapshot
    fs.writeFileSync(path.join(testMigrationsDir, "1234567880_create_users.js"), "// migration");
    fs.writeFileSync(path.join(testMigrationsDir, "1234567890_collections_snapshot.js"), "// snapshot");
    fs.writeFileSync(path.join(testMigrationsDir, "1234567895_update_projects.js"), "// migration");

    const result = findLatestSnapshot(testMigrationsDir);

    // Should only find the snapshot file
    expect(result).toBe(path.join(testMigrationsDir, "1234567890_collections_snapshot.js"));
  });

  it("should handle directory with only regular migrations", () => {
    // Create only regular migration files
    fs.writeFileSync(path.join(testMigrationsDir, "1234567890_create_users.js"), "// migration");
    fs.writeFileSync(path.join(testMigrationsDir, "1234567891_create_projects.js"), "// migration");
    fs.writeFileSync(path.join(testMigrationsDir, "1234567892_update_users.js"), "// migration");

    const result = findLatestSnapshot(testMigrationsDir);
    expect(result).toBeNull();
  });
});
