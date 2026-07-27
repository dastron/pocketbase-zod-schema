// Migration utilities exports

// Analyzer module
export {
  SchemaAnalyzer,
  buildFieldDefinition,
  buildSchemaDefinition,
  convertZodSchemaToCollectionSchema,
  discoverSchemaFiles,
  extractFieldDefinitions,
  extractIndexes,
  extractSchemaDefinitions,
  getCollectionNameFromFile,
  importSchemaModule,
  isAuthCollection,
  parseSchemaFiles,
  selectSchemaForCollection,
} from "./analyzer/index.js";
export type { SchemaAnalyzerConfig } from "./analyzer/index.js";

// Snapshot module
export {
  SnapshotManager,
  convertPocketBaseMigration,
  findLatestSnapshot,
  getSnapshotPath,
  getSnapshotVersion,
  loadBaseMigration,
  loadSnapshot,
  loadSnapshotIfExists,
  loadSnapshotWithMigrations,
  mergeSnapshots,
  saveSnapshot,
  snapshotExists,
  validateSnapshot,
} from "./snapshot.js";
export type { SnapshotConfig } from "./snapshot.js";

// Diff module
export {
  DiffEngine,
  aggregateChanges,
  categorizeChangesBySeverity,
  compare,
  compareFieldConstraints,
  compareFieldOptions,
  compareFieldTypes,
  comparePermissions,
  compareRelationConfigurations,
  detectDestructiveChanges,
  detectFieldChanges,
  filterDiff,
  filterSystemCollections,
  findNewCollections,
  findNewFields,
  findRemovedCollections,
  findRemovedFields,
  generateChangeSummary,
  getUsersSystemFields,
  isSystemCollection,
  matchCollectionsByName,
  matchFieldsByName,
  requiresForceFlag,
} from "./diff/index.js";
export type { ChangeSummary, DestructiveChange, DiffEngineConfig } from "./diff/index.js";

// Generator module
export {
  MigrationGenerator,
  createMigrationFileStructure,
  generate,
  generateCollectionCreation,
  generateCollectionPermissions,
  generateCollectionRules,
  generateDownMigration,
  generateFieldAddition,
  generateFieldDefinitionObject,
  generateFieldDeletion,
  generateFieldModification,
  generateFieldsArray,
  generateIndexesArray,
  generateMigrationDescription,
  generateMigrationFilename,
  generatePermissionUpdate,
  generateTimestamp,
  generateUpMigration,
  planMigrations,
  writeMigrationFile,
  writePlannedMigrations,
} from "./generator/index.js";
export type { MigrationGeneratorConfig, PlannedMigration } from "./generator/index.js";

// Execution engine module
export {
  APPLIED_MIGRATIONS_TABLE,
  AppliedMigrationsError,
  CollectionStore,
  ExpressionError,
  POCKETBASE_DATABASE_FILENAME,
  RecordModel,
  RecordStore,
  UnsupportedQueryError,
  appliedMigrationsFromList,
  availableGlobals,
  compareStores,
  createDbx,
  defaultDataDirectory,
  describeStateDifferences,
  discoverMigrations,
  executeMigrationDownFile,
  executeMigrationDownSource,
  executeMigrationFile,
  executeMigrationSource,
  formatGojaLintFinding,
  gojaFindingsFromWarnings,
  isDbxExpression,
  lintMigrationFile,
  lintMigrationFiles,
  lintMigrationSource,
  parseCondition,
  planMigrationReplay,
  readAppliedMigrations,
  readAppliedMigrationsIfPresent,
  replayMigrations,
  replayMigrationsDirectory,
  resolveDatabasePath,
  verifyMigrationFileRoundTrip,
  verifyMigrationFiles,
  verifyMigrationRoundTrip,
  verifyMigrationSources,
} from "./engine/index.js";
export type {
  AppliedMigration,
  AppliedMigrationsSource,
  Condition,
  DbxExpression,
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
  StateCompareOptions,
  StateDifference,
} from "./engine/index.js";

// Types
export * from "./types.js";

// Errors
export * from "./errors.js";

// Validation module
export {
  detectDestructiveChanges as detectDestructiveChangesValidation,
  formatDestructiveChanges,
  hasDestructiveChanges,
  requiresForceFlag as requiresForceFlagValidation,
  summarizeDestructiveChanges,
} from "./validation.js";
export type { DestructiveChangeType, DestructiveChange as ValidationDestructiveChange } from "./validation.js";

// Migration utilities
export * from "./utils/pluralize.js";
export * from "./utils/relation-detector.js";
export * from "./utils/type-mapper.js";
