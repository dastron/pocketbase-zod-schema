// Server-side entry point for the pocketbase-zod-schema package
// Re-exports everything from the browser-safe index, plus the migration
// pipeline and the programmatic CLI API (Node-only: fs, path, node:vm)

export * from "./index.js";

// Migration pipeline
export * from "./migration/index.js";

// Programmatic CLI API
export { executeGenerate as generateMigration } from "./cli/commands/generate.js";
export { executeStatus as getMigrationStatus } from "./cli/commands/status.js";
export { loadConfig, type MigrationConfig } from "./cli/utils/config.js";
