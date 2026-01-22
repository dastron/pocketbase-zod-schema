/**
 * Schema Analyzer - Parses Zod schemas and extracts field definitions
 *
 * This module provides a standalone, configurable schema analyzer that can be used
 * by consumer projects to parse Zod schemas and convert them to PocketBase collection schemas.
 */

import * as fs from "fs";
import { z } from "zod";
import { SchemaParsingError } from "../errors";
import type { CollectionSchema, SchemaDefinition } from "../types";
import { mergeConfig, resolveSchemaDir, type SchemaAnalyzerConfig } from "./config";
import { convertZodSchemaToCollectionSchema } from "./converter";
import {
  extractCollectionNameFromSchema,
  extractSchemaDefinitions,
  getCollectionNameFromFile,
  selectSchemaForCollection,
} from "./extractors";
import { discoverSchemaFiles, importSchemaModule } from "./loader";

// Export everything from submodules
export * from "./config";
export * from "./converter";
export * from "./extractors";
export * from "./loader";

/**
 * Builds a complete SchemaDefinition from schema files
 * Main entry point for the Schema Analyzer
 *
 * @param config - Schema analyzer configuration or path to schema directory
 * @returns Complete SchemaDefinition with all collections
 */
export async function buildSchemaDefinition(config: SchemaAnalyzerConfig | string): Promise<SchemaDefinition> {
  // Support legacy string-only parameter
  const normalizedConfig: SchemaAnalyzerConfig = typeof config === "string" ? { schemaDir: config } : config;

  const mergedConfig = mergeConfig(normalizedConfig);
  const collections = new Map<string, CollectionSchema>();

  // Discover schema files
  const schemaFiles = discoverSchemaFiles(normalizedConfig);

  if (schemaFiles.length === 0) {
    const schemaDir = resolveSchemaDir(normalizedConfig);
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
      if (normalizedConfig.pathTransformer) {
        importPath = normalizedConfig.pathTransformer(filePath);
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
      const module = await importSchemaModule(importPath, normalizedConfig);

      // Extract schema definitions
      const schemas = extractSchemaDefinitions(module, mergedConfig.schemaPatterns);

      // Select the appropriate schema
      const zodSchema = selectSchemaForCollection(schemas);

      if (!zodSchema) {
        console.warn(`No valid schema found in ${filePath}, skipping...`);
        continue;
      }

      // Get collection name - prefer metadata from defineCollection(), fall back to filename
      const collectionNameFromSchema = extractCollectionNameFromSchema(zodSchema);
      const collectionName = collectionNameFromSchema ?? getCollectionNameFromFile(filePath);

      // Convert to CollectionSchema
      const collectionSchema = convertZodSchemaToCollectionSchema(collectionName, zodSchema);

      // Add to collections map
      collections.set(collectionName, collectionSchema);
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

/**
 * Parses schema files and returns SchemaDefinition
 * Alias for buildSchemaDefinition for better semantic clarity
 *
 * @param config - Schema analyzer configuration or path to schema directory
 * @returns Complete SchemaDefinition with all collections
 */
export async function parseSchemaFiles(config: SchemaAnalyzerConfig | string): Promise<SchemaDefinition> {
  return buildSchemaDefinition(config);
}

/**
 * Creates a SchemaAnalyzer instance with the given configuration
 * Provides an object-oriented interface for schema analysis
 */
export class SchemaAnalyzer {
  private config: Required<Omit<SchemaAnalyzerConfig, "pathTransformer">> & {
    pathTransformer?: (sourcePath: string) => string;
  };

  constructor(config: SchemaAnalyzerConfig) {
    this.config = mergeConfig(config);
  }

  /**
   * Discovers schema files in the configured directory
   */
  discoverSchemaFiles(): string[] {
    return discoverSchemaFiles(this.config);
  }

  /**
   * Parses all schema files and returns a SchemaDefinition
   */
  async parseSchemaFiles(): Promise<SchemaDefinition> {
    return buildSchemaDefinition(this.config);
  }

  /**
   * Converts a single Zod schema to a CollectionSchema
   */
  convertZodSchemaToCollectionSchema(name: string, schema: z.ZodObject<any>): CollectionSchema {
    return convertZodSchemaToCollectionSchema(name, schema);
  }
}
