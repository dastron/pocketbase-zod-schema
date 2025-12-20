/**
 * Test to ensure the user schema matches the PocketBase snapshot
 *
 * This test validates that the UserCollection schema definition
 * is in sync with the current PocketBase migration snapshot.
 * Any differences will be caught by this test, ensuring that
 * schema changes are properly reflected in migrations.
 */

import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { buildSchemaDefinition } from "../../migration/analyzer";
import { aggregateChanges } from "../../migration/diff";
import { loadSnapshotWithMigrations } from "../../migration/snapshot";

describe("User Schema Snapshot Alignment", () => {
  it("should match user schema with PocketBase snapshot", async () => {
    // Get the snapshot file path relative to the project root
    // The test is in package/src/schema/__tests__, so we need to go up 4 levels
    // (__tests__ -> schema -> src -> package -> root) to reach the project root
    const snapshotFile = path.resolve(
      __dirname,
      "../../../../pocketbase/pb_migrations/1766188795_collections_snapshot.js"
    );

    // Verify the file exists
    expect(fs.existsSync(snapshotFile)).toBe(true);

    // Build schema definition from the user schema file
    const schemaDir = path.resolve(__dirname, "../");
    const currentSchema = await buildSchemaDefinition({
      schemaDir,
      useCompiledFiles: false,
    });

    // Load the snapshot from the migration file
    // loadSnapshotWithMigrations accepts either a file or directory path
    const previousSnapshot = loadSnapshotWithMigrations({
      migrationsPath: snapshotFile,
    });

    // Ensure snapshot was loaded
    expect(previousSnapshot).not.toBeNull();
    if (!previousSnapshot) {
      throw new Error("Failed to load snapshot from migration file");
    }

    // Compare the current schema with the snapshot
    const diff = aggregateChanges(currentSchema, previousSnapshot);

    // Verify there are no collections to modify (user schema should match snapshot exactly)
    expect(diff.collectionsToModify).toHaveLength(0);

    // Verify the users collection exists in both
    const userSchema = currentSchema.collections.get("users");
    const userSnapshot = previousSnapshot.collections.get("users");

    expect(userSchema).toBeDefined();
    expect(userSnapshot).toBeDefined();

    // Verify indexes match
    expect(userSchema?.indexes).toEqual(userSnapshot?.indexes);

    // Verify rules/permissions match
    expect(userSchema?.rules?.listRule).toBe(userSnapshot?.rules?.listRule);
    expect(userSchema?.rules?.viewRule).toBe(userSnapshot?.rules?.viewRule);
    expect(userSchema?.rules?.createRule).toBe(userSnapshot?.rules?.createRule);
    expect(userSchema?.rules?.updateRule).toBe(userSnapshot?.rules?.updateRule);
    expect(userSchema?.rules?.deleteRule).toBe(userSnapshot?.rules?.deleteRule);
    expect(userSchema?.rules?.manageRule).toBe(userSnapshot?.rules?.manageRule);

    // Verify collection type matches
    expect(userSchema?.type).toBe(userSnapshot?.type);

    // Verify that UserCollection was correctly identified and used
    // The schema should have been extracted from the default export
    expect(userSchema).toBeDefined();
    expect(userSchema?.name).toBe("users");
  });
});
