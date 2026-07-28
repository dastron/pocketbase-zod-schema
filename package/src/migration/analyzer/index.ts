/**
 * Schema Analyzer - Parses Zod schemas and extracts field definitions
 *
 * This module provides a standalone, configurable schema analyzer that can be used
 * by consumer projects to parse Zod schemas and convert them to PocketBase collection schemas.
 */

import * as fs from "fs";
import { SchemaParsingError } from "../errors";
import type { CollectionSchema, SchemaDefinition } from "../types";
import { mergeConfig, resolveSchemaDir, type SchemaAnalyzerConfig } from "./config";
import { convertZodSchemaToCollectionSchema } from "./converter";
import { selectCollectionSchema } from "./extractors";
import { discoverSchemaFiles, importSchemaModule } from "./loader";

// Curated submodule surface — config internals (mergeConfig, DEFAULT_CONFIG,
// resolveSchemaDir) stay module-private
export { type SchemaAnalyzerConfig } from "./config";
export { buildFieldDefinition, convertZodSchemaToCollectionSchema } from "./converter";
export {
  extractCollectionNameFromSchema,
  extractCollectionTypeFromSchema,
  extractFieldDefinitions,
  extractIndexes,
  extractViewQueryFromSchema,
  selectCollectionSchema,
  type CollectionSchemaExport,
} from "./extractors";
export { discoverSchemaFiles, importSchemaModule } from "./loader";

/**
 * Parses schema files and returns a SchemaDefinition
 * Main entry point for the Schema Analyzer
 *
 * A file contributes a collection iff one of its exports is a Zod object
 * whose description carries collection metadata (what defineCollection()/
 * defineView() produce). Files without such an export are skipped with a
 * warning; a file with more than one, or two files declaring the same
 * collection name, are errors.
 *
 * @param config - Schema analyzer configuration
 * @returns Complete SchemaDefinition with all collections
 */
export async function parseSchemaFiles(config: SchemaAnalyzerConfig): Promise<SchemaDefinition> {
  const mergedConfig = mergeConfig(config);
  const collections = new Map<string, CollectionSchema>();
  const collectionSources = new Map<string, string>();

  // Discover schema files
  const schemaFiles = discoverSchemaFiles(config);

  if (schemaFiles.length === 0) {
    const schemaDir = resolveSchemaDir(config);
    throw new SchemaParsingError(
      `No schema files found in ${schemaDir}. Make sure you have schema files in the directory.`,
      schemaDir
    );
  }

  // Process each schema file
  for (const filePath of schemaFiles) {
    try {
      let importPath = filePath;

      // Apply path transformation if provided (for monorepo setups)
      if (config.pathTransformer) {
        importPath = config.pathTransformer(filePath);
      } else if (mergedConfig.useCompiledFiles) {
        // Default transformation: convert /src/ to /dist/ for compiled files
        // This is a common pattern but can be overridden with pathTransformer
        const distPath = filePath.replace(/\/src\//, "/dist/");
        // Only use dist path if it actually exists (i.e., files are compiled)
        // Otherwise, fall back to source path for TypeScript files
        if (fs.existsSync(`${distPath}.js`) || fs.existsSync(`${distPath}.mjs`)) {
          importPath = distPath;
        } else {
          // Files aren't compiled, use source path
          importPath = filePath;
        }
      }

      // Import the module
      const module = await importSchemaModule(importPath, config);

      // Find the export carrying collection metadata
      const collectionExport = selectCollectionSchema(module);

      if (!collectionExport) {
        console.warn(
          `${filePath}: no export carries collection metadata (use defineCollection()/defineView()); skipping. ` +
            `If this file previously produced a collection, the diff may now propose deleting it.`
        );
        continue;
      }

      const { collectionName, schema } = collectionExport;

      // Two files declaring the same collection would silently overwrite each
      // other in the map — surface it instead
      const existingSource = collectionSources.get(collectionName);
      if (existingSource) {
        throw new SchemaParsingError(
          `Collection "${collectionName}" is declared in both ${existingSource} and ${filePath}. ` +
            `Collection names must be unique across schema files.`,
          filePath
        );
      }

      // Convert to CollectionSchema
      const collectionSchema = convertZodSchemaToCollectionSchema(collectionName, schema);

      // Add to collections map
      collections.set(collectionName, collectionSchema);
      collectionSources.set(collectionName, filePath);
    } catch (error) {
      // If it's already a SchemaParsingError, re-throw it
      if (error instanceof SchemaParsingError) {
        throw error;
      }

      // Otherwise, wrap it in a SchemaParsingError
      throw new SchemaParsingError(
        `Error processing schema file: ${error instanceof Error ? error.message : String(error)}`,
        filePath,
        error as Error
      );
    }
  }

  return { collections };
}
