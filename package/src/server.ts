// Server-side entry point for the pocketbase-zod-schema package
// This file re-exports everything from the main index, plus server-only utilities
// that depend on Node.js built-ins (fs, path, etc.)

export * from "./index.js";

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
