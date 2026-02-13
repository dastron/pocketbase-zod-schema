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
  filterDiff,
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
  writeMigrationFile,
} from "./generator/index.js";
export type { MigrationGeneratorConfig } from "./generator/index.js";

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
export type { DestructiveChange as ValidationDestructiveChange, DestructiveChangeType } from "./validation.js";

// Migration utilities
export * from "./utils/pluralize.js";
export * from "./utils/relation-detector.js";
export * from "./utils/type-mapper.js";
