/**
 * Migration execution engine — public API
 *
 * Executes PocketBase JS migration files in a sandboxed context emulating
 * the PocketBase JSVM (goja) instead of statically parsing them, so
 * migrations using loops, helper functions, and computed values are
 * reconstructed correctly.
 */

export { createSimulatedApp, type SimulatedApp } from "./app";
export { Collection, generateRuntimeCollectionId } from "./collection";
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
