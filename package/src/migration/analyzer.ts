/**
 * Schema Analyzer - Parses Zod schemas and extracts field definitions
 *
 * This module provides a standalone, configurable schema analyzer that can be used
 * by consumer projects to parse Zod schemas and convert them to PocketBase collection schemas.
 */

import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { extractRelationMetadata } from "../schema/base";
import { extractFieldMetadata } from "../schema/fields";
import type { PermissionSchema } from "../utils/permissions";
import { FileSystemError, SchemaParsingError } from "./errors";
import { PermissionAnalyzer } from "./permission-analyzer";
import type { CollectionSchema, FieldDefinition, SchemaDefinition } from "./types";
import { toCollectionName } from "./utils/pluralize";
import { getMaxSelect, getMinSelect, isRelationField, resolveTargetCollection } from "./utils/relation-detector";
import { extractFieldOptions, isFieldRequired, mapZodTypeToPocketBase } from "./utils/type-mapper";

// Register tsx loader for TypeScript file support
// This allows dynamic imports of .ts files to work
let tsxLoaderRegistered = false;
async function ensureTsxLoader(): Promise<void> {
  if (tsxLoaderRegistered) return;

  try {
    // Import tsx/esm to register the TypeScript loader hooks
    // This enables dynamic imports of .ts files in Node.js ESM
    await import("tsx/esm");
    tsxLoaderRegistered = true;
  } catch {
    // tsx is not available - will handle in importSchemaModule
    tsxLoaderRegistered = false;
  }
}

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
  schemaPatterns: ["Schema", "InputSchema", "Collection"],
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
 * Supports both JavaScript and TypeScript files using tsx
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
      resolvedPath = tsPath;
    } else {
      // Default to .js extension for ESM import
      resolvedPath = jsPath;
    }

    // If it's a TypeScript file, ensure tsx loader is registered
    if (resolvedPath.endsWith(".ts")) {
      await ensureTsxLoader();

      // Check if tsx was successfully registered
      if (!tsxLoaderRegistered) {
        throw new SchemaParsingError(
          `Failed to import TypeScript schema file. The 'tsx' package is required to load TypeScript files.\n` +
            `Please install tsx: npm install tsx (or yarn add tsx, or pnpm add tsx)\n` +
            `Alternatively, compile your schema files to JavaScript first.`,
          filePath
        );
      }
    }

    // Convert to file URL for proper ESM import
    const fileUrl = new URL(`file://${path.resolve(resolvedPath)}`);

    // Use dynamic import to load the module
    // tsx/esm will handle TypeScript files automatically if registered
    const module = await import(fileUrl.href);
    return module;
  } catch (error) {
    // Check if we're trying to import a TypeScript file
    const tsPath = `${filePath}.ts`;
    const isTypeScriptFile = fs.existsSync(tsPath);

    if (isTypeScriptFile && error instanceof SchemaParsingError) {
      // Re-throw SchemaParsingError as-is (already has helpful message)
      throw error;
    }

    if (isTypeScriptFile) {
      throw new SchemaParsingError(
        `Failed to import TypeScript schema file. The 'tsx' package is required to load TypeScript files.\n` +
          `Please install tsx: npm install tsx (or yarn add tsx, or pnpm add tsx)\n` +
          `Alternatively, compile your schema files to JavaScript first.`,
        filePath,
        error as Error
      );
    }

    throw new SchemaParsingError(
      `Failed to import schema module. Make sure the schema files exist and are valid.`,
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
 * Extracts the collection name from a Zod schema's metadata
 * Checks if the schema was created with defineCollection() which stores
 * the collection name in the schema description
 *
 * @param zodSchema - The Zod schema to extract collection name from
 * @returns The collection name if found in metadata, null otherwise
 */
export function extractCollectionNameFromSchema(zodSchema: z.ZodTypeAny): string | null {
  if (!zodSchema.description) {
    return null;
  }

  try {
    const metadata = JSON.parse(zodSchema.description);
    if (metadata.collectionName && typeof metadata.collectionName === "string") {
      return metadata.collectionName;
    }
  } catch {
    // Not JSON or no collectionName - this is expected for schemas without defineCollection
  }

  return null;
}

/**
 * Extracts the collection type from a Zod schema's metadata
 * Checks if the schema was created with defineCollection() which stores
 * the collection type in the schema description
 *
 * @param zodSchema - The Zod schema to extract collection type from
 * @returns The collection type ("base" | "auth") if found in metadata, null otherwise
 */
export function extractCollectionTypeFromSchema(zodSchema: z.ZodTypeAny): "base" | "auth" | null {
  if (!zodSchema.description) {
    return null;
  }

  try {
    const metadata = JSON.parse(zodSchema.description);
    if (metadata.type === "base" || metadata.type === "auth") {
      return metadata.type;
    }
  } catch {
    // Not JSON or no type - this is expected for schemas without explicit type
  }

  return null;
}

/**
 * Extracts Zod schema definitions from a module
 *
 * Detection priority (highest to lowest):
 * 1. Default export - recommended pattern for clarity and explicitness
 * 2. Named exports ending with "Collection" - contains metadata (indexes, permissions)
 * 3. Named exports ending with "Schema" - basic schema definitions
 * 4. Named exports ending with "InputSchema" - form input schemas
 *
 * @param module - The imported schema module
 * @param patterns - Schema name patterns to look for (default: ['Schema', 'InputSchema', 'Collection'])
 * @returns Object containing found schemas
 *
 * @example
 * // Recommended: Use default export
 * const UserCollection = defineCollection({ ... });
 * export default UserCollection;
 *
 * @example
 * // Also supported: Named export with pattern
 * export const UserCollection = defineCollection({ ... });
 */
export function extractSchemaDefinitions(
  module: any,
  patterns: string[] = ["Schema", "InputSchema", "Collection"]
): { inputSchema?: z.ZodObject<any>; schema?: z.ZodObject<any> } {
  const result: { inputSchema?: z.ZodObject<any>; schema?: z.ZodObject<any> } = {};

  // Priority 1: Check for default export (highest priority, most explicit)
  // This allows each file to have one clear schema definition
  if (module.default instanceof z.ZodObject) {
    // Default export is always the primary schema
    result.schema = module.default as z.ZodObject<any>;
    // If we have a default export, we can return early as it takes precedence
    // But we still check for InputSchema for backward compatibility
  }

  // Priority 2: Look for named exports matching patterns (for backward compatibility)
  for (const [key, value] of Object.entries(module)) {
    // Skip default export as we already handled it
    if (key === "default") continue;

    // Check if it's a Zod schema
    if (value instanceof z.ZodObject) {
      // Check for InputSchema pattern (used for form validation)
      if (patterns.includes("InputSchema") && key.endsWith("InputSchema")) {
        result.inputSchema = value as z.ZodObject<any>;
      } else if (!result.schema) {
        // Only set schema if we haven't found one via default export
        if (patterns.includes("Collection") && key.endsWith("Collection")) {
          // Prefer Collection over Schema as it has metadata (indexes, permissions)
          result.schema = value as z.ZodObject<any>;
        } else if (patterns.includes("Schema") && key.endsWith("Schema") && !key.endsWith("InputSchema")) {
          result.schema = value as z.ZodObject<any>;
        }
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
  // Check for explicit field metadata first (from field helper functions)
  const fieldMetadata = extractFieldMetadata(zodType.description);

  if (fieldMetadata) {
    // Use explicit metadata from field helpers
    // For number fields, default to required: false unless explicitly set
    // (because required: true in PocketBase means non-zero, which is often not desired)
    let required: boolean;
    if (fieldMetadata.type === "number") {
      // Check if required is explicitly set in options
      if (fieldMetadata.options?.required !== undefined) {
        required = fieldMetadata.options.required;
      } else {
        // Default to false for number fields to allow zero values
        // This allows zero values (e.g., progress: 0-100) unless explicitly set to required: true
        required = false;
      }
    } else {
      // For other field types, use standard logic
      required = isFieldRequired(zodType);
    }

    // Remove 'required' from options if present (it's a top-level property, not an option)
    const { required: _required, ...options } = fieldMetadata.options || {};

    const fieldDef: FieldDefinition = {
      name: fieldName,
      type: fieldMetadata.type,
      required,
      options: Object.keys(options).length > 0 ? options : undefined,
    };

    // If it's a relation type from metadata, we still need to extract relation config
    if (fieldMetadata.type === "relation") {
      const relationMetadata = extractRelationMetadata(zodType.description);
      if (relationMetadata) {
        fieldDef.relation = {
          collection: relationMetadata.collection,
          maxSelect: relationMetadata.maxSelect,
          minSelect: relationMetadata.minSelect,
          cascadeDelete: relationMetadata.cascadeDelete,
        };
      }
    }

    return fieldDef;
  }

  // Fall back to existing type inference logic
  const fieldType = mapZodTypeToPocketBase(zodType, fieldName);
  const required = isFieldRequired(zodType);
  const options = extractFieldOptions(zodType);

  const fieldDef: FieldDefinition = {
    name: fieldName,
    type: fieldType,
    required,
    options,
  };

  // Check for explicit relation metadata first (from relation() or relations() helpers)
  const relationMetadata = extractRelationMetadata(zodType.description);

  if (relationMetadata) {
    // Explicit relation definition found
    fieldDef.type = "relation";
    fieldDef.relation = {
      collection: relationMetadata.collection,
      maxSelect: relationMetadata.maxSelect,
      minSelect: relationMetadata.minSelect,
      cascadeDelete: relationMetadata.cascadeDelete,
    };

    // Clear out string-specific options that don't apply to relation fields
    fieldDef.options = undefined;
  }
  // Fall back to naming convention detection for backward compatibility
  else if (isRelationField(fieldName, zodType)) {
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

    // Clear out string-specific options that don't apply to relation fields
    // Options like 'min', 'max', 'pattern' are from string validation and don't apply to relations
    if (fieldDef.options) {
      const { min: _min, max: _max, pattern: _pattern, ...relationSafeOptions } = fieldDef.options;
      fieldDef.options = Object.keys(relationSafeOptions).length ? relationSafeOptions : undefined;
    }
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
  // Prefer explicit type from metadata, fall back to field detection
  const explicitType = extractCollectionTypeFromSchema(zodSchema);
  const collectionType = explicitType ?? (isAuthCollection(rawFields) ? "auth" : "base");

  // Build field definitions with constraints
  let fields: FieldDefinition[] = rawFields.map(({ name, zodType }) => buildFieldDefinition(name, zodType));

  // Exclude auth system fields for auth collections (PocketBase adds them automatically)
  if (collectionType === "auth") {
    const authSystemFieldNames = ["email", "emailVisibility", "verified", "password", "tokenKey"];
    fields = fields.filter((field) => !authSystemFieldNames.includes(field.name));
  }

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
