import { z } from "zod";
import type { PermissionSchema, PermissionTemplateConfig } from "../utils/permissions";

/**
 * Base schema fields that PocketBase automatically adds to all records
 * These fields are managed by PocketBase and should not be set manually
 */
export const baseSchema = {
  id: z.string().describe("unique id"),
  collectionId: z.string().describe("collection id"),
  collectionName: z.string().describe("collection name"),
  expand: z.record(z.any()).describe("expandable fields"),
};

/**
 * Extended base schema with timestamp fields
 * Includes created and updated autodate fields
 */
export const baseSchemaWithTimestamps = {
  ...baseSchema,
  created: z.string().describe("creation timestamp"),
  updated: z.string().describe("last update timestamp"),
};

/**
 * Base schema for image file collections
 * Extends base schema with thumbnail URL and image files array
 */
export const baseImageFileSchema = {
  ...baseSchema,
  thumbnailURL: z.string().optional(),
  imageFiles: z.array(z.string()),
};

/**
 * Input schema for image file uploads
 * Used in forms where users upload File objects
 * Requires Node.js 20+ or browser environment with File API
 */
export const inputImageFileSchema = {
  imageFiles: z.array(z.instanceof(File)),
};

/**
 * Helper constant for omitting image files from schemas
 * Used with Zod's .omit() method
 */
export const omitImageFilesSchema = {
  imageFiles: true,
} as const;

// ============================================================================
// Common PocketBase Field Type Patterns
// ============================================================================

/**
 * Creates a text field schema with optional constraints
 * @param options - Optional constraints for the text field
 */
export function textField(options?: { min?: number; max?: number; pattern?: RegExp }) {
  let schema = z.string();
  if (options?.min !== undefined) schema = schema.min(options.min);
  if (options?.max !== undefined) schema = schema.max(options.max);
  if (options?.pattern !== undefined) schema = schema.regex(options.pattern);
  return schema;
}

/**
 * Creates an email field schema
 * Maps to PocketBase 'email' field type
 */
export function emailField() {
  return z.string().email();
}

/**
 * Creates a URL field schema
 * Maps to PocketBase 'url' field type
 */
export function urlField() {
  return z.string().url();
}

/**
 * Creates a number field schema with optional constraints
 * @param options - Optional constraints for the number field
 */
export function numberField(options?: { min?: number; max?: number }) {
  let schema = z.number();
  if (options?.min !== undefined) schema = schema.min(options.min);
  if (options?.max !== undefined) schema = schema.max(options.max);
  return schema;
}

/**
 * Creates a boolean field schema
 * Maps to PocketBase 'bool' field type
 */
export function boolField() {
  return z.boolean();
}

/**
 * Creates a date field schema
 * Maps to PocketBase 'date' field type
 */
export function dateField() {
  return z.date();
}

/**
 * Creates a select field schema from enum values
 * Maps to PocketBase 'select' field type
 * @param values - Array of allowed string values
 */
export function selectField<T extends [string, ...string[]]>(values: T) {
  return z.enum(values);
}

/**
 * Creates a JSON field schema
 * Maps to PocketBase 'json' field type
 * @param schema - Optional Zod schema for the JSON structure
 */
export function jsonField<T extends z.ZodTypeAny>(schema?: T) {
  return schema ?? z.record(z.any());
}

/**
 * Creates a single file field schema for form input
 * Maps to PocketBase 'file' field type with maxSelect=1
 * Requires Node.js 20+ or browser environment with File API
 */
export function fileField() {
  return z.instanceof(File);
}

/**
 * Creates a multiple file field schema for form input
 * Maps to PocketBase 'file' field type with maxSelect>1
 * Requires Node.js 20+ or browser environment with File API
 * @param options - Optional constraints for the file field
 */
export function filesField(options?: { min?: number; max?: number }) {
  let schema = z.array(z.instanceof(File));
  if (options?.min !== undefined) schema = schema.min(options.min);
  if (options?.max !== undefined) schema = schema.max(options.max);
  return schema;
}

// ============================================================================
// Relation Field Helpers - Explicit Relationship Definitions
// ============================================================================

/**
 * Relation field configuration options
 */
export interface RelationConfig {
  /**
   * Target collection name (e.g., 'users', 'posts', 'tags')
   * This is the PocketBase collection that the relation points to
   */
  collection: string;

  /**
   * Whether to cascade delete related records when this record is deleted
   * @default false
   */
  cascadeDelete?: boolean;
}

/**
 * Multiple relation field configuration options
 */
export interface RelationsConfig extends RelationConfig {
  /**
   * Minimum number of relations required
   * @default 0
   */
  minSelect?: number;

  /**
   * Maximum number of relations allowed
   * @default 999
   */
  maxSelect?: number;
}

/**
 * Internal marker for relation metadata
 * Used by the analyzer to detect explicit relation definitions
 */
const RELATION_METADATA_KEY = "__pocketbase_relation__";

/**
 * Creates a single relation field schema with explicit collection target
 * Maps to PocketBase 'relation' field type with maxSelect=1
 *
 * This is the recommended way to define relations - it's explicit and doesn't
 * rely on naming conventions.
 *
 * @param config - Relation configuration with target collection
 * @returns Zod string schema with relation metadata
 *
 * @example
 * // Single relation to users collection
 * const PostSchema = z.object({
 *   title: z.string(),
 *   author: RelationField({ collection: 'users' }),
 * });
 *
 * @example
 * // Relation with cascade delete
 * const CommentSchema = z.object({
 *   content: z.string(),
 *   post: RelationField({ collection: 'posts', cascadeDelete: true }),
 * });
 */
export function RelationField(config: RelationConfig) {
  const metadata = {
    [RELATION_METADATA_KEY]: {
      type: "single",
      collection: config.collection,
      cascadeDelete: config.cascadeDelete ?? false,
      maxSelect: 1,
      minSelect: 0,
    },
  };

  return z.string().describe(JSON.stringify(metadata));
}

/**
 * Creates a multiple relation field schema with explicit collection target
 * Maps to PocketBase 'relation' field type with maxSelect>1
 *
 * This is the recommended way to define multi-relations - it's explicit and
 * doesn't rely on naming conventions.
 *
 * @param config - Relations configuration with target collection and limits
 * @returns Zod array of strings schema with relation metadata
 *
 * @example
 * // Multiple relations to tags collection
 * const PostSchema = z.object({
 *   title: z.string(),
 *   tags: RelationsField({ collection: 'tags' }),
 * });
 *
 * @example
 * // Relations with min/max constraints
 * const ProjectSchema = z.object({
 *   title: z.string(),
 *   collaborators: RelationsField({
 *     collection: 'users',
 *     minSelect: 1,
 *     maxSelect: 10,
 *   }),
 * });
 */
export function RelationsField(config: RelationsConfig) {
  const metadata = {
    [RELATION_METADATA_KEY]: {
      type: "multiple",
      collection: config.collection,
      cascadeDelete: config.cascadeDelete ?? false,
      maxSelect: config.maxSelect ?? 999,
      minSelect: config.minSelect ?? 0,
    },
  };

  let schema = z.array(z.string());

  // Apply array constraints for Zod validation
  if (config.minSelect !== undefined) {
    schema = schema.min(config.minSelect);
  }
  if (config.maxSelect !== undefined) {
    schema = schema.max(config.maxSelect);
  }

  return schema.describe(JSON.stringify(metadata));
}

/**
 * Extracts relation metadata from a Zod type's description
 * Used internally by the analyzer to detect explicit relation definitions
 *
 * @param description - The Zod type's description string
 * @returns Relation metadata if present, null otherwise
 */
export function extractRelationMetadata(description: string | undefined): {
  type: "single" | "multiple";
  collection: string;
  cascadeDelete: boolean;
  maxSelect: number;
  minSelect: number;
} | null {
  if (!description) return null;

  try {
    const parsed = JSON.parse(description);
    if (parsed[RELATION_METADATA_KEY]) {
      return parsed[RELATION_METADATA_KEY];
    }
  } catch {
    // Not JSON, ignore
  }

  return null;
}

/**
 * Creates an editor field schema (rich text)
 * Maps to PocketBase 'editor' field type
 */
export function editorField() {
  return z.string();
}

/**
 * Creates a geo point field schema
 * Maps to PocketBase 'geoPoint' field type
 */
export function geoPointField() {
  return z.object({
    lon: z.number(),
    lat: z.number(),
  });
}

/**
 * Attach permission metadata to a Zod schema
 *
 * This helper function allows you to define PocketBase API rules alongside your
 * entity schema definitions. The permissions are stored as metadata using Zod's
 * describe() method and will be extracted during migration generation.
 *
 * @param schema - The Zod schema to attach permissions to
 * @param config - Either a PermissionTemplateConfig (for template-based permissions)
 *                 or a PermissionSchema (for custom permissions)
 * @returns The schema with permission metadata attached
 *
 * @example
 * // Using a template
 * const ProjectSchema = withPermissions(
 *   z.object({ title: z.string(), User: z.string() }),
 *   { template: 'owner-only', ownerField: 'User' }
 * );
 *
 * @example
 * // Using custom rules
 * const ProjectSchema = withPermissions(
 *   z.object({ title: z.string() }),
 *   { listRule: '@request.auth.id != ""', viewRule: '' }
 * );
 *
 * @example
 * // Using template with custom rule overrides
 * const ProjectSchema = withPermissions(
 *   z.object({ title: z.string(), User: z.string() }),
 *   {
 *     template: 'owner-only',
 *     ownerField: 'User',
 *     customRules: { listRule: '@request.auth.id != ""' }
 *   }
 * );
 */
export function withPermissions<T extends z.ZodTypeAny>(
  schema: T,
  config: PermissionTemplateConfig | PermissionSchema
): T {
  // Create metadata object with permissions config directly
  // The PermissionAnalyzer will handle resolving templates vs direct schemas
  const metadata = {
    permissions: config,
  };

  // Attach permission metadata to schema using Zod's describe() method
  // The metadata is serialized as JSON and stored in the schema's description
  return schema.describe(JSON.stringify(metadata)) as T;
}

/**
 * Attach index definitions to a Zod schema
 *
 * This helper function allows you to define PocketBase indexes alongside your
 * entity schema definitions. The indexes are stored as metadata using Zod's
 * describe() method and will be extracted during migration generation.
 *
 * @param schema - The Zod schema to attach indexes to
 * @param indexes - Array of PocketBase index SQL statements
 * @returns The schema with index metadata attached
 *
 * @example
 * // Define indexes for a user schema
 * const UserSchema = withIndexes(
 *   withPermissions(
 *     z.object({ name: z.string(), email: z.string().email() }),
 *     userPermissions
 *   ),
 *   [
 *     'CREATE UNIQUE INDEX idx_users_email ON users (email)',
 *     'CREATE INDEX idx_users_name ON users (name)'
 *   ]
 * );
 *
 * @example
 * // Single index
 * const ProjectSchema = withIndexes(
 *   ProjectDatabaseSchema,
 *   ['CREATE INDEX idx_projects_status ON projects (status)']
 * );
 */
export function withIndexes<T extends z.ZodTypeAny>(schema: T, indexes: string[]): T {
  // Extract existing metadata if present
  let existingMetadata: any = {};

  if (schema.description) {
    try {
      existingMetadata = JSON.parse(schema.description);
    } catch {
      // If description is not JSON, ignore it
    }
  }

  // Merge indexes with existing metadata
  const metadata = {
    ...existingMetadata,
    indexes,
  };

  // Attach metadata to schema using Zod's describe() method
  return schema.describe(JSON.stringify(metadata)) as T;
}

/**
 * Configuration options for defining a collection
 */
export interface CollectionConfig {
  /**
   * The name of the PocketBase collection
   * This will be used when generating migrations
   */
  collectionName: string;

  /**
   * The Zod schema definition for the collection
   */
  schema: z.ZodObject<any>;

  /**
   * Optional permission configuration
   * Can be a template-based config or custom permission rules
   */
  permissions?: PermissionTemplateConfig | PermissionSchema;

  /**
   * Optional array of index SQL statements
   * Example: ['CREATE UNIQUE INDEX idx_users_email ON users (email)']
   */
  indexes?: string[];

  /**
   * Future extensibility - additional options can be added here
   */
  [key: string]: unknown;
}

/**
 * High-level wrapper for defining a PocketBase collection with all metadata
 *
 * This is the recommended way to define collections as it provides a single
 * entry point for collection name, schema, permissions, indexes, and future features.
 *
 * @param config - Collection configuration object
 * @returns The schema with all metadata attached
 *
 * @example
 * // Basic collection with permissions
 * export const PostSchema = defineCollection({
 *   collectionName: "posts",
 *   schema: z.object({
 *     title: z.string(),
 *     content: z.string(),
 *     author: RelationField({ collection: "users" }),
 *   }),
 *   permissions: {
 *     template: "owner-only",
 *     ownerField: "author",
 *   },
 * });
 *
 * @example
 * // Collection with permissions and indexes
 * export const UserSchema = defineCollection({
 *   collectionName: "users",
 *   schema: z.object({
 *     name: z.string(),
 *     email: z.string().email(),
 *   }),
 *   permissions: {
 *     listRule: "id = @request.auth.id",
 *     viewRule: "id = @request.auth.id",
 *     createRule: "",
 *     updateRule: "id = @request.auth.id",
 *     deleteRule: "id = @request.auth.id",
 *   },
 *   indexes: [
 *     "CREATE UNIQUE INDEX idx_users_email ON users (email)",
 *   ],
 * });
 *
 * @example
 * // Collection with template and custom rule overrides
 * export const ProjectSchema = defineCollection({
 *   collectionName: "projects",
 *   schema: z.object({
 *     title: z.string(),
 *     owner: RelationField({ collection: "users" }),
 *   }),
 *   permissions: {
 *     template: "owner-only",
 *     ownerField: "owner",
 *     customRules: {
 *       listRule: '@request.auth.id != ""',
 *     },
 *   },
 * });
 */
export function defineCollection(config: CollectionConfig): z.ZodObject<any> {
  const { collectionName, schema, permissions, indexes, ...futureOptions } = config;

  // Build metadata object
  const metadata: any = {
    collectionName,
  };

  // Add permissions if provided
  if (permissions) {
    metadata.permissions = permissions;
  }

  // Add indexes if provided
  if (indexes) {
    metadata.indexes = indexes;
  }

  // Add any future options
  if (Object.keys(futureOptions).length > 0) {
    Object.assign(metadata, futureOptions);
  }

  // Attach all metadata to schema using Zod's describe() method
  return schema.describe(JSON.stringify(metadata)) as z.ZodObject<any>;
}
