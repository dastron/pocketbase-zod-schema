/**
 * Shared types for migration tool
 */

// Import and re-export PocketBaseFieldType from schema/fields to avoid duplication
import type { PocketBaseFieldType } from "../schema/fields.js";
export type { PocketBaseFieldType };

// Import and re-export APIRuleType from schema/permissions to avoid duplication
import type { APIRuleType } from "../utils/permissions.js";
export type { APIRuleType };

export interface FieldDefinition {
  name: string;
  id: string;
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
  type: "base" | "auth";
  /**
   * Pre-generated collection ID for use in migrations
   * Format: pb_ followed by 15 alphanumeric lowercase characters
   * Special case: "_pb_users_auth_" for users collection
   * This ID is generated during migration creation to avoid runtime lookups
   */
  id?: string;
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

export interface CollectionModification {
  collection: string;
  fieldsToAdd: FieldDefinition[];
  fieldsToRemove: any[];
  fieldsToModify: FieldModification[];
  indexesToAdd: string[];
  indexesToRemove: string[];
  rulesToUpdate: RuleUpdate[];
  permissionsToUpdate: PermissionChange[];
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
