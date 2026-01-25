/**
 * Snapshot Manager
 * Handles saving and loading schema snapshots from JSON files
 *
 * This module provides a standalone, configurable snapshot manager that can be used
 * by consumer projects to manage schema snapshots. It focuses on JSON snapshot file
 * management, delegating migration file parsing and PocketBase format conversion
 * to specialized modules.
 */

import * as fs from "fs";
import * as path from "path";
import { FileSystemError, SnapshotError } from "./errors";
import {
  extractTimestampFromFilename,
  findMigrationsAfterSnapshot,
  parseMigrationOperations,
  type ParsedCollectionUpdate,
} from "./migration-parser";
import { convertPocketBaseMigration } from "./pocketbase-converter";
import type { CollectionSchema, SchemaDefinition, SchemaSnapshot } from "./types";

const SNAPSHOT_VERSION = "1.0.0";
const DEFAULT_SNAPSHOT_FILENAME = ".migration-snapshot.json";

/**
 * Configuration for snapshot operations
 */
export interface SnapshotConfig {
  /**
   * Path to the snapshot file
   * Can be absolute or relative to workspaceRoot
   */
  snapshotPath?: string;

  /**
   * Workspace root directory for resolving relative paths
   * Defaults to process.cwd()
   */
  workspaceRoot?: string;

  /**
   * Path to the migrations directory for finding PocketBase snapshots
   */
  migrationsPath?: string;

  /**
   * Whether to auto-migrate old snapshot formats
   * Defaults to true
   */
  autoMigrate?: boolean;

  /**
   * Custom snapshot version for testing
   */
  version?: string;
}

/**
 * Snapshot format versions and their migration functions
 */
interface SnapshotMigration {
  fromVersion: string;
  toVersion: string;
  migrate: (data: any) => any;
}

/**
 * Registry of snapshot format migrations
 */
const SNAPSHOT_MIGRATIONS: SnapshotMigration[] = [
  // Add migrations here as the format evolves
  // Example:
  // {
  //   fromVersion: '0.9.0',
  //   toVersion: '1.0.0',
  //   migrate: (data) => ({ ...data, newField: 'default' })
  // }
];

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Omit<Required<SnapshotConfig>, "migrationsPath"> & { migrationsPath?: string } = {
  snapshotPath: DEFAULT_SNAPSHOT_FILENAME,
  workspaceRoot: process.cwd(),
  autoMigrate: true,
  version: SNAPSHOT_VERSION,
};

/**
 * Merges user config with defaults
 */
function mergeConfig(config: SnapshotConfig = {}): typeof DEFAULT_CONFIG {
  return {
    ...DEFAULT_CONFIG,
    ...config,
  };
}

/**
 * Gets the snapshot file path from configuration
 *
 * @param config - Snapshot configuration
 * @returns Absolute path to the snapshot file
 */
export function getSnapshotPath(config: SnapshotConfig = {}): string {
  const mergedConfig = mergeConfig(config);
  const workspaceRoot = mergedConfig.workspaceRoot;
  const snapshotFilename = mergedConfig.snapshotPath;

  // If snapshotPath is absolute, use it directly
  if (path.isAbsolute(snapshotFilename)) {
    return snapshotFilename;
  }

  // Otherwise, resolve relative to workspaceRoot
  return path.join(workspaceRoot, snapshotFilename);
}

/**
 * Checks if snapshot file exists
 *
 * @param config - Snapshot configuration
 * @returns True if snapshot file exists
 */
export function snapshotExists(config: SnapshotConfig = {}): boolean {
  try {
    const snapshotPath = getSnapshotPath(config);
    return fs.existsSync(snapshotPath);
  } catch {
    // If there's any error checking existence, treat as non-existent
    return false;
  }
}

/**
 * Handles file system errors with descriptive messages
 *
 * @param error - The error object
 * @param operation - The operation being performed
 * @param filePath - The file path involved
 * @throws SnapshotError or FileSystemError with descriptive message
 */
function handleFileSystemError(error: any, operation: "read" | "write", filePath: string): never {
  const fsError = error as NodeJS.ErrnoException;

  if (fsError.code === "ENOENT") {
    throw new SnapshotError(`Snapshot file not found: ${filePath}`, filePath, operation, error);
  } else if (fsError.code === "EACCES" || fsError.code === "EPERM") {
    throw new FileSystemError(
      `Permission denied ${operation === "read" ? "reading" : "writing"} snapshot file. Check file permissions.`,
      filePath,
      operation,
      fsError.code,
      error
    );
  } else if (fsError.code === "ENOSPC") {
    throw new FileSystemError(
      `No space left on device when ${operation === "read" ? "reading" : "writing"} snapshot file.`,
      filePath,
      operation,
      fsError.code,
      error
    );
  } else {
    throw new SnapshotError(`Failed to ${operation} snapshot file: ${error.message}`, filePath, operation, error);
  }
}

/**
 * Serializes a Map to a plain object for JSON serialization
 *
 * @param map - Map to serialize
 * @returns Plain object representation
 */
function serializeMap<K extends string, V>(map: Map<K, V>): Record<K, V> {
  const obj: Record<string, V> = {};
  for (const [key, value] of map.entries()) {
    obj[key] = value;
  }
  return obj as Record<K, V>;
}

/**
 * Deserializes a plain object to a Map
 *
 * @param obj - Plain object to deserialize
 * @returns Map representation
 */
function deserializeMap<K extends string, V>(obj: Record<K, V>): Map<K, V> {
  const map = new Map<K, V>();
  for (const [key, value] of Object.entries(obj)) {
    map.set(key as K, value as V);
  }
  return map;
}

/**
 * Serializes SchemaDefinition to JSON format
 * Converts Map to plain object for JSON compatibility
 *
 * @param schema - Schema definition to serialize
 * @returns JSON-serializable object
 */
function serializeSchemaDefinition(schema: SchemaDefinition): any {
  return {
    collections: serializeMap(schema.collections),
  };
}

/**
 * Adds version and timestamp metadata to snapshot
 *
 * @param schema - Schema definition
 * @param config - Optional configuration with custom version
 * @returns Snapshot with metadata
 */
function addSnapshotMetadata(schema: SchemaDefinition, config?: SnapshotConfig): any {
  const mergedConfig = mergeConfig(config);
  return {
    version: mergedConfig.version,
    timestamp: new Date().toISOString(),
    ...serializeSchemaDefinition(schema),
  };
}

/**
 * Saves schema snapshot to file
 * Serializes SchemaDefinition to JSON with version and timestamp metadata
 * Writes with pretty printing for readability
 *
 * @param schema - Schema definition to save
 * @param config - Snapshot configuration
 */
export function saveSnapshot(schema: SchemaDefinition, config: SnapshotConfig = {}): void {
  const snapshotPath = getSnapshotPath(config);

  try {
    // Ensure directory exists
    const snapshotDir = path.dirname(snapshotPath);
    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true });
    }

    // Add metadata and serialize
    const snapshotData = addSnapshotMetadata(schema, config);

    // Write with pretty printing (2 spaces indentation)
    const jsonContent = JSON.stringify(snapshotData, null, 2);
    fs.writeFileSync(snapshotPath, jsonContent, "utf-8");
  } catch (error) {
    handleFileSystemError(error, "write", snapshotPath);
  }
}

/**
 * Parses JSON and validates snapshot format
 *
 * @param jsonContent - Raw JSON content
 * @param snapshotPath - Path to snapshot file (for error messages)
 * @returns Parsed snapshot data
 */
function parseAndValidateSnapshot(jsonContent: string, snapshotPath: string): any {
  try {
    const data = JSON.parse(jsonContent);

    // Validate required fields
    if (!data.version) {
      throw new SnapshotError(
        "Snapshot file is missing version field. The snapshot may be corrupted.",
        snapshotPath,
        "validate"
      );
    }

    if (!data.timestamp) {
      throw new SnapshotError(
        "Snapshot file is missing timestamp field. The snapshot may be corrupted.",
        snapshotPath,
        "validate"
      );
    }

    if (!data.collections) {
      throw new SnapshotError(
        "Snapshot file is missing collections field. The snapshot may be corrupted.",
        snapshotPath,
        "validate"
      );
    }

    return data;
  } catch (error) {
    if (error instanceof SnapshotError) {
      throw error;
    }

    if (error instanceof SyntaxError) {
      throw new SnapshotError(
        `Invalid JSON in snapshot file. The file may be corrupted or manually edited incorrectly.`,
        snapshotPath,
        "parse",
        error
      );
    }
    throw error;
  }
}

/**
 * Compares two version strings
 * Returns -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }

  return 0;
}

/**
 * Migrates old snapshot formats to current version
 * Applies migrations in sequence from old version to current
 *
 * @param data - Parsed snapshot data
 * @param config - Optional configuration
 * @returns Migrated snapshot data
 */
function migrateSnapshotFormat(data: any, config?: SnapshotConfig): any {
  const mergedConfig = mergeConfig(config);
  const currentVersion = data.version;
  const targetVersion = mergedConfig.version;

  // If versions match, no migration needed
  if (currentVersion === targetVersion) {
    return data;
  }

  // If auto-migrate is disabled, just return the data with a warning
  if (!mergedConfig.autoMigrate) {
    console.warn(
      `Snapshot version ${currentVersion} differs from current ${targetVersion}, but auto-migrate is disabled.`
    );
    return data;
  }

  // Find and apply migrations in sequence
  let migratedData = { ...data };
  let currentMigrationVersion = currentVersion;

  // Sort migrations by fromVersion
  const sortedMigrations = [...SNAPSHOT_MIGRATIONS].sort((a, b) => compareVersions(a.fromVersion, b.fromVersion));

  for (const migration of sortedMigrations) {
    if (compareVersions(currentMigrationVersion, migration.fromVersion) === 0) {
      console.log(`Migrating snapshot from ${migration.fromVersion} to ${migration.toVersion}...`);
      migratedData = migration.migrate(migratedData);
      migratedData.version = migration.toVersion;
      currentMigrationVersion = migration.toVersion;
    }
  }

  // If we couldn't migrate to the target version, log a warning
  if (compareVersions(currentMigrationVersion, targetVersion) !== 0) {
    console.warn(`Unknown snapshot version ${currentVersion}, attempting to load anyway...`);
  }

  return migratedData;
}

/**
 * Deserializes snapshot data to SchemaSnapshot
 *
 * @param data - Parsed and validated snapshot data
 * @returns SchemaSnapshot object
 */
function deserializeSnapshot(data: any): SchemaSnapshot {
  return {
    version: data.version,
    timestamp: data.timestamp,
    collections: deserializeMap<string, CollectionSchema>(data.collections),
  };
}

/**
 * Loads schema snapshot from file
 * Reads snapshot file, parses JSON, validates format, and handles migrations
 *
 * @param config - Snapshot configuration
 * @returns SchemaSnapshot object
 * @throws Error if snapshot file doesn't exist or is invalid
 */
export function loadSnapshot(config: SnapshotConfig = {}): SchemaSnapshot {
  const snapshotPath = getSnapshotPath(config);

  try {
    // Read file
    const jsonContent = fs.readFileSync(snapshotPath, "utf-8");

    // Parse and validate
    const data = parseAndValidateSnapshot(jsonContent, snapshotPath);

    // Migrate format if needed
    const migratedData = migrateSnapshotFormat(data, config);

    // Deserialize to SchemaSnapshot
    return deserializeSnapshot(migratedData);
  } catch (error) {
    // If it's already a SnapshotError or FileSystemError, re-throw it
    if (error instanceof SnapshotError || error instanceof FileSystemError) {
      throw error;
    }

    // If file doesn't exist, throw specific error
    if ((error as any).code === "ENOENT") {
      throw new SnapshotError(
        `Snapshot file not found. This may be the first migration run.`,
        snapshotPath,
        "read",
        error as Error
      );
    }

    // Handle other file system errors
    handleFileSystemError(error, "read", snapshotPath);
  }
}

/**
 * Merges base schema with custom snapshot
 * Base schema collections are preserved, custom collections are added
 * Custom collections override base collections if they have the same name
 *
 * @param baseSnapshot - PocketBase base schema
 * @param customSnapshot - User's custom schema snapshot (may be null)
 * @returns Merged SchemaSnapshot
 */
export function mergeSnapshots(baseSnapshot: SchemaSnapshot, customSnapshot: SchemaSnapshot | null): SchemaSnapshot {
  // If no custom snapshot, return base snapshot
  if (!customSnapshot) {
    return baseSnapshot;
  }

  // Create a new collections map starting with base collections
  const mergedCollections = new Map<string, CollectionSchema>(baseSnapshot.collections);

  // Add or override with custom collections
  for (const [name, schema] of customSnapshot.collections.entries()) {
    mergedCollections.set(name, schema);
  }

  return {
    version: customSnapshot.version || baseSnapshot.version,
    timestamp: customSnapshot.timestamp || baseSnapshot.timestamp,
    collections: mergedCollections,
  };
}

/**
 * Finds the most recent snapshot file in the migrations directory
 * Identifies snapshot files by naming pattern (e.g., *_collections_snapshot.js)
 *
 * @param migrationsPath - Path to pb_migrations directory
 * @returns Path to most recent snapshot file or null if none exist
 */
export function findLatestSnapshot(migrationsPath: string): string | null {
  try {
    // Check if migrations directory exists
    if (!fs.existsSync(migrationsPath)) {
      return null;
    }

    // Read all files in migrations directory
    const files = fs.readdirSync(migrationsPath);

    // Filter for snapshot files (files ending with _collections_snapshot.js or _snapshot.js)
    const snapshotFiles = files.filter(
      (file) => file.endsWith("_collections_snapshot.js") || file.endsWith("_snapshot.js")
    );

    if (snapshotFiles.length === 0) {
      return null;
    }

    // Sort by filename (timestamp prefix) to get most recent
    // Snapshot files are named with timestamp prefix: [timestamp]_collections_snapshot.js
    snapshotFiles.sort().reverse();

    // Return full path to most recent snapshot
    const latestSnapshot = snapshotFiles[0];
    if (!latestSnapshot) {
      return null;
    }
    return path.join(migrationsPath, latestSnapshot);
  } catch (error) {
    // If there's any error reading directory, return null
    console.warn(`Error finding latest snapshot: ${error}`);
    return null;
  }
}

/**
 * Applies migration operations to a snapshot state
 * Creates new collections and deletes collections as specified
 *
 * @param snapshot - Base snapshot state
 * @param operations - Migration operations to apply
 * @returns Updated snapshot with operations applied
 */
export function applyMigrationOperations(
  snapshot: SchemaSnapshot,
  operations: {
    collectionsToCreate: CollectionSchema[];
    collectionsToDelete: string[];
    collectionsToUpdate: ParsedCollectionUpdate[];
  }
): SchemaSnapshot {
  const updatedCollections = new Map(snapshot.collections);

  // Apply deletions first
  for (const collectionName of operations.collectionsToDelete) {
    updatedCollections.delete(collectionName);
  }

  // Apply creations
  for (const collection of operations.collectionsToCreate) {
    updatedCollections.set(collection.name, collection);
  }

  // Apply updates
  for (const update of operations.collectionsToUpdate) {
    const collection = updatedCollections.get(update.collectionName);
    if (collection) {
      // Add fields
      if (update.fieldsToAdd.length > 0) {
        for (const newField of update.fieldsToAdd) {
          // Check if field with same ID already exists (update/replace)
          const existingIndex = collection.fields.findIndex((f) => f.id === newField.id);
          if (newField.id && existingIndex !== -1) {
            collection.fields[existingIndex] = newField;
          } else {
            collection.fields.push(newField);
          }
        }
      }

      // Remove fields
      if (update.fieldsToRemove.length > 0) {
        collection.fields = collection.fields.filter((f) => !update.fieldsToRemove.includes(f.name));
      }

      // Update fields
      for (const fieldUpdate of update.fieldsToUpdate) {
        const field = collection.fields.find((f) => f.name === fieldUpdate.fieldName);
        if (field) {
          const topLevelFieldProps = ["name", "type", "required", "unique", "system", "id", "presentable"];

          for (const [key, value] of Object.entries(fieldUpdate.changes)) {
            if (key.startsWith("options.")) {
              const optionKey = key.replace("options.", "");
              if (!field.options) field.options = {};
              field.options[optionKey] = value;
            } else if (key.startsWith("relation.")) {
              const relationKey = key.replace("relation.", "");
              if (!field.relation && field.type === "relation") {
                // Should initialize relation object if missing but type is relation
                field.relation = { collection: "" };
              }
              if (field.relation) {
                (field.relation as any)[relationKey] = value;
              }
            } else if (topLevelFieldProps.includes(key)) {
              (field as any)[key] = value;
            } else {
              // It's likely an option (e.g. 'values', 'min', 'max') being set directly
              // as produced by the generator or PocketBase SDK
              if (!field.options) field.options = {};
              field.options[key] = value;
            }
          }
        }
      }

      // Indexes
      if (update.indexesToAdd.length > 0) {
        if (!collection.indexes) collection.indexes = [];
        collection.indexes.push(...update.indexesToAdd);
      }

      if (update.indexesToRemove.length > 0) {
        if (collection.indexes) {
          collection.indexes = collection.indexes.filter((idx) => !update.indexesToRemove.includes(idx));
        }
      }

      // Rules
      if (Object.keys(update.rulesToUpdate).length > 0) {
        if (!collection.rules) collection.rules = {};
        if (!collection.permissions) collection.permissions = {};

        for (const [key, value] of Object.entries(update.rulesToUpdate)) {
          // key is like 'listRule'
          // TS constraint: key must be one of the known rule types.
          // Since ParsedCollectionUpdate uses string key, we cast or check.
          (collection.rules as any)[key] = value;
          (collection.permissions as any)[key] = value;
        }
      }
    } else {
      console.warn(`Attempted to update non-existent collection: ${update.collectionName}`);
    }
  }

  return {
    ...snapshot,
    collections: updatedCollections,
  };
}

/**
 * Loads snapshot and applies all migrations that come after it
 * This gives us the current state of the database schema
 *
 * @param config - Snapshot configuration (must include migrationsPath)
 * @returns SchemaSnapshot object representing current state or null if snapshot doesn't exist
 */
export function loadSnapshotWithMigrations(config: SnapshotConfig = {}): SchemaSnapshot | null {
  const migrationsPath = config.migrationsPath;

  if (!migrationsPath) {
    return null;
  }

  // Check if migrationsPath is actually a file (for backward compatibility with tests)
  if (fs.existsSync(migrationsPath) && fs.statSync(migrationsPath).isFile()) {
    try {
      const migrationContent = fs.readFileSync(migrationsPath, "utf-8");
      return convertPocketBaseMigration(migrationContent);
    } catch (error) {
      console.warn(`Failed to load snapshot from ${migrationsPath}: ${error}`);
      return null;
    }
  }

  // It's a directory, find the latest snapshot
  const latestSnapshotPath = findLatestSnapshot(migrationsPath);

  if (!latestSnapshotPath) {
    // No snapshot found - return null (empty database)
    return null;
  }

  try {
    // Read and convert the PocketBase snapshot file
    const migrationContent = fs.readFileSync(latestSnapshotPath, "utf-8");
    let snapshot = convertPocketBaseMigration(migrationContent);

    // Extract timestamp from snapshot filename
    const snapshotFilename = path.basename(latestSnapshotPath);
    const snapshotTimestamp = extractTimestampFromFilename(snapshotFilename);

    if (snapshotTimestamp) {
      // Find all migration files after the snapshot
      const migrationFiles = findMigrationsAfterSnapshot(migrationsPath, snapshotTimestamp);

      // Apply each migration in order
      for (const migrationFile of migrationFiles) {
        try {
          const migrationContent = fs.readFileSync(migrationFile, "utf-8");
          const operations = parseMigrationOperations(migrationContent);
          snapshot = applyMigrationOperations(snapshot, operations);
        } catch (error) {
          console.warn(`Failed to apply migration ${migrationFile}: ${error}`);
          // Continue with other migrations even if one fails
        }
      }
    }

    return snapshot;
  } catch (error) {
    console.warn(`Failed to load snapshot from ${latestSnapshotPath}: ${error}`);
    return null;
  }
}

/**
 * Loads snapshot if it exists, returns null for first run
 * Convenience method that handles missing snapshot gracefully
 * Finds the most recent snapshot file from migrations directory
 * NOTE: This function only loads the snapshot, not migrations after it.
 * Use loadSnapshotWithMigrations() if you need the current state including migrations.
 *
 * @param config - Snapshot configuration (must include migrationsPath)
 * @returns SchemaSnapshot object or null if snapshot doesn't exist
 */
export function loadSnapshotIfExists(config: SnapshotConfig = {}): SchemaSnapshot | null {
  const migrationsPath = config.migrationsPath;

  if (!migrationsPath) {
    // No migrations path provided - return null
    return null;
  }

  // Check if migrationsPath is actually a file (for backward compatibility with tests)
  // If it's a file, treat it as a direct snapshot file path
  if (fs.existsSync(migrationsPath) && fs.statSync(migrationsPath).isFile()) {
    try {
      const migrationContent = fs.readFileSync(migrationsPath, "utf-8");
      return convertPocketBaseMigration(migrationContent);
    } catch (error) {
      console.warn(`Failed to load snapshot from ${migrationsPath}: ${error}`);
      return null;
    }
  }

  // It's a directory, find the latest snapshot
  const latestSnapshotPath = findLatestSnapshot(migrationsPath);

  if (latestSnapshotPath) {
    try {
      // Read and convert the PocketBase snapshot file
      const migrationContent = fs.readFileSync(latestSnapshotPath, "utf-8");
      return convertPocketBaseMigration(migrationContent);
    } catch (error) {
      console.warn(`Failed to load snapshot from ${latestSnapshotPath}: ${error}`);
      return null;
    }
  }

  // No snapshot found - return null (empty database)
  return null;
}

/**
 * Loads the base PocketBase schema from the initial migration file
 *
 * @param migrationPath - Path to pocketbase/pb_migrations/000000000_collections_snapshot.js
 * @returns SchemaSnapshot representing PocketBase's initial state
 * @throws SnapshotError if file not found or invalid format
 */
export function loadBaseMigration(migrationPath: string): SchemaSnapshot {
  try {
    // Check if file exists
    if (!fs.existsSync(migrationPath)) {
      throw new SnapshotError(
        `Base migration file not found: ${migrationPath}\n\n` +
          `This file should contain PocketBase's initial schema.\n` +
          `Please ensure PocketBase is properly set up by running 'yarn setup'.\n` +
          `If the file exists in a different location, update the configuration.`,
        migrationPath,
        "read"
      );
    }

    // Read the migration file
    const migrationContent = fs.readFileSync(migrationPath, "utf-8");

    // Convert to SchemaSnapshot
    const snapshot = convertPocketBaseMigration(migrationContent);

    return snapshot;
  } catch (error) {
    // If it's already a SnapshotError, re-throw it
    if (error instanceof SnapshotError) {
      throw error;
    }

    // Handle file system errors
    if ((error as any).code === "ENOENT") {
      throw new SnapshotError(
        `Base migration file not found: ${migrationPath}\n\n` +
          `This file should contain PocketBase's initial schema.\n` +
          `Please ensure PocketBase is properly set up by running 'yarn setup'.`,
        migrationPath,
        "read",
        error as Error
      );
    }

    if ((error as any).code === "EACCES" || (error as any).code === "EPERM") {
      throw new FileSystemError(
        `Permission denied reading base migration file. Check file permissions.`,
        migrationPath,
        "read",
        (error as any).code,
        error as Error
      );
    }

    // Other errors
    throw new SnapshotError(
      `Failed to load base migration: ${error instanceof Error ? error.message : String(error)}`,
      migrationPath,
      "read",
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Gets the current snapshot version
 */
export function getSnapshotVersion(): string {
  return SNAPSHOT_VERSION;
}

/**
 * Validates a snapshot against the current version
 * Returns validation result with any issues found
 */
export function validateSnapshot(snapshot: SchemaSnapshot): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check version
  if (!snapshot.version) {
    issues.push("Missing version field");
  } else if (compareVersions(snapshot.version, SNAPSHOT_VERSION) > 0) {
    issues.push(`Snapshot version ${snapshot.version} is newer than supported version ${SNAPSHOT_VERSION}`);
  }

  // Check timestamp
  if (!snapshot.timestamp) {
    issues.push("Missing timestamp field");
  }

  // Check collections
  if (!snapshot.collections) {
    issues.push("Missing collections field");
  } else if (!(snapshot.collections instanceof Map)) {
    issues.push("Collections field is not a Map");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Re-exports convertPocketBaseMigration for backward compatibility
 */
export { convertPocketBaseMigration } from "./pocketbase-converter";

/**
 * SnapshotManager class for object-oriented usage
 * Provides a stateful interface for snapshot management
 */
export class SnapshotManager {
  private config: SnapshotConfig;

  constructor(config: SnapshotConfig = {}) {
    this.config = mergeConfig(config);
  }

  /**
   * Loads the current snapshot
   */
  loadSnapshot(): SchemaSnapshot {
    return loadSnapshot(this.config);
  }

  /**
   * Saves a schema as a snapshot
   */
  saveSnapshot(schema: SchemaDefinition): void {
    saveSnapshot(schema, this.config);
  }

  /**
   * Loads snapshot if it exists, returns null otherwise
   */
  loadSnapshotIfExists(): SchemaSnapshot | null {
    return loadSnapshotIfExists(this.config);
  }

  /**
   * Checks if a snapshot exists
   */
  snapshotExists(): boolean {
    return snapshotExists(this.config);
  }

  /**
   * Converts a PocketBase migration to a snapshot
   */
  convertPocketBaseMigration(content: string): SchemaSnapshot {
    return convertPocketBaseMigration(content);
  }

  /**
   * Gets the snapshot file path
   */
  getSnapshotPath(): string {
    return getSnapshotPath(this.config);
  }

  /**
   * Validates a snapshot
   */
  validateSnapshot(snapshot: SchemaSnapshot): { valid: boolean; issues: string[] } {
    return validateSnapshot(snapshot);
  }
}
