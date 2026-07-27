/**
 * Migration execution engine — public API
 *
 * Executes PocketBase JS migration files in a sandboxed context emulating
 * the PocketBase JSVM (goja) instead of statically parsing them, so
 * migrations using loops, helper functions, and computed values are
 * reconstructed correctly.
 */

export { Collection, generateRuntimeCollectionId } from "./collection";
export { FieldsList } from "./fields-list";
export {
  Field,
  TextField,
  EmailField,
  URLField,
  NumberField,
  BoolField,
  DateField,
  SelectField,
  RelationField,
  FileField,
  JSONField,
  EditorField,
  GeoPointField,
  AutodateField,
  PasswordField,
  FIELD_CONSTRUCTORS,
} from "./fields";
export { unmarshal } from "./unmarshal";
export { CollectionStore } from "./store";
export { createSimulatedApp, type SimulatedApp } from "./app";
export { executeMigrationSource, executeMigrationFile } from "./runner";
export { replayMigrations, replayMigrationsDirectory } from "./replayer";
export type {
  EngineOptions,
  EngineStrictness,
  EngineWarning,
  MigrationExecutionResult,
  RawCollection,
  ReplayResult,
} from "./types";
