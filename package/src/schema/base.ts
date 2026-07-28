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
  expand: z.record(z.string(), z.any()).describe("expandable fields"),
  created: z.string().describe("creation timestamp"),
  updated: z.string().describe("last update timestamp"),
};

// ============================================================================
// Common PocketBase Field Type Patterns
// ============================================================================
// Note: Field type helpers are now exported from ./fields.ts with PascalCase names
// (e.g., TextField, EmailField, JSONField, etc.) to ensure consistent naming.

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

  /**
   * Fields to display in the admin UI
   */
  displayFields?: string[] | null;
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
      displayFields: config.displayFields ?? null,
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
      displayFields: config.displayFields ?? null,
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
  displayFields?: string[] | null;
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
   * Optional collection type
   * - "base": Standard collection (default)
   * - "auth": Authentication collection with system auth fields
   * - "view": Read-only collection backed by a SQL query (requires viewQuery)
   *
   * Defaults to "base". Auth collections must set type: "auth" explicitly.
   *
   * Prefer defineView() over type: "view" - it enforces the constraints
   * PocketBase places on view collections at compile time.
   */
  type?: "base" | "auth" | "view";

  /**
   * SQL SELECT statement backing a view collection
   *
   * Only valid when type is "view", where it is required. PocketBase derives
   * the collection's fields by running this query, so the Zod schema is used
   * for TypeScript types only.
   */
  viewQuery?: string;
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
 * // Recommended: Use default export for clarity
 * const PostCollection = defineCollection({
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
 * export default PostCollection;
 *
 * @example
 * // Also supported: Named export (backward compatible)
 * export const PostCollection = defineCollection({
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
  const { collectionName, schema, permissions, indexes, type, viewQuery } = config;

  // Build metadata object
  const metadata: any = {
    collectionName,
  };

  // Add type if provided
  if (type) {
    metadata.type = type;
  }

  // Add the SQL query backing a view collection
  if (viewQuery !== undefined) {
    metadata.viewQuery = viewQuery;
  }

  // Add permissions if provided
  if (permissions) {
    metadata.permissions = permissions;
  }

  // Add indexes if provided
  if (indexes) {
    metadata.indexes = indexes;
  }

  // Attach all metadata to schema using Zod's describe() method
  return schema.describe(JSON.stringify(metadata)) as z.ZodObject<any>;
}
