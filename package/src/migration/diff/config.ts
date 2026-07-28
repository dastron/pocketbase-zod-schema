/**
 * Configuration options for the diff engine
 */
export interface DiffEngineConfig {
  /**
   * Custom system collections to exclude from diff
   * These collections will not be created or deleted
   */
  systemCollections?: string[];

  /**
   * Custom system fields to exclude from user collection diffs
   * These fields will not be included in fieldsToAdd for the users collection
   */
  usersSystemFields?: string[];
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<DiffEngineConfig> = {
  systemCollections: ["_mfas", "_otps", "_externalAuths", "_authOrigins", "_superusers"],
  usersSystemFields: ["id", "password", "tokenKey", "email", "emailVisibility", "verified", "created", "updated"],
};

/**
 * Merges user config with defaults
 */
export function mergeConfig(config?: DiffEngineConfig): Required<DiffEngineConfig> {
  return {
    ...DEFAULT_CONFIG,
    ...config,
  };
}
