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
export const DEFAULT_TEMPLATE = `/// <reference path="{{TYPES_PATH}}" />
migrate((app) => {
{{UP_CODE}}
}, (app) => {
{{DOWN_CODE}}
});
`;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Omit<Required<MigrationGeneratorConfig>, "migrationDir" | "force"> = {
  workspaceRoot: process.cwd(),
  timestampGenerator: () => Math.floor(Date.now() / 1000).toString(),
  template: DEFAULT_TEMPLATE,
  includeTypeReference: true,
  typesPath: "../pb_data/types.d.ts",
};

/**
 * Merges user config with defaults
 */
export function mergeConfig(config: MigrationGeneratorConfig): Required<MigrationGeneratorConfig> {
  return {
    ...DEFAULT_CONFIG,
    force: false,
    ...config,
  };
}
