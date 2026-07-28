/**
 * Shared types for migration tool
 */

import { z } from "zod";
import type { PocketBaseFieldType } from "../schema/fields.js";
import type { APIRuleType } from "../utils/permissions.js";

export interface FieldDefinition {
  name: string;
  id: string;
  zodType?: z.ZodTypeAny;
  type: PocketBaseFieldType;
  required: boolean;
  unique?: boolean;
  options?: Record<string, any>;
  relation?: {
    collection: string;
    cascadeDelete?: boolean;
    maxSelect?: number;
    minSelect?: number;
    displayFields?: string[] | null;
  };
}

export interface CollectionSchema {
  name: string;
  type: "base" | "auth" | "view";
  /**
   * Pre-generated collection ID for use in migrations
   * Format: pb_ followed by 15 alphanumeric lowercase characters
   * Special case: "_pb_users_auth_" for users collection
   * This ID is generated during migration creation to avoid runtime lookups
   */
  id?: string;
  /**
   * SQL SELECT statement backing a view collection (type: "view" only)
   * PocketBase derives the collection's fields from this query, so `fields`
   * is not emitted into migrations for view collections
   */
  viewQuery?: string;
  fields: FieldDefinition[];
  indexes?: string[];
  rules?: {
    listRule?: string | null;
    viewRule?: string | null;
    createRule?: string | null;
    updateRule?: string | null;
    deleteRule?: string | null;
    manageRule?: string | null;
  };
  permissions?: {
    listRule?: string | null;
    viewRule?: string | null;
    createRule?: string | null;
    updateRule?: string | null;
    deleteRule?: string | null;
    manageRule?: string | null;
  };
}

export interface SchemaDefinition {
  collections: Map<string, CollectionSchema>;
}

export interface SchemaSnapshot {
  version: string;
  timestamp: string;
  collections: Map<string, CollectionSchema>;
}

export interface FieldChange {
  property: string;
  oldValue: any;
  newValue: any;
}

export interface FieldModification {
  fieldName: string;
  currentDefinition: any;
  newDefinition: FieldDefinition;
  changes: FieldChange[];
}

export interface RuleUpdate {
  ruleType: "listRule" | "viewRule" | "createRule" | "updateRule" | "deleteRule" | "manageRule";
  oldValue: string | null;
  newValue: string | null;
}

/**
 * Permission change tracking for migrations
 */
export interface PermissionChange {
  ruleType: APIRuleType;
  oldValue: string | null;
  newValue: string | null;
}

/**
 * View query change tracking for view collections
 * Applied in place so the collection ID stays stable
 */
export interface ViewQueryUpdate {
  oldValue: string | null;
  newValue: string;
}

export interface CollectionModification {
  collection: string;
  fieldsToAdd: FieldDefinition[];
  fieldsToRemove: any[];
  fieldsToModify: FieldModification[];
  indexesToAdd: string[];
  indexesToRemove: string[];
  rulesToUpdate: RuleUpdate[];
  permissionsToUpdate: PermissionChange[];
  /**
   * Set when a view collection's SQL query changed (view collections only)
   */
  viewQueryUpdate?: ViewQueryUpdate;
}

export interface SchemaDiff {
  collectionsToCreate: CollectionSchema[];
  collectionsToDelete: any[];
  collectionsToModify: CollectionModification[];
  /**
   * Map of existing collection names to their IDs from the previous snapshot
   * Used to resolve relation field references to existing collections
   */
  existingCollectionIds?: Map<string, string>;
}

/**
 * Represents a single collection operation for file splitting
 * Each operation will generate a separate migration file
 */
export interface CollectionOperation {
  /**
   * Type of operation being performed
   */
  type: "create" | "modify" | "delete";

  /**
   * Collection being operated on
   * For create/modify: CollectionSchema
   * For delete: collection name as string
   */
  collection: CollectionSchema | string;

  /**
   * Modifications to apply (only for 'modify' operations)
   */
  modifications?: CollectionModification;

  /**
   * Timestamp for this operation's migration file
   */
  timestamp: string;
}
