/**
 * Public migration API
 *
 * The pipeline: parseSchemaFiles (Zod schemas -> SchemaDefinition) ->
 * loadSnapshotWithMigrations (replay migration history) -> compare ->
 * filterDiff / destructive checks -> planMigrations / generate.
 */

// Analyzer
export { convertZodSchemaToCollectionSchema, discoverSchemaFiles, parseSchemaFiles } from "./analyzer/index.js";
export type { SchemaAnalyzerConfig } from "./analyzer/index.js";

// Snapshot (state reconstruction by replaying migration files)
export { findLatestSnapshot, loadSnapshotWithMigrations } from "./snapshot.js";
export type { SnapshotConfig } from "./snapshot.js";

// Diff
export { categorizeChangesBySeverity, compare, filterDiff } from "./diff/index.js";
export type { DiffEngineConfig, FilterOptions } from "./diff/index.js";

// Destructive-change detection (the single implementation)
export {
  detectDestructiveChanges,
  formatDestructiveChanges,
  hasDestructiveChanges,
  requiresForceFlag,
  summarizeDestructiveChanges,
} from "./validation.js";
export type { DestructiveChange, DestructiveChangeType } from "./validation.js";

// Generator
export { generate, planMigrations, writePlannedMigrations } from "./generator/index.js";
export type { MigrationGeneratorConfig, PlannedMigration } from "./generator/index.js";

// Execution engine
export {
  AppliedMigrationsError,
  CollectionStore,
  RecordModel,
  appliedMigrationsFromList,
  defaultDataDirectory,
  discoverMigrations,
  executeMigrationFile,
  formatGojaLintFinding,
  lintMigrationFile,
  lintMigrationSource,
  planMigrationReplay,
  readAppliedMigrations,
  readAppliedMigrationsIfPresent,
  replayMigrations,
  replayMigrationsDirectory,
  verifyMigrationSources,
} from "./engine/index.js";
export type {
  AppliedMigration,
  AppliedMigrationsSource,
  DiscoveredMigration,
  EngineOptions,
  EngineRecordMode,
  EngineStrictness,
  EngineWarning,
  GojaLintFinding,
  GojaLintOptions,
  GojaLintResult,
  GojaLintRule,
  GojaLintSeverity,
  MigrationDirection,
  MigrationExecutionResult,
  MigrationPlan,
  MigrationRoundTripResult,
  MigrationSourceRef,
  MigrationVerificationReport,
  PlanOptions,
  ReplayResult,
} from "./engine/index.js";

// Types
export * from "./types.js";

// Errors
export * from "./errors.js";
