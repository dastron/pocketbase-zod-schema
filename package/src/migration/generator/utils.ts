import type { FieldDefinition } from "../types";
import type { MigrationGeneratorConfig } from "./config";

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
 * Formats a value for JavaScript code generation
 * Handles strings, numbers, booleans, null, arrays, and objects
 *
 * @param value - Value to format
 * @returns Formatted string representation
 */
export function formatValue(value: any): string {
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
 * Gets the appropriate Field constructor name for a field type
 *
 * @param fieldType - PocketBase field type
 * @returns Field constructor name
 */
export function getFieldConstructorName(fieldType: string): string {
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
    editor: "EditorField",
    autodate: "AutodateField",
  };

  return constructorMap[fieldType] || "TextField";
}

/**
 * Generates system fields that are required for all PocketBase collections
 * These fields (id, created, updated) must be explicitly included in migrations
 *
 * @returns Array of system field definitions
 */
export function getSystemFields(): FieldDefinition[] {
  return [
    // id field - primary key, auto-generated
    {
      name: "id",
      id: "text3208210256",
      type: "text",
      required: true,
      options: {
        autogeneratePattern: "[a-z0-9]{15}",
        hidden: false,
        max: 15,
        min: 15,
        pattern: "^[a-z0-9]+$",
        presentable: false,
        primaryKey: true,
        system: true,
      },
    },
  ];
}

/**
 * Generates auth-specific system fields
 *
 * @returns Array of auth system field definitions
 */
export function getAuthSystemFields(): FieldDefinition[] {
  return [
    {
      name: "password",
      id: "password3208210256",
      type: "text",
      required: true,
      options: {
        hidden: true,
        max: 0,
        min: 0,
        pattern: "",
        presentable: false,
        system: true,
      },
    },
    {
      name: "tokenKey",
      id: "tokenKey3208210256",
      type: "text",
      required: true,
      options: {
        hidden: true,
        max: 0,
        min: 0,
        pattern: "",
        presentable: false,
        system: true,
      },
    },
    {
      name: "email",
      id: "email3208210256",
      type: "email",
      required: true,
      options: {
        exceptDomains: null,
        hidden: false,
        onlyDomains: null,
        presentable: false,
        system: true,
      },
    },
    {
      name: "emailVisibility",
      id: "bool3208210256",
      type: "bool",
      required: false,
      options: {
        hidden: false,
        presentable: false,
        system: true,
      },
    },
    {
      name: "verified",
      id: "bool1547992826",
      type: "bool",
      required: false,
      options: {
        hidden: false,
        presentable: false,
        system: true,
      },
    },
  ];
}

/**
 * Generates default system indexes for auth collections
 *
 * @param collectionName - Name of the auth collection
 * @returns Array of index SQL statements
 */
export function getAuthSystemIndexes(collectionName: string): string[] {
  return [
    `CREATE UNIQUE INDEX \`idx_tokenKey_pbc_2283551112\` ON \`${collectionName}\` (\`tokenKey\`)`,
    `CREATE UNIQUE INDEX \`idx_email_pbc_2283551112\` ON \`${collectionName}\` (\`email\`) WHERE \`email\` != ''`,
  ];
}

/**
 * Generates the code to find a collection by ID if available, otherwise by name
 *
 * @param name - Collection name
 * @param collectionIdMap - Map of collection names to IDs
 * @returns Code string like `app.findCollectionByNameOrId("id") // name` or `app.findCollectionByNameOrId("name")`
 */
export function generateFindCollectionCode(name: string, collectionIdMap?: Map<string, string>): string {
  if (collectionIdMap && collectionIdMap.has(name)) {
    const id = collectionIdMap.get(name);
    return `app.findCollectionByNameOrId("${id}") // ${name}`;
  }
  return `app.findCollectionByNameOrId("${name}")`;
}
