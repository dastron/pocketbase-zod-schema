/**
 * Configuration loader for migration tool
 * Handles loading and merging configuration from various sources
 */

import * as fs from "fs";
import * as path from "path";
import { ConfigurationError } from "../../migration/errors.js";

/**
 * Migration tool configuration
 */
export interface MigrationConfig {
  schema: {
    directory: string;
    exclude: string[];
  };
  migrations: {
    directory: string;
    format: string;
  };
  diff: {
    warnOnDelete: boolean;
    requireForceForDestructive: boolean;
  };
}

/**
 * Partial configuration for merging
 */
export type PartialMigrationConfig = {
  schema?: Partial<MigrationConfig["schema"]>;
  migrations?: Partial<MigrationConfig["migrations"]>;
  diff?: Partial<MigrationConfig["diff"]>;
};

/**
 * Configuration file names to search for
 */
const CONFIG_FILE_NAMES = [
  "pocketbase-migrate.config.js",
  "pocketbase-migrate.config.mjs",
  "pocketbase-migrate.config.json",
  "migrate.config.js",
  "migrate.config.mjs",
  "migrate.config.json",
];

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: MigrationConfig = {
  schema: {
    directory: "src/schema",
    exclude: ["base.ts", "index.ts", "permissions.ts", "permission-templates.ts"],
  },
  migrations: {
    directory: "pocketbase/pb_migrations",
    format: "timestamp_description",
  },
  diff: {
    warnOnDelete: true,
    requireForceForDestructive: true,
  },
};

/**
 * Finds a configuration file in the given directory
 */
function findConfigFile(directory: string): string | null {
  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = path.join(directory, fileName);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * Loads configuration from a JSON file
 */
function loadJsonConfig(configPath: string): PartialMigrationConfig {
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ConfigurationError("Invalid JSON syntax in configuration file", configPath, undefined, error);
    }
    throw new ConfigurationError(
      "Failed to read configuration file",
      configPath,
      undefined,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Loads configuration from a JavaScript file
 */
async function loadJsConfig(configPath: string): Promise<PartialMigrationConfig> {
  try {
    const fileUrl = `file://${configPath}`;
    const module = await import(fileUrl);
    return module.default || module;
  } catch (error) {
    throw new ConfigurationError(
      "Failed to load JavaScript configuration file",
      configPath,
      undefined,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Loads configuration from file if it exists
 */
async function loadConfigFile(configPath: string): Promise<PartialMigrationConfig | null> {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const ext = path.extname(configPath).toLowerCase();

  if (ext === ".json") {
    return loadJsonConfig(configPath);
  } else if (ext === ".js" || ext === ".mjs") {
    return loadJsConfig(configPath);
  } else {
    throw new ConfigurationError(`Unsupported configuration file format: ${ext}`, configPath, undefined);
  }
}

/**
 * Merges configuration objects with deep merge
 */
function mergeConfig(base: MigrationConfig, override: PartialMigrationConfig): MigrationConfig {
  return {
    schema: { ...base.schema, ...override.schema },
    migrations: { ...base.migrations, ...override.migrations },
    diff: { ...base.diff, ...override.diff },
  };
}

/**
 * Loads configuration from environment variables
 */
function loadConfigFromEnv(): PartialMigrationConfig {
  const config: PartialMigrationConfig = {};

  if (process.env.MIGRATION_SCHEMA_DIR) {
    config.schema = { directory: process.env.MIGRATION_SCHEMA_DIR };
  }

  if (process.env.MIGRATION_SCHEMA_EXCLUDE) {
    config.schema = {
      ...config.schema,
      exclude: process.env.MIGRATION_SCHEMA_EXCLUDE.split(",").map((s) => s.trim()),
    };
  }

  if (process.env.MIGRATION_OUTPUT_DIR) {
    config.migrations = { directory: process.env.MIGRATION_OUTPUT_DIR };
  }

  if (process.env.MIGRATION_REQUIRE_FORCE !== undefined) {
    config.diff = { requireForceForDestructive: process.env.MIGRATION_REQUIRE_FORCE === "true" };
  }

  return config;
}

/**
 * Loads configuration from CLI arguments
 */
export function loadConfigFromArgs(options: any): PartialMigrationConfig {
  const config: PartialMigrationConfig = {};

  if (options.output) {
    config.migrations = { directory: options.output };
  }

  if (options.schemaDir) {
    config.schema = { directory: options.schemaDir };
  }

  return config;
}

/**
 * Validates configuration values
 */
function validateConfig(config: MigrationConfig, configPath?: string): void {
  const invalidFields: string[] = [];

  if (typeof config.schema.directory !== "string" || config.schema.directory.trim() === "") {
    invalidFields.push("schema.directory (must be a non-empty string)");
  }

  if (!Array.isArray(config.schema.exclude)) {
    invalidFields.push("schema.exclude (must be an array of strings)");
  }

  if (typeof config.migrations.directory !== "string" || config.migrations.directory.trim() === "") {
    invalidFields.push("migrations.directory (must be a non-empty string)");
  }

  if (typeof config.diff.warnOnDelete !== "boolean") {
    invalidFields.push("diff.warnOnDelete (must be a boolean)");
  }

  if (typeof config.diff.requireForceForDestructive !== "boolean") {
    invalidFields.push("diff.requireForceForDestructive (must be a boolean)");
  }

  if (invalidFields.length > 0) {
    throw new ConfigurationError("Invalid configuration values", configPath, invalidFields);
  }

  // Validate schema directory exists - try multiple locations
  const cwd = process.cwd();
  const possiblePaths = [
    path.resolve(cwd, config.schema.directory),
    path.resolve(cwd, "shared", config.schema.directory),
  ];

  const schemaDir = possiblePaths.find((p) => fs.existsSync(p));

  if (!schemaDir) {
    throw new ConfigurationError(`Schema directory not found. Tried: ${possiblePaths.join(", ")}`, configPath, [
      "schema.directory",
    ]);
  }
}

/**
 * Loads and merges configuration from all sources
 * Priority: CLI args > Environment variables > Config file > Defaults
 */
export async function loadConfig(options: any = {}): Promise<MigrationConfig> {
  let config: MigrationConfig = { ...DEFAULT_CONFIG };
  let configFilePath: string | undefined;

  const cwd = process.cwd();

  // Check for explicit config path from CLI
  if (options.config) {
    const explicitPath = path.resolve(cwd, options.config);
    if (!fs.existsSync(explicitPath)) {
      throw new ConfigurationError(`Configuration file not found: ${explicitPath}`, explicitPath);
    }
    configFilePath = explicitPath;
  } else {
    // Search for config file in current directory and shared directory
    const searchDirs = [cwd, path.join(cwd, "shared")];

    for (const dir of searchDirs) {
      if (fs.existsSync(dir)) {
        const found = findConfigFile(dir);
        if (found) {
          configFilePath = found;
          break;
        }
      }
    }
  }

  // Load config file if found
  if (configFilePath) {
    const fileConfig = await loadConfigFile(configFilePath);
    if (fileConfig) {
      config = mergeConfig(config, fileConfig);
    }
  }

  // Merge environment variables
  const envConfig = loadConfigFromEnv();
  if (Object.keys(envConfig).length > 0) {
    config = mergeConfig(config, envConfig);
  }

  // Merge CLI arguments (highest priority)
  const argsConfig = loadConfigFromArgs(options);
  if (Object.keys(argsConfig).length > 0) {
    config = mergeConfig(config, argsConfig);
  }

  // Validate final configuration
  validateConfig(config, configFilePath);

  return config;
}

/**
 * Gets the absolute path to the schema directory
 */
export function getSchemaDirectory(config: MigrationConfig): string {
  const cwd = process.cwd();
  const possiblePaths = [
    path.resolve(cwd, config.schema.directory),
    path.resolve(cwd, "shared", config.schema.directory),
  ];

  return possiblePaths.find((p) => fs.existsSync(p)) || possiblePaths[0];
}

/**
 * Gets the absolute path to the migrations directory
 */
export function getMigrationsDirectory(config: MigrationConfig): string {
  const cwd = process.cwd();
  const possiblePaths = [
    path.resolve(cwd, config.migrations.directory),
    path.resolve(cwd, "shared", config.migrations.directory),
  ];

  return possiblePaths.find((p) => fs.existsSync(p)) || possiblePaths[0];
}

/**
 * Gets the default configuration
 */
export function getDefaultConfig(): MigrationConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Creates a sample configuration file content
 */
export function getSampleConfig(format: "json" | "js"): string {
  if (format === "json") {
    return JSON.stringify(DEFAULT_CONFIG, null, 2);
  }

  return `/**
 * PocketBase Zod Migration Configuration
 * @type {import('pocketbase-zod-schema/cli').MigrationConfig}
 */
export default {
  schema: {
    directory: "src/schema",
    exclude: ["base.ts", "index.ts", "permissions.ts", "permission-templates.ts"],
  },
  migrations: {
    directory: "pocketbase/pb_migrations",
    format: "timestamp_description",
  },
  diff: {
    warnOnDelete: true,
    requireForceForDestructive: true,
  },
};
`;
}
