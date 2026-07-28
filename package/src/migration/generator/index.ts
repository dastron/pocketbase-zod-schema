/**
 * Migration Generator component
 * Creates PocketBase migration files based on detected differences
 *
 * This module provides a standalone, configurable migration generator that can be used
 * by consumer projects to generate PocketBase-compatible migration files.
 */

import * as fs from "fs";
import * as path from "path";
import { FileSystemError, MigrationGenerationError } from "../errors";
import type { CollectionOperation, SchemaDiff } from "../types";
import { type MigrationGeneratorConfig } from "./config";
import { createMigrationFileStructure, resolveMigrationDir, writeMigrationFile } from "./file-writer";
import { generateOperationDownMigration, generateOperationUpMigration } from "./migrator";
import { generateCollectionMigrationFilename, splitDiffByCollection } from "./operations";
import { generateTimestamp } from "./utils";

// Curated submodule surface — file-writer/config internals (mergeConfig,
// DEFAULT_CONFIG, generateFindCollectionCode, ...) stay module-private
export { type MigrationGeneratorConfig } from "./config";
export { createMigrationFileStructure, writeMigrationFile } from "./file-writer";
export { generateFieldDefinitionObject } from "./fields";
export { generateOperationDownMigration, generateOperationUpMigration } from "./migrator";
export { generateCollectionMigrationFilename, splitDiffByCollection } from "./operations";
export { generateCollectionPermissions } from "./rules";

/**
 * A migration file that has been generated but not yet written to disk
 */
export interface PlannedMigration {
  /** Filename the migration will be written as */
  filename: string;
  /** Complete migration file content */
  content: string;
  /** The collection operation this file was generated from */
  operation: CollectionOperation;
}

/**
 * Generates migration file contents from a schema diff without writing them
 *
 * Splitting planning from writing lets callers inspect or verify a migration
 * before it lands in the migrations directory — see the engine's
 * `verifyMigrationSources`, which the CLI's `generate --verify` runs over the
 * plan and aborts on.
 *
 * @param diff - Schema diff containing all changes
 * @param config - Migration generator configuration
 * @returns One planned migration per collection operation, in dependency order
 */
export function planMigrations(diff: SchemaDiff, config: MigrationGeneratorConfig | string): PlannedMigration[] {
  // Support legacy string-only parameter (migration directory)
  const normalizedConfig: MigrationGeneratorConfig = typeof config === "string" ? { migrationDir: config } : config;

  try {
    const migrationDir = resolveMigrationDir(normalizedConfig);

    // Check if there are any changes
    const hasChanges =
      diff.collectionsToCreate.length > 0 || diff.collectionsToModify.length > 0 || diff.collectionsToDelete.length > 0;

    // If no changes, return empty array
    if (!hasChanges) {
      return [];
    }

    // Build collection ID map from collections being created
    const collectionIdMap = new Map<string, string>();
    for (const collection of diff.collectionsToCreate) {
      if (collection.id) {
        collectionIdMap.set(collection.name, collection.id);
      }
    }
    // Also include deleted collections that might have IDs (for rollback)
    for (const collection of diff.collectionsToDelete) {
      if (collection.id) {
        collectionIdMap.set(collection.name, collection.id);
      }
    }
    // Add existing collection IDs from snapshot (for relation fields referencing existing collections)
    if (diff.existingCollectionIds) {
      for (const [name, id] of diff.existingCollectionIds) {
        collectionIdMap.set(name, id);
      }
    }

    // Generate base timestamp
    const baseTimestamp = generateTimestamp(normalizedConfig);

    // Split diff into individual collection operations
    const operations = splitDiffByCollection(diff, baseTimestamp);

    // Generate migration file for each operation
    const planned: PlannedMigration[] = [];

    // Read existing files for duplicate check
    let existingFiles: string[] = [];
    if (!normalizedConfig.force && fs.existsSync(migrationDir)) {
      existingFiles = fs
        .readdirSync(migrationDir)
        .filter((f) => f.endsWith(".js") || f.endsWith(".ts"))
        .map((f) => fs.readFileSync(path.join(migrationDir, f), "utf-8"));
    }

    for (const operation of operations) {
      // Generate up and down migration code for this operation
      const upCode = generateOperationUpMigration(operation, collectionIdMap);
      const downCode = generateOperationDownMigration(operation, collectionIdMap);

      // Create migration file structure
      const content = createMigrationFileStructure(upCode, downCode, normalizedConfig);

      // Check for duplicates
      if (!normalizedConfig.force && existingFiles.some((existingContent) => existingContent === content)) {
        console.warn(
          `Duplicate migration detected for ${operation.type} ${
            typeof operation.collection === "string" ? operation.collection : operation.collection.name
          }. Skipping...`
        );
        continue;
      }

      // Generate filename for this operation
      const filename = generateCollectionMigrationFilename(operation);

      planned.push({ filename, content, operation });
    }

    return planned;
  } catch (error) {
    // If it's already a MigrationGenerationError or FileSystemError, re-throw it
    if (error instanceof MigrationGenerationError || error instanceof FileSystemError) {
      throw error;
    }

    // Otherwise, wrap it in a MigrationGenerationError
    throw new MigrationGenerationError(
      `Failed to generate migration: ${error instanceof Error ? error.message : String(error)}`,
      normalizedConfig.migrationDir,
      error as Error
    );
  }
}

/**
 * Main generation function
 * Generates migration files from schema diff (one file per collection operation)
 *
 * @param diff - Schema diff containing all changes
 * @param config - Migration generator configuration
 * @returns Array of paths to the generated migration files
 */
export function generate(diff: SchemaDiff, config: MigrationGeneratorConfig | string): string[] {
  const normalizedConfig: MigrationGeneratorConfig = typeof config === "string" ? { migrationDir: config } : config;
  const planned = planMigrations(diff, normalizedConfig);

  if (planned.length === 0) {
    return [];
  }

  const migrationDir = resolveMigrationDir(normalizedConfig);
  return writePlannedMigrations(planned, migrationDir);
}

/**
 * Writes planned migrations to disk, in order
 *
 * @param planned - Migrations produced by planMigrations()
 * @param migrationDir - Absolute path to the migrations directory
 * @returns Array of paths to the written files
 */
export function writePlannedMigrations(planned: PlannedMigration[], migrationDir: string): string[] {
  return planned.map((migration) => writeMigrationFile(migrationDir, migration.filename, migration.content));
}
