/**
 * CLI utilities for programmatic usage
 * 
 * This module exports CLI utilities that can be used programmatically
 * in addition to the command-line interface.
 */

// Command implementations
export { executeGenerate as generateMigration } from './commands/generate.js';
export { executeStatus as getMigrationStatus } from './commands/status.js';

// Configuration utilities
export { 
  loadConfig, 
  getSchemaDirectory,
  getMigrationsDirectory,
  getSnapshotPath,
  type MigrationConfig 
} from './utils/config.js';

// Logging utilities
export {
  logSuccess,
  logError,
  logWarning,
  logInfo,
  logDebug,
  logSection,
  logStep,
  logList,
  logKeyValue,
  logTable,
  logBox,
  logTimestamp,
  logTimed,
  formatChangeSummary,
  formatDuration,
  formatStatusJson,
  createProgressBar,
  createSpinner,
  withProgress,
  setVerbosity,
  getVerbosity,
  type VerbosityLevel,
  type StatusOutput,
} from './utils/logger.js';
