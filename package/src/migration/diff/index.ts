/**
 * Diff Engine component
 * Compares current schema with previous snapshot and identifies changes
 *
 * This module provides a standalone, configurable diff engine that can be used
 * by consumer projects to compare schema definitions and detect changes.
 */

import type { CollectionModification, SchemaDefinition, SchemaDiff, SchemaSnapshot } from "../types";
import { CollectionIdRegistry } from "../utils/collection-id-generator";
import {
  buildCollectionModification,
  findNewCollections,
  findRemovedCollections,
  matchCollectionsByName,
} from "./collections";
import { mergeConfig, type DiffEngineConfig } from "./config";
import {
  categorizeChangesBySeverity,
  generateChangeSummary,
  type ChangeSummary,
} from "./summary";
import { isSystemCollection } from "./utils";
import { detectDestructiveChanges, type DestructiveChange, requiresForceFlag } from "./destructiveness";

// Export everything from submodules
export * from "./collections";
export * from "./config";
export * from "./destructiveness";
export * from "./fields";
export * from "./indexes";
export * from "./rules";
export * from "./summary";
export * from "./utils";

/**
 * Checks if a collection modification has any actual changes
 *
 * @param modification - Collection modification to check
 * @returns True if there are any changes
 */
function hasChanges(modification: CollectionModification): boolean {
  return (
    modification.fieldsToAdd.length > 0 ||
    modification.fieldsToRemove.length > 0 ||
    modification.fieldsToModify.length > 0 ||
    modification.indexesToAdd.length > 0 ||
    modification.indexesToRemove.length > 0 ||
    modification.rulesToUpdate.length > 0 ||
    modification.permissionsToUpdate.length > 0
  );
}

/**
 * Aggregates all detected changes into a SchemaDiff
 * Main entry point for diff comparison
 *
 * @param currentSchema - Current schema definition
 * @param previousSnapshot - Previous schema snapshot
 * @param config - Optional configuration
 * @returns Complete SchemaDiff with all changes
 */
export function aggregateChanges(
  currentSchema: SchemaDefinition,
  previousSnapshot: SchemaSnapshot | null,
  config?: DiffEngineConfig
): SchemaDiff {
  // Build lookup map for ID -> Name from previous snapshot
  // This helps resolve relations where snapshot uses ID but schema uses Name
  const collectionIdToName = new Map<string, string>();
  if (previousSnapshot) {
    for (const [name, collection] of previousSnapshot.collections) {
      if (collection.id) {
        collectionIdToName.set(collection.id, name);
      }
    }
  }

  // Find new and removed collections
  const collectionsToCreate = findNewCollections(currentSchema, previousSnapshot);
  const collectionsToDelete = findRemovedCollections(currentSchema, previousSnapshot);

  // Filter out system collections from create and delete operations
  const filteredCollectionsToCreate = collectionsToCreate.filter(
    (collection) => !isSystemCollection(collection.name, config)
  );
  const filteredCollectionsToDelete = collectionsToDelete.filter(
    (collection) => !isSystemCollection(collection.name, config)
  );

  // Generate and assign collection IDs for new collections
  const registry = new CollectionIdRegistry();
  const collectionsWithIds = filteredCollectionsToCreate.map((collection) => {
    // If the collection already has an ID, register it and use it
    if (collection.id) {
      registry.register(collection.id);
      return collection;
    }

    // Generate a new ID for the collection (pass name for special handling)
    const id = registry.generate(collection.name);
    return {
      ...collection,
      id,
    };
  });

  // Find modified collections
  const collectionsToModify: CollectionModification[] = [];
  const matchedCollections = matchCollectionsByName(currentSchema, previousSnapshot);

  for (const [currentCollection, previousCollection] of matchedCollections) {
    const modification = buildCollectionModification(currentCollection, previousCollection, config, collectionIdToName);

    // Only include if there are actual changes
    // Note: We allow modifications to the users collection (non-system)
    if (hasChanges(modification)) {
      collectionsToModify.push(modification);
    }
  }

  // Build map of existing collection names to their IDs from the snapshot
  // This is used by the generator to resolve relation field references
  const existingCollectionIds = new Map<string, string>();
  if (previousSnapshot) {
    for (const [name, collection] of previousSnapshot.collections) {
      if (collection.id) {
        existingCollectionIds.set(name, collection.id);
      }
    }
  }

  return {
    collectionsToCreate: collectionsWithIds,
    collectionsToDelete: filteredCollectionsToDelete,
    collectionsToModify,
    existingCollectionIds,
  };
}

/**
 * Main comparison function
 * Compares current schema with previous snapshot and returns complete diff
 *
 * @param currentSchema - Current schema definition
 * @param previousSnapshot - Previous schema snapshot (null for first run)
 * @param config - Optional configuration
 * @returns Complete SchemaDiff with all detected changes
 */
export function compare(
  currentSchema: SchemaDefinition,
  previousSnapshot: SchemaSnapshot | null,
  config?: DiffEngineConfig
): SchemaDiff {
  return aggregateChanges(currentSchema, previousSnapshot, config);
}

/**
 * DiffEngine class for object-oriented usage
 * Provides a stateful interface for schema comparison
 */
export class DiffEngine {
  private config: Required<DiffEngineConfig>;

  constructor(config?: DiffEngineConfig) {
    this.config = mergeConfig(config);
  }

  /**
   * Compares current schema with previous snapshot
   */
  compare(currentSchema: SchemaDefinition, previousSnapshot: SchemaSnapshot | null): SchemaDiff {
    return compare(currentSchema, previousSnapshot, this.config);
  }

  /**
   * Detects destructive changes in a diff
   */
  detectDestructiveChanges(diff: SchemaDiff): DestructiveChange[] {
    return detectDestructiveChanges(diff, this.config);
  }

  /**
   * Categorizes changes by severity
   */
  categorizeChangesBySeverity(diff: SchemaDiff): { destructive: string[]; nonDestructive: string[] } {
    return categorizeChangesBySeverity(diff, this.config);
  }

  /**
   * Generates a summary of changes
   */
  generateChangeSummary(diff: SchemaDiff): ChangeSummary {
    return generateChangeSummary(diff, this.config);
  }

  /**
   * Checks if force flag is required
   */
  requiresForceFlag(diff: SchemaDiff): boolean {
    return requiresForceFlag(diff, this.config);
  }
}
export * from "./filter.js";
