// Main exports for the pocketbase-zod-schema package
export * from './enums.js';
export * from './types.js';
export * from './mutator.js';

// Re-export schema utilities
export * from './schema.js';

// Migration utilities
export * from './migration/index.js';

// CLI utilities (for programmatic usage)
export { executeGenerate as generateMigration } from './cli/commands/generate.js';
export { executeStatus as getMigrationStatus } from './cli/commands/status.js';
export { 
  logSuccess, 
  logError, 
  logWarning, 
  logInfo, 
  logSection,
  formatChangeSummary,
  withProgress 
} from './cli/utils/logger.js';
export { loadConfig } from './cli/utils/config.js';