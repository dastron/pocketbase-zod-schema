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

// Native Migration Generator
export {
  type NativeMigrationGenerator,
  type CollectionChanges,
  type ParsedCollection,
  type ParsedField,
  type ParsedMigration,
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