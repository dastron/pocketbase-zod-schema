import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { copyFile } from 'fs/promises';
import { join } from 'path';
import { createWorkspaceManager, WorkspaceManager, TestWorkspace } from '../components/workspace-manager.js';
import { createPBDownloader, PBDownloader } from '../components/pb-downloader.js';
import { createNativeMigrationGenerator, NativeMigrationGenerator } from '../components/native-migration-generator.js';
import { createLibraryCLI, LibraryCLI, LibraryWorkspace } from '../components/library-cli.js';
import { createCLIResponseAnalyzer, CLIResponseAnalyzer } from '../components/cli-response-analyzer.js';
import { createEngineStateComparator, EngineStateComparator } from '../components/engine-state-comparator.js';
import { createRealApplyVerifier, RealApplyVerifier } from '../components/real-apply-verifier.js';
import { ScenarioRunner } from '../utils/scenario-runner.js';
import { logger } from '../utils/test-helpers.js';
import { TestScenario } from '../fixtures/test-scenarios.js';

// Set higher timeout for E2E tests: each scenario drives two PocketBase
// instances (native capture and the real-apply stage)
const TEST_TIMEOUT = 120000; // 2 minutes per test

/**
 * Both engine-backed agreement scores are expected to be perfect. A scenario
 * overrides this only where a known, documented gap keeps it lower.
 */
const DEFAULT_AGREEMENT_SCORE = 100;

describe('E2E Migration Workflow', () => {
  let pbDownloader: PBDownloader;
  let workspaceManager: WorkspaceManager;
  let nativeGen: NativeMigrationGenerator;
  let libraryCLI: LibraryCLI;
  let analyzer: CLIResponseAnalyzer;
  let stateComparator: EngineStateComparator;
  let realApplyVerifier: RealApplyVerifier;

  beforeAll(async () => {
    logger.info('Starting E2E Migration Tests');

    // Initialize components
    pbDownloader = createPBDownloader();
    workspaceManager = createWorkspaceManager(pbDownloader);
    nativeGen = createNativeMigrationGenerator();
    libraryCLI = createLibraryCLI();
    analyzer = createCLIResponseAnalyzer();
    stateComparator = createEngineStateComparator();
    realApplyVerifier = createRealApplyVerifier(workspaceManager);

    // Ensure PocketBase is downloaded once before tests start
    await pbDownloader.downloadPocketBase();

    // Capture the collections a fresh PocketBase starts with once, so every
    // scenario's simulation begins from the same state PocketBase does
    await realApplyVerifier.getBaselineCollections();
  }, 180000); // 3 minutes setup timeout

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

      // 4. Execute both migrations through the engine and compare states
      // (semantic equivalence, independent of the text comparison below)
      logger.debug(`Executing migrations through the engine for ${scenario.name}`);
      const stateComparison = stateComparator.compareByExecution(nativeMigrationFile, libraryMigrationFile);

      // Hard gate: both the native-captured and the library-generated
      // migration must be executable. A migration the engine cannot run is
      // a real regression regardless of any similarity score.
      expect(
        stateComparison.executionErrors,
        `migrations must execute cleanly: ${JSON.stringify(stateComparison.executionErrors)}`
      ).toEqual([]);

      // 5. Apply the library migration with a real PocketBase binary and
      // diff the resulting database against the engine's simulation — the
      // oracle for both the generated migration and the engine itself
      logger.debug(`Applying the library migration to real PocketBase for ${scenario.name}`);
      const realApply = await realApplyVerifier.applyAndCompare([libraryMigrationFile]);

      // Hard gate: a migration real PocketBase refuses to apply is broken,
      // whatever it looks like next to the native one
      expect(
        realApply.applyFailures,
        `library migration must apply to real PocketBase: ${JSON.stringify(realApply.applyFailures)}`
      ).toEqual([]);

      // 6. Gates on the two agreement scores. Both default to 100 — full
      // agreement — and a scenario pins a lower baseline only where a known
      // gap is tracked in its definition. Either score dropping below its
      // pinned baseline is a regression and fails here.
      const stateStatus = stateComparison.equivalent ? 'EQUIVALENT' : 'DIVERGENT';
      logger.info(
        `Scenario ${scenario.name} state equivalence: ${stateComparison.stateEquivalenceScore}/100 (${stateStatus})`
      );
      if (stateComparison.stateDifferences.length > 0) {
        logger.warn(`State differences in ${scenario.name}:`, stateComparison.stateDifferences);
      }

      const realApplyStatus = realApply.equivalent ? 'MATCHES_REAL' : 'DIVERGES_FROM_REAL';
      logger.info(
        `Scenario ${scenario.name} real apply: ${realApply.realApplyScore}/100 (${realApplyStatus}), ` +
          `collections compared: ${realApply.comparedCollections.join(', ') || 'none'}`
      );
      if (realApply.differences.length > 0) {
        logger.warn(`Real PocketBase vs engine differences in ${scenario.name}:`, realApply.differences);
      }

      const minimumStateScore = scenario.minimumStateEquivalenceScore ?? DEFAULT_AGREEMENT_SCORE;
      expect(
        stateComparison.stateEquivalenceScore,
        `native/library state equivalence below the ${minimumStateScore} baseline:\n` +
          stateComparison.stateDifferences.map(difference => `  - ${difference}`).join('\n')
      ).toBeGreaterThanOrEqual(minimumStateScore);

      const minimumRealApplyScore = scenario.minimumRealApplyScore ?? DEFAULT_AGREEMENT_SCORE;
      expect(
        realApply.realApplyScore,
        `real PocketBase/engine agreement below the ${minimumRealApplyScore} baseline:\n` +
          realApply.differences.map(difference => `  - ${difference}`).join('\n')
      ).toBeGreaterThanOrEqual(minimumRealApplyScore);

      // 7. Legacy text comparison — informational. Both files are read by
      // executing them through the engine, so this scores the collections
      // they produce, not the text; the semantic verdict is the two gates
      // above. Recorded for the report, never asserted.
      logger.debug(`Comparing migrations for ${scenario.name}`);
      const [nativeMigration, libraryMigration] = await Promise.all([
        nativeGen.parseMigrationFile(nativeMigrationFile),
        libraryCLI.parseMigrationFile(libraryMigrationFile),
      ]);

      const comparison = await analyzer.compareMigrations(
        nativeMigration,
        libraryMigration,
        scenario.name
      );
      comparison.stateEquivalenceScore = stateComparison.stateEquivalenceScore;
      comparison.stateDifferences = stateComparison.stateDifferences;
      comparison.realApplyScore = realApply.realApplyScore;
      comparison.realApplyDifferences = realApply.differences;

      const scoreStatus = comparison.overallScore >= scenario.minimumScore ? 'PASS' : 'BELOW_THRESHOLD';
      logger.info(
        `Scenario ${scenario.name} text similarity (informational): ` +
          `${comparison.overallScore}/${scenario.minimumScore} (${scoreStatus})`
      );

      if (comparison.criticalDifferences.length > 0) {
        logger.warn(`Critical differences in ${scenario.name}:`, comparison.criticalDifferences);
      }

      // Both sides must actually describe the scenario's collection
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
