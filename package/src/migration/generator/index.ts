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
import type { SchemaDiff } from "../types";
import { mergeConfig, type MigrationGeneratorConfig } from "./config";
import { createMigrationFileStructure, resolveMigrationDir, writeMigrationFile } from "./file-writer";
import { generateDownMigration, generateOperationDownMigration, generateOperationUpMigration, generateUpMigration } from "./migrator";
import { generateCollectionMigrationFilename, generateMigrationFilename, splitDiffByCollection } from "./operations";
import { generateTimestamp } from "./utils";

// Export everything from submodules
export * from "./collections";
export * from "./config";
export * from "./fields";
export * from "./file-writer";
export * from "./indexes";
export * from "./migrator";
export * from "./operations";
export * from "./rules";
export * from "./utils";

/**
 * Main generation function
 * Generates migration files from schema diff (one file per collection operation)
 *
 * @param diff - Schema diff containing all changes
 * @param config - Migration generator configuration
 * @returns Array of paths to the generated migration files
 */
export function generate(diff: SchemaDiff, config: MigrationGeneratorConfig | string): string[] {
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
    const filePaths: string[] = [];

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

      // Write migration file
      const filePath = writeMigrationFile(migrationDir, filename, content);

      filePaths.push(filePath);
    }

    return filePaths;
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
 * MigrationGenerator class for object-oriented usage
 * Provides a stateful interface for migration generation
 */
export class MigrationGenerator {
  private config: Required<MigrationGeneratorConfig>;

  constructor(config: MigrationGeneratorConfig) {
    this.config = mergeConfig(config);
  }

  /**
   * Generates migration files from a schema diff
   * Returns array of file paths (one per collection operation)
   */
  generate(diff: SchemaDiff): string[] {
    return generate(diff, this.config);
  }

  /**
   * Generates the up migration code without writing to file
   */
  generateUpMigration(diff: SchemaDiff): string {
    return generateUpMigration(diff);
  }

  /**
   * Generates the down migration code without writing to file
   */
  generateDownMigration(diff: SchemaDiff): string {
    return generateDownMigration(diff);
  }

  /**
   * Generates a migration filename
   */
  generateMigrationFilename(diff: SchemaDiff): string {
    return generateMigrationFilename(diff, this.config);
  }
}
