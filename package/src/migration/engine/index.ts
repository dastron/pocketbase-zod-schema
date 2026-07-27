/**
 * Migration execution engine — public API
 *
 * Executes PocketBase JS migration files in a sandboxed context emulating
 * the PocketBase JSVM (goja) instead of statically parsing them, so
 * migrations using loops, helper functions, and computed values are
 * reconstructed correctly.
 */

export { createSimulatedApp, createSimulatedAppBundle, isInertStub, type SimulatedApp } from "./app";
export {
  APPLIED_MIGRATIONS_TABLE,
  AppliedMigrationsError,
  POCKETBASE_DATABASE_FILENAME,
  appliedMigrationsFromList,
  defaultDataDirectory,
  readAppliedMigrations,
  readAppliedMigrationsIfPresent,
  resolveDatabasePath,
} from "./applied-migrations";
export type { AppliedMigration, AppliedMigrationsSource } from "./applied-migrations";
export { Collection, generateRuntimeCollectionId } from "./collection";
export { NO_ROWS_ERROR, createDataApi, type DataApi } from "./data-api";
export { UnsupportedQueryError, createDbx, isDbxExpression, parseStatement, type DbxExpression } from "./dbx";
export {
  ExpressionError,
  evaluateCondition,
  parseCondition,
  type Condition,
  type EvaluationContext,
} from "./expression";
export {
  AutodateField,
  BoolField,
  DateField,
  EditorField,
  EmailField,
  FIELD_CONSTRUCTORS,
  Field,
  FileField,
  GeoPointField,
  JSONField,
  NumberField,
  PasswordField,
  RelationField,
  SelectField,
  TextField,
  URLField,
} from "./fields";
export { FieldsList } from "./fields-list";
export {
  availableGlobals,
  formatGojaLintFinding,
  gojaFindingsFromWarnings,
  lintMigrationFile,
  lintMigrationFiles,
  lintMigrationSource,
} from "./goja-lint";
export type { GojaLintFinding, GojaLintOptions, GojaLintResult, GojaLintRule, GojaLintSeverity } from "./goja-lint";
export { discoverMigrations, planMigrationReplay } from "./migration-plan";
export type { DiscoveredMigration, MigrationPlan, PlanOptions } from "./migration-plan";
export { RecordModel, RecordStore, generateRecordId } from "./records";
export { replayMigrations, replayMigrationsDirectory } from "./replayer";
export {
  executeMigrationDownFile,
  executeMigrationDownSource,
  executeMigrationFile,
  executeMigrationSource,
} from "./runner";
export { compareRawCollections, compareStores, describeStateDifferences } from "./state-compare";
export type { StateCompareOptions, StateDifference } from "./state-compare";
export { CollectionStore } from "./store";
export type {
  EngineOptions,
  EngineRecordMode,
  EngineStrictness,
  EngineWarning,
  MigrationDirection,
  MigrationExecutionResult,
  RawCollection,
  ReplayResult,
} from "./types";
export { unmarshal } from "./unmarshal";
export {
  verifyMigrationFileRoundTrip,
  verifyMigrationFiles,
  verifyMigrationRoundTrip,
  verifyMigrationSources,
} from "./verify";
export type {
  MigrationRoundTripResult,
  MigrationSourceRef,
  MigrationVerificationReport,
  VerifyOptions,
} from "./verify";
