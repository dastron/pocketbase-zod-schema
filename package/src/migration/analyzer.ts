/**
 * Schema Analyzer - Parses Zod schemas and extracts field definitions
 *
 * This module provides a standalone, configurable schema analyzer that can be used
 * by consumer projects to parse Zod schemas and convert them to PocketBase collection schemas.
 */

import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import type { PermissionSchema } from "../utils/permissions";
import { FileSystemError, SchemaParsingError } from "./errors";
import { PermissionAnalyzer } from "./permission-analyzer";
import type { CollectionSchema, FieldDefinition, SchemaDefinition } from "./types";
import { toCollectionName } from "./utils/pluralize";
import { getMaxSelect, getMinSelect, isRelationField, resolveTargetCollection } from "./utils/relation-detector";
import { extractFieldOptions, isFieldRequired, mapZodTypeToPocketBase } from "./utils/type-mapper";

/**
 * Configuration options for schema discovery and parsing
 */
export interface SchemaAnalyzerConfig {
  /**
   * Directory containing schema files (source or compiled)
   * Can be absolute or relative to workspaceRoot
   */
  schemaDir: string;

  /**
   * Workspace root directory for resolving relative paths
   * Defaults to process.cwd()
   */
  workspaceRoot?: string;

  /**
   * File patterns to exclude from schema discovery
   * Defaults to ['base.ts', 'index.ts', 'permissions.ts', 'permission-templates.ts']
   */
  excludePatterns?: string[];

  /**
   * File extensions to include in schema discovery
   * Defaults to ['.ts', '.js']
   */
  includeExtensions?: string[];

  /**
   * Schema export name patterns to look for
   * Defaults to ['Schema', 'InputSchema']
   */
  schemaPatterns?: string[];

  /**
   * Whether to use compiled JavaScript files instead of TypeScript source
   * When true, looks for .js files; when false, looks for .ts files
   * Defaults to true (use compiled files for dynamic import)
   */
  useCompiledFiles?: boolean;

  /**
   * Custom path transformation function for converting source paths to import paths
   * Useful for monorepo setups where source and dist directories differ
   * If not provided, uses the schemaDir directly
   */
  pathTransformer?: (sourcePath: string) => string;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Omit<SchemaAnalyzerConfig, "schemaDir" | "pathTransformer">> = {
  workspaceRoot: process.cwd(),
  excludePatterns: [
    "base.ts",
    "index.ts",
    "permissions.ts",
    "permission-templates.ts",
    "base.js",
    "index.js",
    "permissions.js",
    "permission-templates.js",
  ],
  includeExtensions: [".ts", ".js"],
  schemaPatterns: ["Schema", "InputSchema"],
  useCompiledFiles: true,
};

/**
 * Merges user config with defaults
 */
function mergeConfig(
  config: SchemaAnalyzerConfig
): Required<Omit<SchemaAnalyzerConfig, "pathTransformer">> & { pathTransformer?: (sourcePath: string) => string } {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    excludePatterns: config.excludePatterns || DEFAULT_CONFIG.excludePatterns,
    includeExtensions: config.includeExtensions || DEFAULT_CONFIG.includeExtensions,
    schemaPatterns: config.schemaPatterns || DEFAULT_CONFIG.schemaPatterns,
  };
}

/**
 * Resolves the schema directory path
 */
function resolveSchemaDir(config: SchemaAnalyzerConfig): string {
  const workspaceRoot = config.workspaceRoot || process.cwd();

  if (path.isAbsolute(config.schemaDir)) {
    return config.schemaDir;
  }

  return path.join(workspaceRoot, config.schemaDir);
}

/**
 * Discovers schema files in the specified directory
 * Filters based on configuration patterns
 *
 * @param config - Schema analyzer configuration
 * @returns Array of schema file paths (without extension)
 */
export function discoverSchemaFiles(config: SchemaAnalyzerConfig | string): string[] {
  // Support legacy string-only parameter
  const normalizedConfig: SchemaAnalyzerConfig = typeof config === "string" ? { schemaDir: config } : config;

  const mergedConfig = mergeConfig(normalizedConfig);
  const schemaDir = resolveSchemaDir(normalizedConfig);

  try {
    if (!fs.existsSync(schemaDir)) {
      throw new FileSystemError(`Schema directory not found: ${schemaDir}`, schemaDir, "access", "ENOENT");
    }

    const files = fs.readdirSync(schemaDir);

    // Filter files based on configuration
    const schemaFiles = files.filter((file) => {
      // Check extension
      const hasValidExtension = mergedConfig.includeExtensions.some((ext) => file.endsWith(ext));
      if (!hasValidExtension) return false;

      // Check exclusion patterns
      const isExcluded = mergedConfig.excludePatterns.some((pattern) => {
        // Support both exact match and glob-like patterns
        if (pattern.includes("*")) {
          const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
          return regex.test(file);
        }
        return file === pattern;
      });
      if (isExcluded) return false;

      return true;
    });

    // Return full paths without extension (for dynamic import)
    return schemaFiles.map((file) => {
      const ext = mergedConfig.includeExtensions.find((ext) => file.endsWith(ext)) || ".ts";
      return path.join(schemaDir, file.replace(new RegExp(`\\${ext}$`), ""));
    });
  } catch (error) {
    if (error instanceof FileSystemError) {
      throw error;
    }

    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === "EACCES" || fsError.code === "EPERM") {
      throw new FileSystemError(
        `Permission denied reading schema directory: ${schemaDir}`,
        schemaDir,
        "read",
        fsError.code,
        error as Error
      );
    }

    throw new FileSystemError(
      `Failed to read schema directory: ${schemaDir}`,
      schemaDir,
      "read",
      fsError.code,
      error as Error
    );
  }
}

/**
 * Dynamically imports a schema module
 *
 * @param filePath - Path to the schema file (without extension)
 * @param config - Optional configuration for path transformation
 * @returns The imported module
 */
export async function importSchemaModule(filePath: string, config?: SchemaAnalyzerConfig): Promise<any> {
  try {
    let importPath = filePath;

    // Apply path transformation if provided
    if (config?.pathTransformer) {
      importPath = config.pathTransformer(filePath);
    }

    // Determine the file extension to use
    // Try .js first (for compiled files), then .ts (for source files)
    let resolvedPath: string | null = null;
    const jsPath = `${importPath}.js`;
    const tsPath = `${importPath}.ts`;

    if (fs.existsSync(jsPath)) {
      resolvedPath = jsPath;
    } else if (fs.existsSync(tsPath)) {
      // Try to import TypeScript files directly
      // This will work if tsx or another TypeScript loader is being used
      // Otherwise, it will fail with a helpful error message
      resolvedPath = tsPath;
    } else {
      // Default to .js extension for ESM import
      resolvedPath = jsPath;
    }

    // Convert to file URL for proper ESM import
    const fileUrl = new URL(`file://${path.resolve(resolvedPath)}`);

    // Use dynamic import to load the module
    const module = await import(fileUrl.href);
    return module;
  } catch (error) {
    // Check if we're trying to import a TypeScript file
    const tsPath = `${filePath}.ts`;
    const isTypeScriptFile = fs.existsSync(tsPath);

    if (isTypeScriptFile) {
      throw new SchemaParsingError(
        `Failed to import TypeScript schema file. Node.js cannot import TypeScript files directly.\n` +
          `Please either:\n` +
          `  1. Compile your schema files to JavaScript first, or\n` +
          `  2. Use tsx to run the migration tool (e.g., "npx tsx package/dist/cli/migrate.js status" or "tsx package/dist/cli/migrate.js status")`,
        filePath,
        error as Error
      );
    }

    throw new SchemaParsingError(
      `Failed to import schema module. Make sure the schema files are compiled to JavaScript.`,
      filePath,
      error as Error
    );
  }
}

/**
 * Gets the collection name from a schema file path
 * Converts the filename (without extension) to a pluralized collection name
 *
 * @param filePath - Path to the schema file (with or without extension)
 * @returns The collection name
 */
export function getCollectionNameFromFile(filePath: string): string {
  // Remove both .ts and .js extensions if present
  const filename = path.basename(filePath).replace(/\.(ts|js)$/, "");
  return toCollectionName(filename);
}

/**
 * Extracts Zod schema definitions from a module
 * Looks for schemas ending with configured patterns (default: "Schema" or "InputSchema")
 *
 * @param module - The imported schema module
 * @param patterns - Schema name patterns to look for (default: ['Schema', 'InputSchema'])
 * @returns Object containing found schemas
 */
export function extractSchemaDefinitions(
  module: any,
  patterns: string[] = ["Schema", "InputSchema"]
): { inputSchema?: z.ZodObject<any>; schema?: z.ZodObject<any> } {
  const result: { inputSchema?: z.ZodObject<any>; schema?: z.ZodObject<any> } = {};

  // Look for InputSchema and Schema exports
  for (const [key, value] of Object.entries(module)) {
    // Check if it's a Zod schema
    if (value instanceof z.ZodObject) {
      // Check for InputSchema pattern first (more specific)
      if (patterns.includes("InputSchema") && key.endsWith("InputSchema")) {
        result.inputSchema = value as z.ZodObject<any>;
      } else if (patterns.includes("Schema") && key.endsWith("Schema") && !key.endsWith("InputSchema")) {
        result.schema = value as z.ZodObject<any>;
      }
    }
  }

  return result;
}

/**
 * Identifies whether to use InputSchema or Schema pattern
 * Prefers Schema over InputSchema as it includes base fields
 *
 * @param schemas - Object containing inputSchema and/or schema
 * @returns The schema to use for collection definition
 */
export function selectSchemaForCollection(schemas: {
  inputSchema?: z.ZodObject<any>;
  schema?: z.ZodObject<any>;
}): z.ZodObject<any> | null {
  // Prefer the full Schema over InputSchema as it includes base fields
  if (schemas.schema) {
    return schemas.schema;
  }

  if (schemas.inputSchema) {
    return schemas.inputSchema;
  }

  return null;
}

/**
 * Extracts field definitions from a Zod object schema
 * Filters out base schema fields (id, collectionId, created, updated, expand)
 *
 * @param zodSchema - The Zod object schema
 * @param excludeFields - Additional fields to exclude (default: base schema fields)
 * @returns Array of field names and their Zod types
 */
export function extractFieldDefinitions(
  zodSchema: z.ZodObject<any>,
  excludeFields?: string[]
): Array<{ name: string; zodType: z.ZodTypeAny }> {
  const shape = zodSchema.shape;
  const fields: Array<{ name: string; zodType: z.ZodTypeAny }> = [];

  // Base schema fields to exclude (these are system fields in PocketBase)
  const baseFields = ["id", "collectionId", "collectionName", "created", "updated", "expand"];

  // Additional fields to exclude (image file handling fields)
  const defaultExcludeFields = ["thumbnailURL", "imageFiles"];

  // Combine all exclusions
  const allExclusions = new Set([...baseFields, ...defaultExcludeFields, ...(excludeFields || [])]);

  for (const [fieldName, zodType] of Object.entries(shape)) {
    // Skip excluded fields
    if (!allExclusions.has(fieldName)) {
      fields.push({ name: fieldName, zodType: zodType as z.ZodTypeAny });
    }
  }

  return fields;
}

/**
 * Detects if a collection is an auth collection
 * Auth collections have email and password fields
 *
 * @param fields - Array of field definitions
 * @returns True if the collection is an auth collection
 */
export function isAuthCollection(fields: Array<{ name: string; zodType: z.ZodTypeAny }>): boolean {
  const fieldNames = fields.map((f) => f.name.toLowerCase());

  // Auth collections must have both email and password fields
  const hasEmail = fieldNames.includes("email");
  const hasPassword = fieldNames.includes("password");

  return hasEmail && hasPassword;
}

/**
 * Extracts validation constraints from Zod type
 * Includes min, max, required, unique, and other options
 *
 * @param fieldName - The field name
 * @param zodType - The Zod type
 * @returns Field definition with constraints
 */
export function buildFieldDefinition(fieldName: string, zodType: z.ZodTypeAny): FieldDefinition {
  const fieldType = mapZodTypeToPocketBase(zodType, fieldName);
  const required = isFieldRequired(zodType);
  const options = extractFieldOptions(zodType);

  const fieldDef: FieldDefinition = {
    name: fieldName,
    type: fieldType,
    required,
    options,
  };

  // Handle relation fields
  if (isRelationField(fieldName, zodType)) {
    // Override type to 'relation' for relation fields
    fieldDef.type = "relation";

    const targetCollection = resolveTargetCollection(fieldName);
    const maxSelect = getMaxSelect(fieldName, zodType);
    const minSelect = getMinSelect(fieldName, zodType);

    fieldDef.relation = {
      collection: targetCollection,
      maxSelect,
      minSelect,
      cascadeDelete: false, // Default to false, can be configured later
    };
  }

  return fieldDef;
}

/**
 * Extracts index definitions from a Zod schema
 * Parses the schema description metadata to find index definitions
 *
 * @param schema - Zod schema with index metadata
 * @returns Array of index SQL statements or undefined
 */
export function extractIndexes(schema: z.ZodTypeAny): string[] | undefined {
  // Try to extract indexes from schema description
  const schemaDescription = schema.description;

  if (!schemaDescription) {
    return undefined;
  }

  try {
    const metadata = JSON.parse(schemaDescription);

    // Check if indexes are present in metadata
    if (metadata.indexes && Array.isArray(metadata.indexes)) {
      return metadata.indexes;
    }
  } catch {
    // If description is not valid JSON, return undefined
  }

  return undefined;
}

/**
 * Converts a Zod schema to a CollectionSchema interface
 *
 * @param collectionName - The name of the collection
 * @param zodSchema - The Zod object schema
 * @returns CollectionSchema definition
 */
export function convertZodSchemaToCollectionSchema(
  collectionName: string,
  zodSchema: z.ZodObject<any>
): CollectionSchema {
  // Extract field definitions from Zod schema
  const rawFields = extractFieldDefinitions(zodSchema);

  // Determine collection type (auth or base)
  const collectionType = isAuthCollection(rawFields) ? "auth" : "base";

  // Build field definitions with constraints
  const fields: FieldDefinition[] = rawFields.map(({ name, zodType }) => buildFieldDefinition(name, zodType));

  // Extract indexes from schema
  const indexes = extractIndexes(zodSchema) || [];

  // Extract and validate permissions from schema
  const permissionAnalyzer = new PermissionAnalyzer();
  let permissions: PermissionSchema | undefined = undefined;

  // Try to extract permissions from schema description
  const schemaDescription = zodSchema.description;
  const extractedPermissions = permissionAnalyzer.extractPermissions(schemaDescription);

  if (extractedPermissions) {
    // Resolve template configurations to concrete rules
    const resolvedPermissions = permissionAnalyzer.resolvePermissions(extractedPermissions);

    // Validate permissions against collection fields
    const validationResults = permissionAnalyzer.validatePermissions(
      collectionName,
      resolvedPermissions,
      fields,
      collectionType === "auth"
    );

    // Log validation errors and warnings
    for (const [ruleType, result] of validationResults) {
      if (!result.valid) {
        console.error(`[${collectionName}] Permission validation failed for ${ruleType}:`);
        result.errors.forEach((error) => console.error(`  - ${error}`));
      }

      if (result.warnings.length > 0) {
        console.warn(`[${collectionName}] Permission warnings for ${ruleType}:`);
        result.warnings.forEach((warning) => console.warn(`  - ${warning}`));
      }
    }

    // Merge with defaults to ensure all rules are defined
    permissions = permissionAnalyzer.mergeWithDefaults(resolvedPermissions);
  }

  // Build collection schema
  // Use extracted permissions for rules, falling back to nulls
  const collectionSchema: CollectionSchema = {
    name: collectionName,
    type: collectionType,
    fields,
    indexes,
    rules: {
      listRule: permissions?.listRule ?? null,
      viewRule: permissions?.viewRule ?? null,
      createRule: permissions?.createRule ?? null,
      updateRule: permissions?.updateRule ?? null,
      deleteRule: permissions?.deleteRule ?? null,
      manageRule: permissions?.manageRule ?? null,
    },
    permissions,
  };

  return collectionSchema;
}

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

      // Get collection name from file
      const collectionName = getCollectionNameFromFile(filePath);

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
