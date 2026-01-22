import * as path from "path";

/**
 * Configuration options for schema discovery and parsing
 */
export interface SchemaAnalyzerConfig {
  /**
   * Directory containing schema files (source or compiled)
   * Can be absolute or relative to workspaceRoot
   */
  schemaDir: string;

  /**
   * Workspace root directory for resolving relative paths
   * Defaults to process.cwd()
   */
  workspaceRoot?: string;

  /**
   * File patterns to exclude from schema discovery
   * Defaults to ['base.ts', 'index.ts', 'permissions.ts', 'permission-templates.ts']
   */
  excludePatterns?: string[];

  /**
   * File extensions to include in schema discovery
   * Defaults to ['.ts', '.js']
   */
  includeExtensions?: string[];

  /**
   * Schema export name patterns to look for
   * Defaults to ['Schema', 'InputSchema']
   */
  schemaPatterns?: string[];

  /**
   * Whether to use compiled JavaScript files instead of TypeScript source
   * When true, looks for .js files; when false, looks for .ts files
   * Defaults to true (use compiled files for dynamic import)
   */
  useCompiledFiles?: boolean;

  /**
   * Custom path transformation function for converting source paths to import paths
   * Useful for monorepo setups where source and dist directories differ
   * If not provided, uses the schemaDir directly
   */
  pathTransformer?: (sourcePath: string) => string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<Omit<SchemaAnalyzerConfig, "schemaDir" | "pathTransformer">> = {
  workspaceRoot: process.cwd(),
  excludePatterns: [
    "base.ts",
    "index.ts",
    "permissions.ts",
    "permission-templates.ts",
    "base.js",
    "index.js",
    "permissions.js",
    "permission-templates.js",
  ],
  includeExtensions: [".ts", ".js"],
  schemaPatterns: ["Schema", "InputSchema", "Collection"],
  useCompiledFiles: true,
};

/**
 * Merges user config with defaults
 */
export function mergeConfig(
  config: SchemaAnalyzerConfig
): Required<Omit<SchemaAnalyzerConfig, "pathTransformer">> & { pathTransformer?: (sourcePath: string) => string } {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    excludePatterns: config.excludePatterns || DEFAULT_CONFIG.excludePatterns,
    includeExtensions: config.includeExtensions || DEFAULT_CONFIG.includeExtensions,
    schemaPatterns: config.schemaPatterns || DEFAULT_CONFIG.schemaPatterns,
  };
}

/**
 * Resolves the schema directory path
 */
export function resolveSchemaDir(config: SchemaAnalyzerConfig): string {
  const workspaceRoot = config.workspaceRoot || process.cwd();

  if (path.isAbsolute(config.schemaDir)) {
    return config.schemaDir;
  }

  return path.join(workspaceRoot, config.schemaDir);
}
