import * as path from "path";
import { z } from "zod";
import { toCollectionName } from "../utils/pluralize";

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
