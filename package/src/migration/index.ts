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
} from "./analyzer.js";
export type { SchemaAnalyzerConfig } from "./analyzer.js";

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
} from "./diff.js";
export type { ChangeSummary, DestructiveChange, DiffEngineConfig } from "./diff.js";

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
} from "./generator.js";
export type { MigrationGeneratorConfig } from "./generator.js";

// Types
export * from "./types.js";

// Errors
export * from "./errors.js";

// Migration utilities
export * from "./utils/pluralize.js";
export * from "./utils/relation-detector.js";
export * from "./utils/type-mapper.js";
