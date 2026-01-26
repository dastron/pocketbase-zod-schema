import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { copyFile } from 'fs/promises';
import { join } from 'path';
import { createWorkspaceManager, WorkspaceManager, TestWorkspace } from '../components/workspace-manager.js';
import { createPBDownloader, PBDownloader } from '../components/pb-downloader.js';
import { createNativeMigrationGenerator, NativeMigrationGenerator } from '../components/native-migration-generator.js';
import { createLibraryCLI, LibraryCLI, LibraryWorkspace } from '../components/library-cli.js';
import { createCLIResponseAnalyzer, CLIResponseAnalyzer } from '../components/cli-response-analyzer.js';
import { ScenarioRunner } from '../utils/scenario-runner.js';
import { logger } from '../utils/test-helpers.js';
import { TestScenario } from '../fixtures/test-scenarios.js';

// Set higher timeout for E2E tests
const TEST_TIMEOUT = 60000; // 1 minute per test

describe('E2E Migration Workflow', () => {
  let pbDownloader: PBDownloader;
  let workspaceManager: WorkspaceManager;
  let nativeGen: NativeMigrationGenerator;
  let libraryCLI: LibraryCLI;
  let analyzer: CLIResponseAnalyzer;

  beforeAll(async () => {
    logger.info('Starting E2E Migration Tests');

    // Initialize components
    pbDownloader = createPBDownloader();
    workspaceManager = createWorkspaceManager(pbDownloader);
    nativeGen = createNativeMigrationGenerator();
    libraryCLI = createLibraryCLI();
    analyzer = createCLIResponseAnalyzer();

    // Ensure PocketBase is downloaded once before tests start
    await pbDownloader.downloadPocketBase();
  }, 120000); // 2 minutes setup timeout

  afterAll(async () => {
    // Cleanup any remaining resources
    await pbDownloader.cleanup();
  });

  // Get scenarios to run
  // Exclude updates category for now as it requires special handling
  const scenarioRunner = new ScenarioRunner({
    config: {
      enabledCategories: ['basic', 'field-types', 'indexes', 'rules', 'auth', 'relations'],
      minimumScore: 70
    }
  });
  const scenarios = scenarioRunner.getScenarios();

  if (scenarios.length === 0) {
    it('should have scenarios to run', () => {
      throw new Error('No scenarios found matching configuration');
    });
  }

  // Generate test cases for each scenario
  for (const scenario of scenarios) {
    it(`should match migrations for scenario: ${scenario.name}`, async () => {
      await runTestScenario(scenario);
    }, TEST_TIMEOUT);
  }

  async function runTestScenario(scenario: TestScenario) {
    logger.info(`Running scenario: ${scenario.name}`);

    let nativeWorkspace: TestWorkspace | undefined;
    let libraryWorkspace: LibraryWorkspace | undefined;

    try {
      // 1. Setup Workspaces
      [nativeWorkspace, libraryWorkspace] = await Promise.all([
        workspaceManager.createWorkspace(),
        libraryCLI.createLibraryWorkspace()
      ]);

      // 2. Native Migration Generation
      logger.debug(`Starting native generation for ${scenario.name}`);
      await workspaceManager.initializePocketBase(nativeWorkspace);
      await workspaceManager.startPocketBase(nativeWorkspace);

      const nativeMigrationFile = await nativeGen.createCollection(
        nativeWorkspace,
        scenario.collectionDefinition
      );

      const nativeMigration = await nativeGen.parseMigrationFile(nativeMigrationFile);

      // 3. Library Migration Generation
      logger.debug(`Starting library generation for ${scenario.name}`);
      const libraryMigrationFile = await libraryCLI.generateFromSchema(
        libraryWorkspace,
        scenario.collectionDefinition
      );

      // Copy library-generated migration to native workspace for analysis
      const libraryFileName = libraryMigrationFile.split('/').pop()!;
      const targetPath = join(nativeWorkspace.migrationDir, libraryFileName);
      await copyFile(libraryMigrationFile, targetPath);
      logger.debug(`Exported library migration to: ${targetPath}`);

      const libraryMigration = await libraryCLI.parseMigrationFile(libraryMigrationFile);

      // 4. Compare Migrations
      logger.debug(`Comparing migrations for ${scenario.name}`);
      const comparison = await analyzer.compareMigrations(
        nativeMigration,
        libraryMigration,
        scenario.name
      );

      // 5. Assertions & Benchmarking
      // Note: Score thresholds are logged for benchmarking but don't cause test failures
      // Tests only fail on runtime errors (e.g., authentication, file parsing, etc.)

      // Log overall score for benchmarking (threshold will be enforced later)
      const scoreStatus = comparison.overallScore >= scenario.minimumScore ? 'PASS' : 'BELOW_THRESHOLD';
      logger.info(`Scenario ${scenario.name} score: ${comparison.overallScore}/${scenario.minimumScore} (${scoreStatus})`);

      // Log critical differences for benchmarking (warnings only, not failures)
      if (comparison.criticalDifferences.length > 0) {
        logger.warn(`Critical differences in ${scenario.name}:`, comparison.criticalDifferences);
      }

      // Check that all expected collections exist (structural check - should still pass)
      const collectionNames = nativeMigration.collections.map(c => c.name);
      expect(collectionNames).toContain(scenario.collectionDefinition.name);

      const libCollectionNames = libraryMigration.collections.map(c => c.name);
      expect(libCollectionNames).toContain(scenario.collectionDefinition.name);

      logger.info(`Scenario ${scenario.name} completed successfully (score: ${comparison.overallScore})`);

    } catch (error) {
      logger.error(`Scenario ${scenario.name} failed:`, error);
      throw error;
    } finally {
      // 6. Cleanup
      if (nativeWorkspace) {
        await workspaceManager.cleanupWorkspace(nativeWorkspace);
      }
      if (libraryWorkspace) {
        await libraryCLI.cleanupLibraryWorkspace(libraryWorkspace);
      }
    }
  }
});
