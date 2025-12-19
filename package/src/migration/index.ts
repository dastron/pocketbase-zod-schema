// Migration utilities exports

// Analyzer module
export type { SchemaAnalyzerConfig } from './analyzer.js';
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
} from './analyzer.js';

// Snapshot module
export type { SnapshotConfig } from './snapshot.js';
export {
  SnapshotManager,
  convertPocketBaseMigration,
  findLatestSnapshot,
  getSnapshotPath,
  getSnapshotVersion,
  loadBaseMigration,
  loadSnapshot,
  loadSnapshotIfExists,
  mergeSnapshots,
  saveSnapshot,
  snapshotExists,
  validateSnapshot,
} from './snapshot.js';

// Diff module
export type { ChangeSummary, DestructiveChange, DiffEngineConfig } from './diff.js';
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
} from './diff.js';

// Generator module
export type { MigrationGeneratorConfig } from './generator.js';
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
  generateFieldModification,
  generateFieldDeletion,
  generateFieldsArray,
  generateIndexesArray,
  generateMigrationDescription,
  generateMigrationFilename,
  generatePermissionUpdate,
  generateTimestamp,
  generateUpMigration,
  writeMigrationFile,
} from './generator.js';

// Types
export * from './types.js';

// Errors
export * from './errors.js';

// Migration utilities
export * from './utils/type-mapper.js';
export * from './utils/relation-detector.js';
export * from './utils/pluralize.js';
