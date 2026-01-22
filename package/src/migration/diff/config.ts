/**
 * Configuration options for the diff engine
 */
export interface DiffEngineConfig {
  /**
   * Whether to warn on collection deletions
   * Defaults to true
   */
  warnOnDelete?: boolean;

  /**
   * Whether to require --force flag for destructive changes
   * Defaults to true
   */
  requireForceForDestructive?: boolean;

  /**
   * Severity threshold for requiring force flag
   * 'high' = only collection/field deletions and type changes
   * 'medium' = includes making fields required
   * 'low' = includes any constraint changes
   * Defaults to 'high'
   */
  severityThreshold?: "high" | "medium" | "low";

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
  warnOnDelete: true,
  requireForceForDestructive: true,
  severityThreshold: "high",
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
