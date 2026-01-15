/**
 * Migration Generator component
 * Creates PocketBase migration files based on detected differences
 *
 * This module provides a standalone, configurable migration generator that can be used
 * by consumer projects to generate PocketBase-compatible migration files.
 */

import * as fs from "fs";
import * as path from "path";
import { FileSystemError, MigrationGenerationError } from "./errors";
import type { CollectionOperation, CollectionSchema, FieldDefinition, FieldModification, SchemaDiff } from "./types";

/**
 * Configuration options for the migration generator
 */
export interface MigrationGeneratorConfig {
  /**
   * Directory to write migration files
   */
  migrationDir: string;

  /**
   * Workspace root for resolving relative paths
   * Defaults to process.cwd()
   */
  workspaceRoot?: string;

  /**
   * Custom timestamp generator function
   * Defaults to Unix timestamp in seconds
   */
  timestampGenerator?: () => string;

  /**
   * Custom migration file template
   * Use {{UP_CODE}} and {{DOWN_CODE}} placeholders
   */
  template?: string;

  /**
   * Whether to include type reference comment
   * Defaults to true
   */
  includeTypeReference?: boolean;

  /**
   * Path to types.d.ts file for reference comment
   * Defaults to '../pb_data/types.d.ts'
   */
  /**
   * Path to types.d.ts file for reference comment
   * Defaults to '../pb_data/types.d.ts'
   */
  typesPath?: string;

  /**
   * Whether to force generation even if duplicate migration exists
   * Defaults to false
   */
  force?: boolean;
}

/**
 * Default migration template
 */
const DEFAULT_TEMPLATE = `/// <reference path="{{TYPES_PATH}}" />
migrate((app) => {
{{UP_CODE}}
}, (app) => {
{{DOWN_CODE}}
});
`;

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Omit<Required<MigrationGeneratorConfig>, "migrationDir" | "force"> = {
  workspaceRoot: process.cwd(),
  timestampGenerator: () => Math.floor(Date.now() / 1000).toString(),
  template: DEFAULT_TEMPLATE,
  includeTypeReference: true,
  typesPath: "../pb_data/types.d.ts",
};

/**
 * Merges user config with defaults
 */
function mergeConfig(config: MigrationGeneratorConfig): Required<MigrationGeneratorConfig> {
  return {
    ...DEFAULT_CONFIG,
    force: false,
    ...config,
  };
}

/**
 * Resolves the migration directory path
 */
function resolveMigrationDir(config: MigrationGeneratorConfig): string {
  const workspaceRoot = config.workspaceRoot || process.cwd();

  if (path.isAbsolute(config.migrationDir)) {
    return config.migrationDir;
  }

  return path.join(workspaceRoot, config.migrationDir);
}

/**
 * Generates a timestamp for migration filename
 * Format: Unix timestamp in seconds (e.g., 1687801090)
 *
 * @param config - Optional configuration with custom timestamp generator
 * @returns Timestamp string
 */
export function generateTimestamp(config?: MigrationGeneratorConfig): string {
  if (config?.timestampGenerator) {
    return config.timestampGenerator();
  }
  return Math.floor(Date.now() / 1000).toString();
}

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
  for (const collection of diff.collectionsToCreate) {
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
      collection: collection.name || collection, // Handle both object and string
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
  const sanitizedName = collectionName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();

  return `${timestamp}_${operationType}_${sanitizedName}.js`;
}

/**
 * Increments a timestamp by 1 second
 * Ensures sequential ordering of migration files
 *
 * @param timestamp - Current timestamp string
 * @returns Incremented timestamp string
 */
export function incrementTimestamp(timestamp: string): string {
  const currentTimestamp = parseInt(timestamp, 10);
  return (currentTimestamp + 1).toString();
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

/**
 * Creates the migration file structure with up and down functions
 *
 * @param upCode - Code for the up migration
 * @param downCode - Code for the down migration
 * @param config - Optional configuration with custom template
 * @returns Complete migration file content
 */
export function createMigrationFileStructure(
  upCode: string,
  downCode: string,
  config?: MigrationGeneratorConfig
): string {
  const mergedConfig = config ? mergeConfig(config) : DEFAULT_CONFIG;
  let template = mergedConfig.template;

  // Replace placeholders using functions to avoid special character expansion (like $')
  template = template.replace("{{TYPES_PATH}}", () => mergedConfig.typesPath);
  template = template.replace("{{UP_CODE}}", () => upCode);
  template = template.replace("{{DOWN_CODE}}", () => downCode);

  // Remove type reference if disabled
  if (!mergedConfig.includeTypeReference) {
    template = template.replace(/\/\/\/ <reference path="[^"]*" \/>\n?/, "");
  }

  return template;
}

/**
 * Writes migration file to the specified directory
 * Creates directory if it doesn't exist
 *
 * @param migrationDir - Directory to write migration file
 * @param filename - Migration filename
 * @param content - Migration file content
 * @returns Full path to the created migration file
 */
export function writeMigrationFile(migrationDir: string, filename: string, content: string): string {
  try {
    // Ensure migration directory exists
    if (!fs.existsSync(migrationDir)) {
      try {
        fs.mkdirSync(migrationDir, { recursive: true });
      } catch (error) {
        const fsError = error as NodeJS.ErrnoException;
        if (fsError.code === "EACCES" || fsError.code === "EPERM") {
          throw new FileSystemError(
            `Permission denied creating migration directory. Check directory permissions.`,
            migrationDir,
            "create",
            fsError.code,
            error as Error
          );
        }
        throw new FileSystemError(
          `Failed to create migration directory: ${fsError.message}`,
          migrationDir,
          "create",
          fsError.code,
          error as Error
        );
      }
    }

    // Full path to migration file
    const filePath = path.join(migrationDir, filename);

    // Write migration file
    fs.writeFileSync(filePath, content, "utf-8");

    return filePath;
  } catch (error) {
    // If it's already a FileSystemError, re-throw it
    if (error instanceof FileSystemError) {
      throw error;
    }

    const fsError = error as NodeJS.ErrnoException;
    const filePath = path.join(migrationDir, filename);

    if (fsError.code === "EACCES" || fsError.code === "EPERM") {
      throw new FileSystemError(
        `Permission denied writing migration file. Check file and directory permissions.`,
        filePath,
        "write",
        fsError.code,
        error as Error
      );
    } else if (fsError.code === "ENOSPC") {
      throw new FileSystemError(
        `No space left on device when writing migration file.`,
        filePath,
        "write",
        fsError.code,
        error as Error
      );
    }

    throw new MigrationGenerationError(`Failed to write migration file: ${fsError.message}`, filePath, error as Error);
  }
}

/**
 * Formats a value for JavaScript code generation
 * Handles strings, numbers, booleans, null, arrays, and objects
 *
 * @param value - Value to format
 * @returns Formatted string representation
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    // Use JSON.stringify to properly escape all special characters
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    // Use JSON.stringify for arrays to properly handle all special characters
    // Then format with spaces after commas to match expected test output
    return JSON.stringify(value).replace(/","/g, '", "');
  }

  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([_k, v]) => v !== undefined) // Omit undefined values
      .map(([k, v]) => `${k}: ${formatValue(v)}`)
      .join(", ");
    return `{ ${entries} }`;
  }

  return String(value);
}

/**
 * Generates field definition object for collection creation
 * Creates the field configuration object used in Collection constructor
 *
 * @param field - Field definition
 * @param collectionIdMap - Map of collection names to their pre-generated IDs
 * @returns Field definition object as string
 */
export function generateFieldDefinitionObject(field: FieldDefinition, collectionIdMap?: Map<string, string>): string {
  const parts: string[] = [];

  // Add field name
  parts.push(`      name: "${field.name}"`);

  // Add field type
  parts.push(`      type: "${field.type}"`);

  // Add required flag
  parts.push(`      required: ${field.required}`);

  // Add unique flag if present
  if (field.unique !== undefined) {
    parts.push(`      unique: ${field.unique}`);
  }

  // Add explicit defaults for select fields
  if (field.type === "select") {
    // Always include maxSelect (default: 1)
    const maxSelect = field.options?.maxSelect ?? 1;
    parts.push(`      maxSelect: ${maxSelect}`);

    // Always include values array (default: [])
    const values = field.options?.values ?? [];
    parts.push(`      values: ${formatValue(values)}`);
  }

  // Add options if present (excluding select-specific options already handled)
  if (field.options && Object.keys(field.options).length > 0) {
    for (const [key, value] of Object.entries(field.options)) {
      // Skip select-specific options as they're handled above
      if (field.type === "select" && (key === "maxSelect" || key === "values")) {
        continue;
      }
      parts.push(`      ${key}: ${formatValue(value)}`);
    }
  }

  // Add relation configuration if present
  if (field.relation) {
    // Use pre-generated collection ID from map if available
    // Otherwise fall back to runtime lookup (for existing collections not in the current diff)
    const isUsersCollection = field.relation.collection.toLowerCase() === "users";
    let collectionIdValue: string;

    if (isUsersCollection) {
      // Special case: users collection always uses the constant
      collectionIdValue = '"_pb_users_auth_"';
    } else if (collectionIdMap && collectionIdMap.has(field.relation.collection)) {
      // Use pre-generated ID from map
      collectionIdValue = `"${collectionIdMap.get(field.relation.collection)}"`;
    } else {
      // Fall back to runtime lookup for existing collections
      collectionIdValue = `app.findCollectionByNameOrId("${field.relation.collection}").id`;
    }

    parts.push(`      collectionId: ${collectionIdValue}`);

    // Always include maxSelect (default: 1)
    const maxSelect = field.relation.maxSelect ?? 1;
    parts.push(`      maxSelect: ${maxSelect}`);

    // Always include minSelect (default: null)
    const minSelect = field.relation.minSelect ?? null;
    parts.push(`      minSelect: ${minSelect}`);

    // Always include cascadeDelete (default: false)
    const cascadeDelete = field.relation.cascadeDelete ?? false;
    parts.push(`      cascadeDelete: ${cascadeDelete}`);
  }

  return `    {\n${parts.join(",\n")},\n    }`;
}

/**
 * Generates fields array for collection creation
 *
 * @param fields - Array of field definitions
 * @param collectionIdMap - Map of collection names to their pre-generated IDs
 * @returns Fields array as string
 */
export function generateFieldsArray(fields: FieldDefinition[], collectionIdMap?: Map<string, string>): string {
  if (fields.length === 0) {
    return "[]";
  }

  const fieldObjects = fields.map((field) => generateFieldDefinitionObject(field, collectionIdMap));
  return `[\n${fieldObjects.join(",\n")},\n  ]`;
}

/**
 * Generates collection rules object
 *
 * @param rules - Collection rules
 * @returns Rules configuration as string
 */
export function generateCollectionRules(rules?: CollectionSchema["rules"]): string {
  if (!rules) {
    return "";
  }

  const parts: string[] = [];

  if (rules.listRule !== undefined) {
    parts.push(`listRule: ${formatValue(rules.listRule)}`);
  }

  if (rules.viewRule !== undefined) {
    parts.push(`viewRule: ${formatValue(rules.viewRule)}`);
  }

  if (rules.createRule !== undefined) {
    parts.push(`createRule: ${formatValue(rules.createRule)}`);
  }

  if (rules.updateRule !== undefined) {
    parts.push(`updateRule: ${formatValue(rules.updateRule)}`);
  }

  if (rules.deleteRule !== undefined) {
    parts.push(`deleteRule: ${formatValue(rules.deleteRule)}`);
  }

  if (rules.manageRule !== undefined) {
    parts.push(`manageRule: ${formatValue(rules.manageRule)}`);
  }

  return parts.join(",\n    ");
}

/**
 * Generates collection permissions object
 * Permissions are the same as rules but extracted from schema metadata
 *
 * @param permissions - Collection permissions
 * @returns Permissions configuration as string
 */
export function generateCollectionPermissions(permissions?: CollectionSchema["permissions"]): string {
  if (!permissions) {
    return "";
  }

  const parts: string[] = [];

  if (permissions.listRule !== undefined) {
    parts.push(`listRule: ${formatValue(permissions.listRule)}`);
  }

  if (permissions.viewRule !== undefined) {
    parts.push(`viewRule: ${formatValue(permissions.viewRule)}`);
  }

  if (permissions.createRule !== undefined) {
    parts.push(`createRule: ${formatValue(permissions.createRule)}`);
  }

  if (permissions.updateRule !== undefined) {
    parts.push(`updateRule: ${formatValue(permissions.updateRule)}`);
  }

  if (permissions.deleteRule !== undefined) {
    parts.push(`deleteRule: ${formatValue(permissions.deleteRule)}`);
  }

  if (permissions.manageRule !== undefined) {
    parts.push(`manageRule: ${formatValue(permissions.manageRule)}`);
  }

  return parts.join(",\n    ");
}

/**
 * Generates indexes array for collection creation
 *
 * @param indexes - Array of index definitions
 * @returns Indexes array as string
 */
export function generateIndexesArray(indexes?: string[]): string {
  if (!indexes || indexes.length === 0) {
    return "[]";
  }

  const indexStrings = indexes.map((idx) => JSON.stringify(idx));
  return `[\n    ${indexStrings.join(",\n    ")},\n  ]`;
}

/**
 * Generates Collection constructor call for creating a new collection
 *
 * @param collection - Collection schema
 * @param varName - Variable name to use for the collection (default: 'collection')
 * @returns JavaScript code for creating the collection
 */
/**
 * Generates system fields that are required for all PocketBase collections
 * These fields (id, created, updated) must be explicitly included in migrations
 *
 * @returns Array of system field definitions
 */
function getSystemFields(): FieldDefinition[] {
  return [
    // id field - primary key, auto-generated
    {
      name: "id",
      type: "text",
      required: true,
      options: {
        autogeneratePattern: "[a-z0-9]{15}",
        hidden: false,
        id: "text3208210256",
        max: 15,
        min: 15,
        pattern: "^[a-z0-9]+$",
        presentable: false,
        primaryKey: true,
        system: true,
      },
    },
    // created field - autodate, set on creation
    {
      name: "created",
      type: "autodate",
      required: true,
      options: {
        hidden: false,
        id: "autodate2990389176",
        onCreate: true,
        onUpdate: false,
        presentable: false,
        system: false,
      },
    },
    // updated field - autodate, set on creation and update
    {
      name: "updated",
      type: "autodate",
      required: true,
      options: {
        hidden: false,
        id: "autodate3332085495",
        onCreate: true,
        onUpdate: true,
        presentable: false,
        system: false,
      },
    },
  ];
}

export function generateCollectionCreation(
  collection: CollectionSchema,
  varName: string = "collection",
  isLast: boolean = false,
  collectionIdMap?: Map<string, string>
): string {
  const lines: string[] = [];

  lines.push(`  const ${varName} = new Collection({`);
  if (collection.id) {
    lines.push(`    id: ${formatValue(collection.id)},`);
  }
  lines.push(`    name: "${collection.name}",`);
  lines.push(`    type: "${collection.type}",`);

  // Add permissions (preferred) or rules
  // Permissions take precedence if both are defined
  const permissionsCode = generateCollectionPermissions(collection.permissions);
  const rulesCode = generateCollectionRules(collection.rules);

  if (permissionsCode) {
    lines.push(`    ${permissionsCode},`);
  } else if (rulesCode) {
    lines.push(`    ${rulesCode},`);
  }

  // Prepend system fields (id, created, updated) to user-defined fields
  // These fields are required by PocketBase and must be explicitly included in migrations
  const systemFields = getSystemFields();
  const allFields = [...systemFields, ...collection.fields];

  // Add fields
  lines.push(`    fields: ${generateFieldsArray(allFields, collectionIdMap)},`);

  // Add indexes
  lines.push(`    indexes: ${generateIndexesArray(collection.indexes)},`);

  lines.push(`  });`);
  lines.push(``);
  lines.push(isLast ? `  return app.save(${varName});` : `  app.save(${varName});`);

  return lines.join("\n");
}

/**
 * Gets the appropriate Field constructor name for a field type
 *
 * @param fieldType - PocketBase field type
 * @returns Field constructor name
 */
function getFieldConstructorName(fieldType: string): string {
  const constructorMap: Record<string, string> = {
    text: "TextField",
    email: "EmailField",
    url: "URLField",
    number: "NumberField",
    bool: "BoolField",
    date: "DateField",
    select: "SelectField",
    relation: "RelationField",
    file: "FileField",
    json: "JSONField",
  };

  return constructorMap[fieldType] || "TextField";
}

/**
 * Generates field constructor options object
 *
 * @param field - Field definition
 * @param collectionIdMap - Map of collection names to their pre-generated IDs
 * @returns Options object as string
 */
function generateFieldConstructorOptions(field: FieldDefinition, collectionIdMap?: Map<string, string>): string {
  const parts: string[] = [];

  // Add field name
  parts.push(`    name: "${field.name}"`);

  // Add required flag
  parts.push(`    required: ${field.required}`);

  // Add unique flag if present
  if (field.unique !== undefined) {
    parts.push(`    unique: ${field.unique}`);
  }

  // Add explicit defaults for select fields
  if (field.type === "select") {
    // Always include maxSelect (default: 1)
    const maxSelect = field.options?.maxSelect ?? 1;
    parts.push(`    maxSelect: ${maxSelect}`);

    // Always include values array (default: [])
    const values = field.options?.values ?? [];
    parts.push(`    values: ${formatValue(values)}`);
  }

  // Add options if present (excluding select-specific options already handled)
  if (field.options && Object.keys(field.options).length > 0) {
    for (const [key, value] of Object.entries(field.options)) {
      // Skip select-specific options as they're handled above
      if (field.type === "select" && (key === "maxSelect" || key === "values")) {
        continue;
      }
      // Convert noDecimal to onlyInt for number fields (PocketBase uses onlyInt)
      if (field.type === "number" && key === "noDecimal") {
        parts.push(`    onlyInt: ${formatValue(value)}`);
      } else {
        parts.push(`    ${key}: ${formatValue(value)}`);
      }
    }
  }

  // Add relation-specific options
  if (field.relation && field.type === "relation") {
    // Use pre-generated collection ID from map if available
    // Otherwise fall back to runtime lookup (for existing collections not in the current diff)
    const isUsersCollection = field.relation.collection.toLowerCase() === "users";
    let collectionIdValue: string;

    if (isUsersCollection) {
      // Special case: users collection always uses the constant
      collectionIdValue = '"_pb_users_auth_"';
    } else if (collectionIdMap && collectionIdMap.has(field.relation.collection)) {
      // Use pre-generated ID from map
      collectionIdValue = `"${collectionIdMap.get(field.relation.collection)}"`;
    } else {
      // Fall back to runtime lookup for existing collections
      collectionIdValue = `app.findCollectionByNameOrId("${field.relation.collection}").id`;
    }

    parts.push(`    collectionId: ${collectionIdValue}`);

    // Always include maxSelect (default: 1)
    const maxSelect = field.relation.maxSelect ?? 1;
    parts.push(`    maxSelect: ${maxSelect}`);

    // Always include minSelect (default: null)
    const minSelect = field.relation.minSelect ?? null;
    parts.push(`    minSelect: ${minSelect}`);

    // Always include cascadeDelete (default: false)
    const cascadeDelete = field.relation.cascadeDelete ?? false;
    parts.push(`    cascadeDelete: ${cascadeDelete}`);
  }

  return parts.join(",\n");
}

/**
 * Generates code for adding a field to an existing collection
 * Uses the appropriate Field constructor based on field type
 *
 * @param collectionName - Name of the collection
 * @param field - Field definition to add
 * @param varName - Variable name to use for the collection (default: auto-generated)
 * @param isLast - Whether this is the last operation (will return the result)
 * @param collectionIdMap - Map of collection names to their pre-generated IDs
 * @returns JavaScript code for adding the field
 */
export function generateFieldAddition(
  collectionName: string,
  field: FieldDefinition,
  varName?: string,
  isLast: boolean = false,
  collectionIdMap?: Map<string, string>
): string {
  const lines: string[] = [];
  const constructorName = getFieldConstructorName(field.type);
  const collectionVar = varName || `collection_${collectionName}_${field.name}`;

  lines.push(`  const ${collectionVar} = app.findCollectionByNameOrId("${collectionName}");`);
  lines.push(``);
  lines.push(`  ${collectionVar}.fields.add(new ${constructorName}({`);
  lines.push(generateFieldConstructorOptions(field, collectionIdMap));
  lines.push(`  }));`);
  lines.push(``);
  lines.push(isLast ? `  return app.save(${collectionVar});` : `  app.save(${collectionVar});`);

  return lines.join("\n");
}

/**
 * Generates code for modifying an existing field
 * Updates field properties based on detected changes
 *
 * @param collectionName - Name of the collection
 * @param modification - Field modification details
 * @param varName - Variable name to use for the collection (default: auto-generated)
 * @param isLast - Whether this is the last operation (will return the result)
 * @returns JavaScript code for modifying the field
 */
export function generateFieldModification(
  collectionName: string,
  modification: FieldModification,
  varName?: string,
  isLast: boolean = false,
  collectionIdMap?: Map<string, string>
): string {
  const lines: string[] = [];
  const collectionVar = varName || `collection_${collectionName}_${modification.fieldName}`;
  const fieldVar = `${collectionVar}_field`;

  lines.push(`  const ${collectionVar} = app.findCollectionByNameOrId("${collectionName}");`);
  lines.push(`  const ${fieldVar} = ${collectionVar}.fields.getByName("${modification.fieldName}");`);
  lines.push(``);

  // Apply each change
  for (const change of modification.changes) {
    if (change.property.startsWith("options.")) {
      // Handle nested options properties
      const optionKey = change.property.replace("options.", "");
      // In PocketBase, field properties are set directly on the field, not in an options object
      lines.push(`  ${fieldVar}.${optionKey} = ${formatValue(change.newValue)};`);
    } else if (change.property.startsWith("relation.")) {
      // Handle nested relation properties
      const relationKey = change.property.replace("relation.", "");

      if (relationKey === "collection") {
        // Special handling for collection ID
        // Use case-insensitive check for "users" to handle both explicit and implicit relation definitions
        const isUsersCollection = String(change.newValue).toLowerCase() === "users";
        let collectionIdValue: string;

        if (isUsersCollection) {
          collectionIdValue = '"_pb_users_auth_"';
        } else if (collectionIdMap && collectionIdMap.has(String(change.newValue))) {
          // Use pre-generated ID from map (for existing collections)
          collectionIdValue = `"${collectionIdMap.get(String(change.newValue))}"`;
        } else {
          // Fall back to runtime lookup (should not happen if snapshot is properly loaded)
          collectionIdValue = `app.findCollectionByNameOrId("${change.newValue}").id`;
        }
        lines.push(`  ${fieldVar}.collectionId = ${collectionIdValue};`);
      } else {
        lines.push(`  ${fieldVar}.${relationKey} = ${formatValue(change.newValue)};`);
      }
    } else {
      // Handle top-level properties
      lines.push(`  ${fieldVar}.${change.property} = ${formatValue(change.newValue)};`);
    }
  }

  lines.push(``);
  lines.push(isLast ? `  return app.save(${collectionVar});` : `  app.save(${collectionVar});`);

  return lines.join("\n");
}

/**
 * Generates code for deleting a field from a collection
 *
 * @param collectionName - Name of the collection
 * @param fieldName - Name of the field to delete
 * @param varName - Variable name to use for the collection (default: auto-generated)
 * @param isLast - Whether this is the last operation (will return the result)
 * @returns JavaScript code for deleting the field
 */
export function generateFieldDeletion(
  collectionName: string,
  fieldName: string,
  varName?: string,
  isLast: boolean = false
): string {
  const lines: string[] = [];
  const collectionVar = varName || `collection_${collectionName}_${fieldName}`;

  lines.push(`  const ${collectionVar} = app.findCollectionByNameOrId("${collectionName}");`);
  lines.push(``);
  lines.push(`  ${collectionVar}.fields.removeByName("${fieldName}");`);
  lines.push(``);
  lines.push(isLast ? `  return app.save(${collectionVar});` : `  app.save(${collectionVar});`);

  return lines.join("\n");
}

/**
 * Generates code for adding an index to a collection
 *
 * @param collectionName - Name of the collection
 * @param index - Index SQL statement
 * @param varName - Variable name to use for the collection (default: auto-generated)
 * @param isLast - Whether this is the last operation (will return the result)
 * @returns JavaScript code for adding the index
 */
function generateIndexAddition(
  collectionName: string,
  index: string,
  varName?: string,
  isLast: boolean = false
): string {
  const lines: string[] = [];
  const collectionVar = varName || `collection_${collectionName}_idx`;

  lines.push(`  const ${collectionVar} = app.findCollectionByNameOrId("${collectionName}");`);
  lines.push(`  ${collectionVar}.indexes.push(${JSON.stringify(index)});`);
  lines.push(isLast ? `  return app.save(${collectionVar});` : `  app.save(${collectionVar});`);

  return lines.join("\n");
}

/**
 * Generates code for removing an index from a collection
 *
 * @param collectionName - Name of the collection
 * @param index - Index SQL statement
 * @param varName - Variable name to use for the collection (default: auto-generated)
 * @param isLast - Whether this is the last operation (will return the result)
 * @returns JavaScript code for removing the index
 */
function generateIndexRemoval(
  collectionName: string,
  index: string,
  varName?: string,
  isLast: boolean = false
): string {
  const lines: string[] = [];
  const collectionVar = varName || `collection_${collectionName}_idx`;
  const indexVar = `${collectionVar}_indexToRemove`;

  lines.push(`  const ${collectionVar} = app.findCollectionByNameOrId("${collectionName}");`);
  lines.push(`  const ${indexVar} = ${collectionVar}.indexes.findIndex(idx => idx === ${JSON.stringify(index)});`);
  lines.push(`  if (${indexVar} !== -1) {`);
  lines.push(`    ${collectionVar}.indexes.splice(${indexVar}, 1);`);
  lines.push(`  }`);
  lines.push(isLast ? `  return app.save(${collectionVar});` : `  app.save(${collectionVar});`);

  return lines.join("\n");
}

/**
 * Generates code for updating collection rules
 *
 * @param collectionName - Name of the collection
 * @param ruleType - Type of rule to update
 * @param newValue - New rule value
 * @param varName - Variable name to use for the collection (default: auto-generated)
 * @param isLast - Whether this is the last operation (will return the result)
 * @returns JavaScript code for updating the rule
 */
function generateRuleUpdate(
  collectionName: string,
  ruleType: string,
  newValue: string | null,
  varName?: string,
  isLast: boolean = false
): string {
  const lines: string[] = [];
  const collectionVar = varName || `collection_${collectionName}_${ruleType}`;

  lines.push(`  const ${collectionVar} = app.findCollectionByNameOrId("${collectionName}");`);
  lines.push(`  ${collectionVar}.${ruleType} = ${formatValue(newValue)};`);
  lines.push(isLast ? `  return app.save(${collectionVar});` : `  app.save(${collectionVar});`);

  return lines.join("\n");
}

/**
 * Generates code for updating collection permissions
 * Handles permission rule updates including manageRule for auth collections
 *
 * @param collectionName - Name of the collection
 * @param ruleType - Type of permission rule to update
 * @param newValue - New permission rule value
 * @param varName - Variable name to use for the collection (default: auto-generated)
 * @param isLast - Whether this is the last operation (will return the result)
 * @returns JavaScript code for updating the permission
 */
export function generatePermissionUpdate(
  collectionName: string,
  ruleType: string,
  newValue: string | null,
  varName?: string,
  isLast: boolean = false
): string {
  const lines: string[] = [];
  const collectionVar = varName || `collection_${collectionName}_${ruleType}`;

  lines.push(`  const ${collectionVar} = app.findCollectionByNameOrId("${collectionName}");`);
  lines.push(`  ${collectionVar}.${ruleType} = ${formatValue(newValue)};`);
  lines.push(isLast ? `  return app.save(${collectionVar});` : `  app.save(${collectionVar});`);

  return lines.join("\n");
}

/**
 * Generates code for deleting a collection
 *
 * @param collectionName - Name of the collection to delete
 * @param varName - Variable name to use for the collection (default: 'collection')
 * @param isLast - Whether this is the last operation (will return the result)
 * @returns JavaScript code for deleting the collection
 */
function generateCollectionDeletion(
  collectionName: string,
  varName: string = "collection",
  isLast: boolean = false
): string {
  const lines: string[] = [];

  lines.push(`  const ${varName} = app.findCollectionByNameOrId("${collectionName}");`);
  lines.push(isLast ? `  return app.delete(${varName});` : `  app.delete(${varName});`);

  return lines.join("\n");
}

/**
 * Generates the up migration code for a single collection operation
 * Handles create, modify, and delete operations
 *
 * @param operation - Collection operation to generate migration for
 * @param collectionIdMap - Map of collection names to their pre-generated IDs
 * @returns JavaScript code for up migration
 */
export function generateOperationUpMigration(
  operation: CollectionOperation,
  collectionIdMap: Map<string, string>
): string {
  const lines: string[] = [];

  if (operation.type === "create") {
    // Handle collection creation
    const collection = operation.collection as CollectionSchema;
    const varName = `collection_${collection.name}`;
    lines.push(generateCollectionCreation(collection, varName, true, collectionIdMap));
  } else if (operation.type === "modify") {
    // Handle collection modification
    const modification = operation.modifications!;
    const collectionName =
      typeof operation.collection === "string"
        ? operation.collection
        : (operation.collection?.name ?? modification.collection);

    let operationCount = 0;
    const totalOperations =
      modification.fieldsToAdd.length +
      modification.fieldsToModify.length +
      modification.fieldsToRemove.length +
      modification.indexesToAdd.length +
      modification.indexesToRemove.length +
      modification.rulesToUpdate.length +
      modification.permissionsToUpdate.length;

    // Add new fields
    for (let i = 0; i < modification.fieldsToAdd.length; i++) {
      const field = modification.fieldsToAdd[i];
      operationCount++;
      const varName = `collection_${collectionName}_add_${field.name}_${i}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateFieldAddition(collectionName, field, varName, isLast, collectionIdMap));
      if (!isLast) lines.push("");
    }

    // Modify existing fields
    for (const fieldMod of modification.fieldsToModify) {
      operationCount++;
      const varName = `collection_${collectionName}_modify_${fieldMod.fieldName}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateFieldModification(collectionName, fieldMod, varName, isLast, collectionIdMap));
      if (!isLast) lines.push("");
    }

    // Remove fields
    for (const field of modification.fieldsToRemove) {
      operationCount++;
      const varName = `collection_${collectionName}_remove_${field.name}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateFieldDeletion(collectionName, field.name, varName, isLast));
      if (!isLast) lines.push("");
    }

    // Add indexes
    for (let i = 0; i < modification.indexesToAdd.length; i++) {
      operationCount++;
      const index = modification.indexesToAdd[i];
      const varName = `collection_${collectionName}_addidx_${i}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateIndexAddition(collectionName, index, varName, isLast));
      if (!isLast) lines.push("");
    }

    // Remove indexes
    for (let i = 0; i < modification.indexesToRemove.length; i++) {
      operationCount++;
      const index = modification.indexesToRemove[i];
      const varName = `collection_${collectionName}_rmidx_${i}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateIndexRemoval(collectionName, index, varName, isLast));
      if (!isLast) lines.push("");
    }

    // Update permissions (preferred) or rules (fallback)
    if (modification.permissionsToUpdate && modification.permissionsToUpdate.length > 0) {
      for (const permission of modification.permissionsToUpdate) {
        operationCount++;
        const varName = `collection_${collectionName}_perm_${permission.ruleType}`;
        const isLast = operationCount === totalOperations;
        lines.push(generatePermissionUpdate(collectionName, permission.ruleType, permission.newValue, varName, isLast));
        if (!isLast) lines.push("");
      }
    } else if (modification.rulesToUpdate.length > 0) {
      for (const rule of modification.rulesToUpdate) {
        operationCount++;
        const varName = `collection_${collectionName}_rule_${rule.ruleType}`;
        const isLast = operationCount === totalOperations;
        lines.push(generateRuleUpdate(collectionName, rule.ruleType, rule.newValue, varName, isLast));
        if (!isLast) lines.push("");
      }
    }
  } else if (operation.type === "delete") {
    // Handle collection deletion
    const collectionName = typeof operation.collection === "string" ? operation.collection : operation.collection.name;
    const varName = `collection_${collectionName}`;
    lines.push(generateCollectionDeletion(collectionName, varName, true));
  }

  let code = lines.join("\n");

  // Check if there's already a return statement in the code
  // If so, skip post-processing to avoid duplicate returns
  const hasReturnStatement = /return\s+app\.(save|delete)\(/m.test(code);

  if (!hasReturnStatement) {
    // Find the last app.save() or app.delete() call and make it return the result
    // Match app.save(...) or app.delete(...) at the end of lines (not in comments or strings)
    const savePattern = /^(\s*)app\.save\((\w+)\);$/gm;
    const deletePattern = /^(\s*)app\.delete\((\w+)\);$/gm;

    const saveMatches = [...code.matchAll(savePattern)];
    const deleteMatches = [...code.matchAll(deletePattern)];

    // Combine all matches and find the last one by position
    const allMatches = [
      ...saveMatches.map((m) => ({ match: m, type: "save", index: m.index! })),
      ...deleteMatches.map((m) => ({ match: m, type: "delete", index: m.index! })),
    ].sort((a, b) => b.index - a.index); // Sort descending to get last match first

    if (allMatches.length > 0) {
      const lastMatch = allMatches[0];
      if (lastMatch.type === "save") {
        code =
          code.substring(0, lastMatch.match.index!) +
          lastMatch.match[1] +
          "return app.save(" +
          lastMatch.match[2] +
          ");" +
          code.substring(lastMatch.match.index! + lastMatch.match[0].length);
      } else {
        code =
          code.substring(0, lastMatch.match.index!) +
          lastMatch.match[1] +
          "return app.delete(" +
          lastMatch.match[2] +
          ");" +
          code.substring(lastMatch.match.index! + lastMatch.match[0].length);
      }
    }
  }

  return code;
}

/**
 * Generates the down migration code for a single collection operation
 * Reverts the operation (inverse of up migration)
 *
 * @param operation - Collection operation to generate rollback for
 * @param collectionIdMap - Map of collection names to their pre-generated IDs
 * @returns JavaScript code for down migration
 */
export function generateOperationDownMigration(
  operation: CollectionOperation,
  collectionIdMap: Map<string, string>
): string {
  const lines: string[] = [];

  if (operation.type === "create") {
    // Rollback: delete the created collection
    const collection = operation.collection as CollectionSchema;
    const varName = `collection_${collection.name}`;
    lines.push(generateCollectionDeletion(collection.name, varName, true));
  } else if (operation.type === "modify") {
    // Rollback: revert all modifications
    const modification = operation.modifications!;
    const collectionName =
      typeof operation.collection === "string"
        ? operation.collection
        : (operation.collection?.name ?? modification.collection);

    let operationCount = 0;
    const totalOperations =
      modification.fieldsToAdd.length +
      modification.fieldsToModify.length +
      modification.fieldsToRemove.length +
      modification.indexesToAdd.length +
      modification.indexesToRemove.length +
      modification.rulesToUpdate.length +
      modification.permissionsToUpdate.length;

    // Revert permissions (preferred) or rules (fallback)
    if (modification.permissionsToUpdate && modification.permissionsToUpdate.length > 0) {
      for (const permission of modification.permissionsToUpdate) {
        operationCount++;
        const varName = `collection_${collectionName}_revert_perm_${permission.ruleType}`;
        const isLast = operationCount === totalOperations;
        lines.push(generatePermissionUpdate(collectionName, permission.ruleType, permission.oldValue, varName, isLast));
        if (!isLast) lines.push("");
      }
    } else if (modification.rulesToUpdate.length > 0) {
      for (const rule of modification.rulesToUpdate) {
        operationCount++;
        const varName = `collection_${collectionName}_revert_rule_${rule.ruleType}`;
        const isLast = operationCount === totalOperations;
        lines.push(generateRuleUpdate(collectionName, rule.ruleType, rule.oldValue, varName, isLast));
        if (!isLast) lines.push("");
      }
    }

    // Revert index removals (add them back)
    for (let i = 0; i < modification.indexesToRemove.length; i++) {
      operationCount++;
      const index = modification.indexesToRemove[i];
      const varName = `collection_${collectionName}_restore_idx_${i}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateIndexAddition(collectionName, index, varName, isLast));
      if (!isLast) lines.push("");
    }

    // Revert index additions (remove them)
    for (let i = 0; i < modification.indexesToAdd.length; i++) {
      operationCount++;
      const index = modification.indexesToAdd[i];
      const varName = `collection_${collectionName}_revert_idx_${i}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateIndexRemoval(collectionName, index, varName, isLast));
      if (!isLast) lines.push("");
    }

    // Revert field removals (add them back)
    for (const field of modification.fieldsToRemove) {
      operationCount++;
      const varName = `collection_${collectionName}_restore_${field.name}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateFieldAddition(collectionName, field, varName, isLast, collectionIdMap));
      if (!isLast) lines.push("");
    }

    // Revert field modifications
    for (const fieldMod of modification.fieldsToModify) {
      operationCount++;
      // Create a reverse modification
      const reverseChanges = fieldMod.changes.map((change) => ({
        property: change.property,
        oldValue: change.newValue,
        newValue: change.oldValue,
      }));

      const reverseMod: FieldModification = {
        fieldName: fieldMod.fieldName,
        currentDefinition: fieldMod.newDefinition,
        newDefinition: fieldMod.currentDefinition,
        changes: reverseChanges,
      };

      const varName = `collection_${collectionName}_revert_${fieldMod.fieldName}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateFieldModification(collectionName, reverseMod, varName, isLast));
      if (!isLast) lines.push("");
    }

    // Revert field additions (remove them)
    for (const field of modification.fieldsToAdd) {
      operationCount++;
      const varName = `collection_${collectionName}_revert_add_${field.name}`;
      const isLast = operationCount === totalOperations;
      lines.push(generateFieldDeletion(collectionName, field.name, varName, isLast));
      if (!isLast) lines.push("");
    }
  } else if (operation.type === "delete") {
    // Rollback: recreate the deleted collection
    const collection = operation.collection;
    if (typeof collection !== "string") {
      const varName = `collection_${collection.name}`;
      lines.push(generateCollectionCreation(collection, varName, true, collectionIdMap));
    }
  }

  let code = lines.join("\n");

  // Check if there's already a return statement in the code
  // If so, skip post-processing to avoid duplicate returns
  const hasReturnStatement = /return\s+app\.(save|delete)\(/m.test(code);

  if (!hasReturnStatement) {
    // Find the last app.save() or app.delete() call and make it return the result
    // Match app.save(...) or app.delete(...) at the end of lines (not in comments or strings)
    const savePattern = /^(\s*)app\.save\((\w+)\);$/gm;
    const deletePattern = /^(\s*)app\.delete\((\w+)\);$/gm;

    const saveMatches = [...code.matchAll(savePattern)];
    const deleteMatches = [...code.matchAll(deletePattern)];

    // Combine all matches and find the last one by position
    const allMatches = [
      ...saveMatches.map((m) => ({ match: m, type: "save", index: m.index! })),
      ...deleteMatches.map((m) => ({ match: m, type: "delete", index: m.index! })),
    ].sort((a, b) => b.index - a.index); // Sort descending to get last match first

    if (allMatches.length > 0) {
      const lastMatch = allMatches[0];
      if (lastMatch.type === "save") {
        code =
          code.substring(0, lastMatch.match.index!) +
          lastMatch.match[1] +
          "return app.save(" +
          lastMatch.match[2] +
          ");" +
          code.substring(lastMatch.match.index! + lastMatch.match[0].length);
      } else {
        code =
          code.substring(0, lastMatch.match.index!) +
          lastMatch.match[1] +
          "return app.delete(" +
          lastMatch.match[2] +
          ");" +
          code.substring(lastMatch.match.index! + lastMatch.match[0].length);
      }
    }
  }

  return code;
}

/**
 * Generates the up migration function code
 * Applies all changes from the diff in the correct order
 *
 * @param diff - Schema diff containing all changes
 * @returns JavaScript code for up migration
 */
export function generateUpMigration(diff: SchemaDiff): string {
  const lines: string[] = [];

  // Add comment header
  lines.push(`  // UP MIGRATION`);
  lines.push(``);

  // Build collection ID map from collections being created and existing collections
  // This map will be used to resolve relation field references
  const collectionIdMap = new Map<string, string>();
  for (const collection of diff.collectionsToCreate) {
    if (collection.id) {
      collectionIdMap.set(collection.name, collection.id);
    }
  }
  // Add existing collection IDs from snapshot (for relation fields referencing existing collections)
  if (diff.existingCollectionIds) {
    for (const [name, id] of diff.existingCollectionIds) {
      collectionIdMap.set(name, id);
    }
  }

  // 1. Create new collections
  if (diff.collectionsToCreate.length > 0) {
    lines.push(`  // Create new collections`);
    for (let i = 0; i < diff.collectionsToCreate.length; i++) {
      const collection = diff.collectionsToCreate[i];
      const varName = `collection_${collection.name}_create`;
      lines.push(generateCollectionCreation(collection, varName, false, collectionIdMap));
      lines.push(``);
    }
  }

  // 2. Modify existing collections
  if (diff.collectionsToModify.length > 0) {
    lines.push(`  // Modify existing collections`);
    for (const modification of diff.collectionsToModify) {
      const collectionName = modification.collection;
      // Add new fields
      if (modification.fieldsToAdd.length > 0) {
        lines.push(`  // Add fields to ${collectionName}`);
        for (let i = 0; i < modification.fieldsToAdd.length; i++) {
          const field = modification.fieldsToAdd[i];
          const varName = `collection_${collectionName}_add_${field.name}_${i}`;
          lines.push(generateFieldAddition(collectionName, field, varName, false, collectionIdMap));
          lines.push(``);
        }
      }

      // Modify existing fields
      if (modification.fieldsToModify.length > 0) {
        lines.push(`  // Modify fields in ${collectionName}`);
        for (const fieldMod of modification.fieldsToModify) {
          const varName = `collection_${collectionName}_modify_${fieldMod.fieldName}`;
          lines.push(generateFieldModification(collectionName, fieldMod, varName, false, collectionIdMap));
          lines.push(``);
        }
      }

      // Remove fields
      if (modification.fieldsToRemove.length > 0) {
        lines.push(`  // Remove fields from ${collectionName}`);
        for (const field of modification.fieldsToRemove) {
          const varName = `collection_${collectionName}_remove_${field.name}`;
          lines.push(generateFieldDeletion(collectionName, field.name, varName));
          lines.push(``);
        }
      }

      // Add indexes
      if (modification.indexesToAdd.length > 0) {
        lines.push(`  // Add indexes to ${collectionName}`);
        for (let i = 0; i < modification.indexesToAdd.length; i++) {
          const index = modification.indexesToAdd[i];
          const varName = `collection_${collectionName}_addidx_${i}`;
          lines.push(generateIndexAddition(collectionName, index, varName));
          lines.push(``);
        }
      }

      // Remove indexes
      if (modification.indexesToRemove.length > 0) {
        lines.push(`  // Remove indexes from ${collectionName}`);
        for (let i = 0; i < modification.indexesToRemove.length; i++) {
          const index = modification.indexesToRemove[i];
          const varName = `collection_${collectionName}_rmidx_${i}`;
          lines.push(generateIndexRemoval(collectionName, index, varName));
          lines.push(``);
        }
      }

      // Update permissions (preferred) or rules (fallback)
      if (modification.permissionsToUpdate && modification.permissionsToUpdate.length > 0) {
        lines.push(`  // Update permissions for ${collectionName}`);
        for (const permission of modification.permissionsToUpdate) {
          const varName = `collection_${collectionName}_perm_${permission.ruleType}`;
          lines.push(generatePermissionUpdate(collectionName, permission.ruleType, permission.newValue, varName));
          lines.push(``);
        }
      } else if (modification.rulesToUpdate.length > 0) {
        lines.push(`  // Update rules for ${collectionName}`);
        for (const rule of modification.rulesToUpdate) {
          const varName = `collection_${collectionName}_rule_${rule.ruleType}`;
          lines.push(generateRuleUpdate(collectionName, rule.ruleType, rule.newValue, varName));
          lines.push(``);
        }
      }
    }
  }

  // 3. Delete collections
  if (diff.collectionsToDelete.length > 0) {
    lines.push(`  // Delete collections`);
    for (let i = 0; i < diff.collectionsToDelete.length; i++) {
      const collection = diff.collectionsToDelete[i];
      const varName = `collection_${collection.name}_delete`;
      lines.push(generateCollectionDeletion(collection.name, varName));
      lines.push(``);
    }
  }

  // If no changes, add a comment
  if (lines.length === 2) {
    lines.push(`  // No changes detected`);
    lines.push(``);
  }

  let code = lines.join("\n");

  // Check if there's already a return statement in the code
  // If so, skip post-processing to avoid duplicate returns
  const hasReturnStatement = /return\s+app\.(save|delete)\(/m.test(code);

  if (!hasReturnStatement) {
    // Find the last app.save() or app.delete() call and make it return the result
    // Match app.save(...) or app.delete(...) at the end of lines (not in comments or strings)
    const savePattern = /^(\s*)app\.save\((\w+)\);$/gm;
    const deletePattern = /^(\s*)app\.delete\((\w+)\);$/gm;

    const saveMatches = [...code.matchAll(savePattern)];
    const deleteMatches = [...code.matchAll(deletePattern)];

    // Combine all matches and find the last one by position
    const allMatches = [
      ...saveMatches.map((m) => ({ match: m, type: "save", index: m.index! })),
      ...deleteMatches.map((m) => ({ match: m, type: "delete", index: m.index! })),
    ].sort((a, b) => b.index - a.index); // Sort descending to get last match first

    if (allMatches.length > 0) {
      const lastMatch = allMatches[0];
      if (lastMatch.type === "save") {
        code =
          code.substring(0, lastMatch.match.index!) +
          lastMatch.match[1] +
          "return app.save(" +
          lastMatch.match[2] +
          ");" +
          code.substring(lastMatch.match.index! + lastMatch.match[0].length);
      } else {
        code =
          code.substring(0, lastMatch.match.index!) +
          lastMatch.match[1] +
          "return app.delete(" +
          lastMatch.match[2] +
          ");" +
          code.substring(lastMatch.match.index! + lastMatch.match[0].length);
      }
    }
  }

  return code;
}

/**
 * Generates the down migration function code
 * Reverts all changes from the diff in reverse order
 *
 * @param diff - Schema diff containing all changes
 * @returns JavaScript code for down migration
 */
export function generateDownMigration(diff: SchemaDiff): string {
  const lines: string[] = [];

  // Add comment header
  lines.push(`  // DOWN MIGRATION (ROLLBACK)`);
  lines.push(``);

  // Build collection ID map from collections being created (for rollback)
  // This map will be used to resolve relation field references
  const collectionIdMap = new Map<string, string>();
  for (const collection of diff.collectionsToCreate) {
    if (collection.id) {
      collectionIdMap.set(collection.name, collection.id);
    }
  }
  // Also include deleted collections that might have IDs
  for (const collection of diff.collectionsToDelete) {
    if (collection.id) {
      collectionIdMap.set(collection.name, collection.id);
    }
  }
  // Add existing collection IDs from snapshot (for relation fields referencing existing collections)
  if (diff.existingCollectionIds) {
    for (const [name, id] of diff.existingCollectionIds) {
      collectionIdMap.set(name, id);
    }
  }

  // Reverse order: delete -> modify -> create

  // 1. Recreate deleted collections
  if (diff.collectionsToDelete.length > 0) {
    lines.push(`  // Recreate deleted collections`);
    for (let i = 0; i < diff.collectionsToDelete.length; i++) {
      const collection = diff.collectionsToDelete[i];
      const varName = `collection_${collection.name}_recreate`;
      lines.push(generateCollectionCreation(collection, varName, false, collectionIdMap));
      lines.push(``);
    }
  }

  // 2. Revert modifications (in reverse order)
  if (diff.collectionsToModify.length > 0) {
    lines.push(`  // Revert modifications`);
    for (const modification of diff.collectionsToModify) {
      const collectionName = modification.collection;
      // Revert permissions (preferred) or rules (fallback)
      if (modification.permissionsToUpdate && modification.permissionsToUpdate.length > 0) {
        lines.push(`  // Revert permissions for ${collectionName}`);
        for (const permission of modification.permissionsToUpdate) {
          const varName = `collection_${collectionName}_revert_perm_${permission.ruleType}`;
          lines.push(generatePermissionUpdate(collectionName, permission.ruleType, permission.oldValue, varName));
          lines.push(``);
        }
      } else if (modification.rulesToUpdate.length > 0) {
        lines.push(`  // Revert rules for ${collectionName}`);
        for (const rule of modification.rulesToUpdate) {
          const varName = `collection_${collectionName}_revert_rule_${rule.ruleType}`;
          lines.push(generateRuleUpdate(collectionName, rule.ruleType, rule.oldValue, varName));
          lines.push(``);
        }
      }

      // Revert index removals (add them back)
      if (modification.indexesToRemove.length > 0) {
        lines.push(`  // Restore indexes to ${collectionName}`);
        for (let i = 0; i < modification.indexesToRemove.length; i++) {
          const index = modification.indexesToRemove[i];
          const varName = `collection_${collectionName}_restore_idx_${i}`;
          lines.push(generateIndexAddition(collectionName, index, varName));
          lines.push(``);
        }
      }

      // Revert index additions (remove them)
      if (modification.indexesToAdd.length > 0) {
        lines.push(`  // Remove indexes from ${collectionName}`);
        for (let i = 0; i < modification.indexesToAdd.length; i++) {
          const index = modification.indexesToAdd[i];
          const varName = `collection_${collectionName}_revert_idx_${i}`;
          lines.push(generateIndexRemoval(collectionName, index, varName));
          lines.push(``);
        }
      }

      // Revert field removals (add them back)
      if (modification.fieldsToRemove.length > 0) {
        lines.push(`  // Restore fields to ${collectionName}`);
        for (const field of modification.fieldsToRemove) {
          const varName = `collection_${collectionName}_restore_${field.name}`;
          lines.push(generateFieldAddition(collectionName, field, varName, false, collectionIdMap));
          lines.push(``);
        }
      }

      // Revert field modifications
      if (modification.fieldsToModify.length > 0) {
        lines.push(`  // Revert field modifications in ${collectionName}`);
        for (const fieldMod of modification.fieldsToModify) {
          // Create a reverse modification
          const reverseChanges = fieldMod.changes.map((change) => ({
            property: change.property,
            oldValue: change.newValue,
            newValue: change.oldValue,
          }));

          const reverseMod: FieldModification = {
            fieldName: fieldMod.fieldName,
            currentDefinition: fieldMod.newDefinition,
            newDefinition: fieldMod.currentDefinition,
            changes: reverseChanges,
          };

          const varName = `collection_${collectionName}_revert_${fieldMod.fieldName}`;
          lines.push(generateFieldModification(collectionName, reverseMod, varName));
          lines.push(``);
        }
      }

      // Revert field additions (remove them)
      if (modification.fieldsToAdd.length > 0) {
        lines.push(`  // Remove added fields from ${collectionName}`);
        for (const field of modification.fieldsToAdd) {
          const varName = `collection_${collectionName}_revert_add_${field.name}`;
          lines.push(generateFieldDeletion(collectionName, field.name, varName));
          lines.push(``);
        }
      }
    }
  }

  // 3. Delete created collections
  if (diff.collectionsToCreate.length > 0) {
    lines.push(`  // Delete created collections`);
    for (let i = 0; i < diff.collectionsToCreate.length; i++) {
      const collection = diff.collectionsToCreate[i];
      const varName = `collection_${collection.name}_rollback`;
      lines.push(generateCollectionDeletion(collection.name, varName));
      lines.push(``);
    }
  }

  // If no changes, add a comment
  if (lines.length === 2) {
    lines.push(`  // No changes to revert`);
    lines.push(``);
  }

  let code = lines.join("\n");

  // Check if there's already a return statement in the code
  // If so, skip post-processing to avoid duplicate returns
  const hasReturnStatement = /return\s+app\.(save|delete)\(/m.test(code);

  if (!hasReturnStatement) {
    // Find the last app.save() or app.delete() call and make it return the result
    // Match app.save(...) or app.delete(...) at the end of lines (not in comments or strings)
    const savePattern = /^(\s*)app\.save\((\w+)\);$/gm;
    const deletePattern = /^(\s*)app\.delete\((\w+)\);$/gm;

    const saveMatches = [...code.matchAll(savePattern)];
    const deleteMatches = [...code.matchAll(deletePattern)];

    // Combine all matches and find the last one by position
    const allMatches = [
      ...saveMatches.map((m) => ({ match: m, type: "save", index: m.index! })),
      ...deleteMatches.map((m) => ({ match: m, type: "delete", index: m.index! })),
    ].sort((a, b) => b.index - a.index); // Sort descending to get last match first

    if (allMatches.length > 0) {
      const lastMatch = allMatches[0];
      if (lastMatch.type === "save") {
        code =
          code.substring(0, lastMatch.match.index!) +
          lastMatch.match[1] +
          "return app.save(" +
          lastMatch.match[2] +
          ");" +
          code.substring(lastMatch.match.index! + lastMatch.match[0].length);
      } else {
        code =
          code.substring(0, lastMatch.match.index!) +
          lastMatch.match[1] +
          "return app.delete(" +
          lastMatch.match[2] +
          ");" +
          code.substring(lastMatch.match.index! + lastMatch.match[0].length);
      }
    }
  }

  return code;
}

/**
 * Main generation function
 * Generates migration files from schema diff (one file per collection operation)
 *
 * @param diff - Schema diff containing all changes
 * @param config - Migration generator configuration
 * @returns Array of paths to the generated migration files
 */
export function generate(diff: SchemaDiff, config: MigrationGeneratorConfig | string): string[] {
  // Support legacy string-only parameter (migration directory)
  const normalizedConfig: MigrationGeneratorConfig = typeof config === "string" ? { migrationDir: config } : config;

  try {
    const migrationDir = resolveMigrationDir(normalizedConfig);

    // Check if there are any changes
    const hasChanges =
      diff.collectionsToCreate.length > 0 || diff.collectionsToModify.length > 0 || diff.collectionsToDelete.length > 0;

    // If no changes, return empty array
    if (!hasChanges) {
      return [];
    }

    // Build collection ID map from collections being created
    const collectionIdMap = new Map<string, string>();
    for (const collection of diff.collectionsToCreate) {
      if (collection.id) {
        collectionIdMap.set(collection.name, collection.id);
      }
    }
    // Also include deleted collections that might have IDs (for rollback)
    for (const collection of diff.collectionsToDelete) {
      if (collection.id) {
        collectionIdMap.set(collection.name, collection.id);
      }
    }
    // Add existing collection IDs from snapshot (for relation fields referencing existing collections)
    if (diff.existingCollectionIds) {
      for (const [name, id] of diff.existingCollectionIds) {
        collectionIdMap.set(name, id);
      }
    }

    // Generate base timestamp
    const baseTimestamp = generateTimestamp(normalizedConfig);

    // Split diff into individual collection operations
    const operations = splitDiffByCollection(diff, baseTimestamp);

    // Generate migration file for each operation
    const filePaths: string[] = [];

    // Read existing files for duplicate check
    let existingFiles: string[] = [];
    if (!normalizedConfig.force && fs.existsSync(migrationDir)) {
      existingFiles = fs
        .readdirSync(migrationDir)
        .filter((f) => f.endsWith(".js") || f.endsWith(".ts"))
        .map((f) => fs.readFileSync(path.join(migrationDir, f), "utf-8"));
    }

    for (const operation of operations) {
      // Generate up and down migration code for this operation
      const upCode = generateOperationUpMigration(operation, collectionIdMap);
      const downCode = generateOperationDownMigration(operation, collectionIdMap);

      // Create migration file structure
      const content = createMigrationFileStructure(upCode, downCode, normalizedConfig);

      // Check for duplicates
      if (!normalizedConfig.force && existingFiles.some((existingContent) => existingContent === content)) {
        console.warn(
          `Duplicate migration detected for ${operation.type} ${
            typeof operation.collection === "string" ? operation.collection : operation.collection.name
          }. Skipping...`
        );
        continue;
      }

      // Generate filename for this operation
      const filename = generateCollectionMigrationFilename(operation);

      // Write migration file
      const filePath = writeMigrationFile(migrationDir, filename, content);

      filePaths.push(filePath);
    }

    return filePaths;
  } catch (error) {
    // If it's already a MigrationGenerationError or FileSystemError, re-throw it
    if (error instanceof MigrationGenerationError || error instanceof FileSystemError) {
      throw error;
    }

    // Otherwise, wrap it in a MigrationGenerationError
    throw new MigrationGenerationError(
      `Failed to generate migration: ${error instanceof Error ? error.message : String(error)}`,
      normalizedConfig.migrationDir,
      error as Error
    );
  }
}

/**
 * MigrationGenerator class for object-oriented usage
 * Provides a stateful interface for migration generation
 */
export class MigrationGenerator {
  private config: Required<MigrationGeneratorConfig>;

  constructor(config: MigrationGeneratorConfig) {
    this.config = mergeConfig(config);
  }

  /**
   * Generates migration files from a schema diff
   * Returns array of file paths (one per collection operation)
   */
  generate(diff: SchemaDiff): string[] {
    return generate(diff, this.config);
  }

  /**
   * Generates the up migration code without writing to file
   */
  generateUpMigration(diff: SchemaDiff): string {
    return generateUpMigration(diff);
  }

  /**
   * Generates the down migration code without writing to file
   */
  generateDownMigration(diff: SchemaDiff): string {
    return generateDownMigration(diff);
  }

  /**
   * Generates a migration filename
   */
  generateMigrationFilename(diff: SchemaDiff): string {
    return generateMigrationFilename(diff, this.config);
  }
}
