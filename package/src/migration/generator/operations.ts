import type { CollectionOperation, SchemaDiff } from "../types";
import { sortCollectionsByDependency } from "../utils";
import { type MigrationGeneratorConfig } from "./config";
import { generateTimestamp } from "./utils";

/**
 * Splits a SchemaDiff into individual collection operations
 * Each operation will generate a separate migration file
 *
 * @param diff - Schema diff containing all changes
 * @param baseTimestamp - Base timestamp for the first operation
 * @returns Array of collection operations
 */
export function splitDiffByCollection(diff: SchemaDiff, baseTimestamp: string): CollectionOperation[] {
  const operations: CollectionOperation[] = [];
  let currentTimestamp = parseInt(baseTimestamp, 10);

  // Split collectionsToCreate into individual operations
  // Sort collections by dependency to ensure collections are created in the correct order
  const sortedCollections = sortCollectionsByDependency(diff.collectionsToCreate);
  for (const collection of sortedCollections) {
    operations.push({
      type: "create",
      collection: collection,
      timestamp: currentTimestamp.toString(),
    });
    currentTimestamp += 1; // Increment by 1 second
  }

  // Split collectionsToModify into individual operations
  for (const modification of diff.collectionsToModify) {
    operations.push({
      type: "modify",
      collection: modification.collection,
      modifications: modification,
      timestamp: currentTimestamp.toString(),
    });
    currentTimestamp += 1; // Increment by 1 second
  }

  // Split collectionsToDelete into individual operations
  for (const collection of diff.collectionsToDelete) {
    operations.push({
      type: "delete",
      collection: collection, // Handle both object and string
      timestamp: currentTimestamp.toString(),
    });
    currentTimestamp += 1; // Increment by 1 second
  }

  return operations;
}

/**
 * Generates migration filename for a collection operation
 * Format: {timestamp}_{operation}_{collection_name}.js
 *
 * @param operation - Collection operation
 * @returns Migration filename
 */
export function generateCollectionMigrationFilename(operation: CollectionOperation): string {
  const timestamp = operation.timestamp;
  const operationType = operation.type === "modify" ? "updated" : operation.type === "create" ? "created" : "deleted";

  // Get collection name
  let collectionName: string;
  if (typeof operation.collection === "string") {
    collectionName = operation.collection;
  } else {
    collectionName = operation.collection.name;
  }

  // Sanitize collection name for filename (replace spaces and special chars with underscores)
  const sanitizedName = collectionName.replace(/[^a-zA-Z0-9_]/g, "_");

  return `${timestamp}_${operationType}_${sanitizedName}.js`;
}

/**
 * Generates a human-readable description from the diff
 * Creates a concise summary of the main changes
 *
 * @param diff - Schema diff containing all changes
 * @returns Description string for filename
 */
export function generateMigrationDescription(diff: SchemaDiff): string {
  const parts: string[] = [];

  // Summarize collection changes
  if (diff.collectionsToCreate.length > 0) {
    if (diff.collectionsToCreate.length === 1) {
      parts.push(`created_${diff.collectionsToCreate[0].name}`);
    } else {
      parts.push(`created_${diff.collectionsToCreate.length}_collections`);
    }
  }

  if (diff.collectionsToDelete.length > 0) {
    if (diff.collectionsToDelete.length === 1) {
      parts.push(`deleted_${diff.collectionsToDelete[0].name}`);
    } else {
      parts.push(`deleted_${diff.collectionsToDelete.length}_collections`);
    }
  }

  if (diff.collectionsToModify.length > 0) {
    if (diff.collectionsToModify.length === 1) {
      parts.push(`updated_${diff.collectionsToModify[0].collection}`);
    } else {
      parts.push(`updated_${diff.collectionsToModify.length}_collections`);
    }
  }

  // Default description if no changes
  if (parts.length === 0) {
    return "no_changes";
  }

  // Join parts with underscores and limit length
  let description = parts.join("_");

  // Truncate if too long (keep under 100 chars for filename)
  if (description.length > 80) {
    description = description.substring(0, 77) + "...";
  }

  return description;
}

/**
 * Generates the migration filename
 * Format: {timestamp}_{description}.js
 *
 * @param diff - Schema diff containing all changes
 * @param config - Optional configuration
 * @returns Migration filename
 */
export function generateMigrationFilename(diff: SchemaDiff, config?: MigrationGeneratorConfig): string {
  const timestamp = generateTimestamp(config);
  const description = generateMigrationDescription(diff);

  return `${timestamp}_${description}.js`;
}
