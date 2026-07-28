import { z } from "zod";

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
 * @returns The collection type ("base" | "auth" | "view") if found in metadata, null otherwise
 */
export function extractCollectionTypeFromSchema(zodSchema: z.ZodTypeAny): "base" | "auth" | "view" | null {
  if (!zodSchema.description) {
    return null;
  }

  try {
    const metadata = JSON.parse(zodSchema.description);
    if (metadata.type === "base" || metadata.type === "auth" || metadata.type === "view") {
      return metadata.type;
    }
  } catch {
    // Not JSON or no type - this is expected for schemas without explicit type
  }

  return null;
}

/**
 * Extracts the SQL query backing a view collection from a Zod schema's metadata
 * Set by defineView() (or defineCollection with type: "view")
 *
 * @param zodSchema - The Zod schema to extract the view query from
 * @returns The SQL query if found in metadata, null otherwise
 */
export function extractViewQueryFromSchema(zodSchema: z.ZodTypeAny): string | null {
  if (!zodSchema.description) {
    return null;
  }

  try {
    const metadata = JSON.parse(zodSchema.description);
    if (typeof metadata.viewQuery === "string") {
      return metadata.viewQuery;
    }
  } catch {
    // Not JSON or no viewQuery - expected for non-view collections
  }

  return null;
}

/**
 * A collection schema found in a module's exports
 */
export interface CollectionSchemaExport {
  /** The Zod object schema carrying the collection metadata */
  schema: z.ZodObject<any>;
  /** The export the schema was found under ("default" or the named export) */
  exportName: string;
  /** The collection name declared in the metadata */
  collectionName: string;
}

/**
 * Selects the collection schema from a module's exports.
 *
 * A Zod object export is a collection iff its description carries collection
 * metadata (a JSON `collectionName`), which is what defineCollection()/
 * defineView() produce. Export names carry no meaning; a default export is
 * reported as "default" but wins no precedence — candidates are deduplicated
 * by object reference, so `export default X; export { X }` counts once.
 *
 * @param module - The imported schema module
 * @returns The single collection export, or null when the module declares none
 * @throws Error when the module exports more than one distinct collection
 */
export function selectCollectionSchema(module: any): CollectionSchemaExport | null {
  const seen = new Set<z.ZodObject<any>>();
  const candidates: CollectionSchemaExport[] = [];

  const consider = (exportName: string, value: unknown) => {
    if (!(value instanceof z.ZodObject) || seen.has(value)) {
      return;
    }

    const collectionName = extractCollectionNameFromSchema(value);
    if (!collectionName) {
      return;
    }

    seen.add(value);
    candidates.push({ schema: value, exportName, collectionName });
  };

  consider("default", module.default);
  for (const [key, value] of Object.entries(module)) {
    if (key !== "default") {
      consider(key, value);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length > 1) {
    const names = candidates.map((c) => `${c.exportName} (${c.collectionName})`).join(", ");
    throw new Error(
      `Multiple collection schemas exported from one file: ${names}. ` + `Define one collection per file.`
    );
  }

  return candidates[0];
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

  // Combine all exclusions
  const allExclusions = new Set([...baseFields, ...(excludeFields || [])]);

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
