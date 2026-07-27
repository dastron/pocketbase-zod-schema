/**
 * E2E Test Components
 * 
 * Exports all E2E test components for easy importing
 */

// PB Downloader
export {
  type PBDownloader,
  type PBDownloadConfig,
  PBDownloaderImpl,
  createPBDownloader,
} from './pb-downloader.js';

// Workspace Manager
export {
  type TestWorkspace,
  type WorkspaceManager,
  WorkspaceManagerImpl,
  createWorkspaceManager,
} from './workspace-manager.js';

// Migration Inspector (engine-backed migration reader)
export {
  type InspectedMigration,
  type InspectOptions,
  type ParsedCollection,
  type ParsedField,
  type ParsedMigration,
  createBaselineStore,
  inspectMigrationFile,
  inspectMigrationSource,
} from './migration-inspector.js';

// Native Migration Generator
export {
  type NativeMigrationGenerator,
  type CollectionChanges,
  NativeMigrationGeneratorImpl,
  createNativeMigrationGenerator,
} from './native-migration-generator.js';

// Library CLI
export {
  type LibraryCLI,
  type LibraryWorkspace,
  LibraryCLIImpl,
  createLibraryCLI,
} from './library-cli.js';

// PocketBase Admin REST API helpers
export {
  SUPERUSER_EMAIL,
  SUPERUSER_PASSWORD,
  adminUrlForPort,
  authenticateSuperuser,
  fetchCollections,
} from './pb-admin-api.js';

// State diff helpers
export {
  type StateLabels,
  alignForComparison,
  describeDiff,
  diffStates,
  scopeSnapshot,
  scoreDiff,
} from './state-diff.js';

// Engine State Comparator
export {
  type EngineStateComparator,
  type StateComparisonResult,
  createEngineStateComparator,
} from './engine-state-comparator.js';

// Real Apply Verifier
export {
  type RealApplyComparison,
  type RealApplyOptions,
  type RealApplyOutcome,
  type RealApplyVerifier,
  createRealApplyVerifier,
  parseMigrateOutput,
} from './real-apply-verifier.js';

// CLI Response Analyzer
export {
  type CLIResponseAnalyzer,
  type MigrationComparison,
  type FilenameComparison,
  type CollectionComparison,
  type PropertyComparison,
  type FieldComparison,
  type IndexComparison,
  type RuleComparison,
  type Difference,
  type CliResponseComparison,
  type ComparisonMetrics,
  CLIResponseAnalyzerImpl,
  createCLIResponseAnalyzer,
} from './cli-response-analyzer.js';

// Report Generator
export {
  type ReportGenerator,
  type TestResults,
  type TestReport,
  type TestScenarioResult,
  type ReportSummary,
  type CategoryBreakdown,
  type SeverityBreakdown,
  type CompatibilityMetrics,
  type ExecutionMetrics,
  ReportGeneratorImpl,
  createReportGenerator,
} from './report-generator.js';