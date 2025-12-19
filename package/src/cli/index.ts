/**
 * CLI utilities for programmatic usage
 *
 * This module exports CLI utilities that can be used programmatically
 * in addition to the command-line interface.
 */

// Command implementations
export { executeGenerate as generateMigration } from "./commands/generate.js";
export { executeStatus as getMigrationStatus } from "./commands/status.js";

// Configuration utilities
export { getMigrationsDirectory, getSchemaDirectory, loadConfig, type MigrationConfig } from "./utils/config.js";

// Logging utilities
export {
  createProgressBar,
  createSpinner,
  formatChangeSummary,
  formatDuration,
  formatStatusJson,
  getVerbosity,
  logBox,
  logDebug,
  logError,
  logInfo,
  logKeyValue,
  logList,
  logSection,
  logStep,
  logSuccess,
  logTable,
  logTimed,
  logTimestamp,
  logWarning,
  setVerbosity,
  withProgress,
  type StatusOutput,
  type VerbosityLevel,
} from "./utils/logger.js";
