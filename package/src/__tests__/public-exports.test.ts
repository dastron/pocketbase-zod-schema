/**
 * Golden tests for the public API surface
 *
 * The exact runtime export lists of both entry points are pinned here: a
 * removal is a breaking change and a new name is a deliberate API addition —
 * either way, this file must change with it.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as root from "../index";
import * as server from "../server";

const ROOT_EXPORTS = [
  "AutodateField",
  "BoolField",
  "DateField",
  "EditorField",
  "EmailField",
  "FIELD_METADATA_KEY",
  "FileField",
  "FilesField",
  "GeoPointField",
  "JSONField",
  "NumberField",
  "PermissionTemplates",
  "RelationField",
  "RelationsField",
  "SelectField",
  "TextField",
  "URLField",
  "baseSchema",
  "dedentSql",
  "defineCollection",
  "defineView",
  "extractFieldMetadata",
  "extractRelationMetadata",
  "resolveTemplate",
  "sql",
  "validateViewQuery",
];

const SERVER_ONLY_EXPORTS = [
  // Analyzer
  "convertZodSchemaToCollectionSchema",
  "discoverSchemaFiles",
  "parseSchemaFiles",
  // Snapshot
  "findLatestSnapshot",
  "loadSnapshotWithMigrations",
  // Diff
  "categorizeChangesBySeverity",
  "compare",
  "filterDiff",
  // Destructive-change detection
  "detectDestructiveChanges",
  "formatDestructiveChanges",
  "hasDestructiveChanges",
  "requiresForceFlag",
  "summarizeDestructiveChanges",
  // Generator
  "generate",
  "planMigrations",
  "writePlannedMigrations",
  // Engine
  "AppliedMigrationsError",
  "CollectionStore",
  "RecordModel",
  "appliedMigrationsFromList",
  "defaultDataDirectory",
  "discoverMigrations",
  "executeMigrationFile",
  "formatGojaLintFinding",
  "lintMigrationFile",
  "lintMigrationSource",
  "planMigrationReplay",
  "readAppliedMigrations",
  "readAppliedMigrationsIfPresent",
  "replayMigrations",
  "replayMigrationsDirectory",
  "verifyMigrationSources",
  // Errors
  "CLIUsageError",
  "ConfigurationError",
  "FileSystemError",
  "MigrationError",
  "MigrationExecutionError",
  "MigrationGenerationError",
  "SchemaParsingError",
  "SnapshotError",
  // Programmatic CLI API
  "generateMigration",
  "getMigrationStatus",
  "loadConfig",
];

describe("Public exports", () => {
  it("should expose exactly the curated browser-safe surface", () => {
    expect(Object.keys(root).sort()).toEqual([...ROOT_EXPORTS].sort());
  });

  it("should expose exactly the curated server surface", () => {
    expect(Object.keys(server).sort()).toEqual([...ROOT_EXPORTS, ...SERVER_ONLY_EXPORTS].sort());
  });

  it("should not leak internals or removed APIs", () => {
    const removed = [
      // Internal helpers that used to leak through export * barrels
      "normalizeSql",
      "mergeConfig",
      "DEFAULT_CONFIG",
      "CollectionIdRegistry",
      "generateFindCollectionCode",
      // OO wrappers
      "SchemaAnalyzer",
      "DiffEngine",
      "MigrationGenerator",
      "SnapshotManager",
      // Removed APIs
      "withPermissions",
      "withIndexes",
      "SingleSelectField",
      "MultiSelectField",
      "saveSnapshot",
      "loadSnapshot",
      "loadSnapshotIfExists",
      "buildSchemaDefinition",
      "aggregateChanges",
      "isAuthCollection",
      "getCollectionNameFromFile",
      "pluralize",
      "isRelationField",
      "resolveTargetCollection",
      "detectDestructiveChangesValidation",
      "requiresForceFlagValidation",
      // App leftovers
      "StatusEnum",
      "BaseMutator",
      "baseSchemaWithTimestamps",
      "baseImageFileSchema",
      // CLI presentation internals
      "logInfo",
      "logError",
      "formatChangeSummary",
      "withProgress",
    ];

    for (const name of removed) {
      expect(server, `server should not export ${name}`).not.toHaveProperty(name);
      expect(root, `root should not export ${name}`).not.toHaveProperty(name);
    }
  });

  it("should export the Zod field helper as TextField, not the engine's goja stub", () => {
    // The execution engine defines classes named TextField/BoolField/... that
    // emulate PocketBase's field constructors; they must never surface
    const field = server.TextField({ max: 5 });
    expect(field.safeParse("x").success).toBe(true);
    expect(field.safeParse("too long!").success).toBe(false);
  });

  it("should round-trip defineCollection metadata", () => {
    const collection = root.defineCollection({
      collectionName: "posts",
      schema: z.object({ title: root.TextField({ min: 1 }) }),
      indexes: ["CREATE INDEX idx_posts_title ON posts (title)"],
    });

    expect(JSON.parse(collection.description!)).toEqual({
      collectionName: "posts",
      indexes: ["CREATE INDEX idx_posts_title ON posts (title)"],
    });
  });

  it("should keep permission templates working", () => {
    expect(root.PermissionTemplates.public().listRule).toBe("");
    expect(root.PermissionTemplates.authenticated().listRule).toBe('@request.auth.id != ""');

    const resolved = root.resolveTemplate({
      template: "owner-only",
      ownerField: "OwnerUser",
      customRules: { listRule: '@request.auth.id != ""' },
    });
    expect(resolved.listRule).toBe('@request.auth.id != ""');
    expect(resolved.viewRule).toContain("OwnerUser = @request.auth.id");
  });
});
