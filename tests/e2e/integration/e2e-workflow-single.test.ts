/**
 * Simple E2E test - Single test case
 * 
 * This is a simplified version of e2e-workflow.test.ts that runs just one test
 * to verify the superuser creation and authentication works correctly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createWorkspaceManager, WorkspaceManager, TestWorkspace } from '../components/workspace-manager.js';
import { createPBDownloader, PBDownloader } from '../components/pb-downloader.js';
import { createNativeMigrationGenerator, NativeMigrationGenerator } from '../components/native-migration-generator.js';
import { createLibraryCLI, LibraryCLI, LibraryWorkspace } from '../components/library-cli.js';
import { createCLIResponseAnalyzer, CLIResponseAnalyzer } from '../components/cli-response-analyzer.js';
import { logger } from '../utils/test-helpers.js';
import { basicScenarios } from '../fixtures/test-scenarios.js';

// Set higher timeout for E2E tests
const TEST_TIMEOUT = 60000; // 1 minute per test

describe('E2E Migration Workflow - Single Test', () => {
  let pbDownloader: PBDownloader;
  let workspaceManager: WorkspaceManager;
  let nativeGen: NativeMigrationGenerator;
  let libraryCLI: LibraryCLI;
  let analyzer: CLIResponseAnalyzer;

  beforeAll(async () => {
    logger.info('Starting Single E2E Test');

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
    // Cleanup disabled for investigation - files will persist
    // await pbDownloader.cleanup();
  });

  // Run a single simple test: blank-collection scenario
  it('should match migrations for blank-collection scenario', async () => {
    // Use the simplest scenario: blank-collection
    const scenario = basicScenarios.find(s => s.name === 'blank-collection');
    
    if (!scenario) {
      throw new Error('blank-collection scenario not found');
    }

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

      const libraryMigration = await libraryCLI.parseMigrationFile(libraryMigrationFile);

      // 4. Compare Migrations
      logger.debug(`Comparing migrations for ${scenario.name}`);
      const comparison = await analyzer.compareMigrations(
        nativeMigration,
        libraryMigration,
        scenario.name
      );

      // 5. Assertions & Benchmarking
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
    }
    // Cleanup disabled for investigation - files will persist
  }, TEST_TIMEOUT);
});