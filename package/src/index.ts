// Main exports for the pocketbase-zod-schema package
export * from "./enums.js";
export * from "./mutator.js";
// Note: types.ts is not exported as it only contained local testing fixtures

// Re-export schema utilities
export * from "./schema.js";

// Migration utilities
export * from "./migration/index.js";

// CLI utilities (for programmatic usage)
export { executeGenerate as generateMigration } from "./cli/commands/generate.js";
export { executeStatus as getMigrationStatus } from "./cli/commands/status.js";
export { loadConfig } from "./cli/utils/config.js";
export {
  formatChangeSummary,
  logError,
  logInfo,
  logSection,
  logSuccess,
  logWarning,
  withProgress,
} from "./cli/utils/logger.js";
