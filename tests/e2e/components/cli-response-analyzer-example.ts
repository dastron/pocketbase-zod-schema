/**
 * CLI Response Analyzer Usage Example
 * 
 * Demonstrates how to use the CLI Response Analyzer in E2E tests
 */

import { createCLIResponseAnalyzer } from './cli-response-analyzer.js';
import { createNativeMigrationGenerator } from './native-migration-generator.js';
import { createLibraryCLI } from './library-cli.js';
import { createWorkspaceManager } from './workspace-manager.js';
import { basicScenarios } from '../fixtures/test-scenarios.js';
import { logger } from '../utils/test-helpers.js';

/**
 * Example function showing how to use the CLI Response Analyzer
 * in a complete E2E test workflow
 */
export async function runComparisonExample(): Promise<void> {
  logger.info('Starting CLI Response Analyzer example');

  // Initialize components
  const analyzer = createCLIResponseAnalyzer();
  const nativeGenerator = createNativeMigrationGenerator();
  const libraryCLI = createLibraryCLI();
  const workspaceManager = createWorkspaceManager();

  try {
    // 1. Set up test workspaces
    const nativeWorkspace = await workspaceManager.createWorkspace();
    const libraryWorkspace = await libraryCLI.createLibraryWorkspace();

    // Initialize PocketBase for native workspace
    await workspaceManager.initializePocketBase(nativeWorkspace);
    await workspaceManager.startPocketBase(nativeWorkspace);

    // 2. Use a test scenario
    const testScenario = basicScenarios[0]; // Basic collection scenario
    logger.info(`Running comparison for scenario: ${testScenario.name}`);

    // 3. Generate migration using native PocketBase CLI
    logger.info('Generating migration using native PocketBase CLI...');
    const nativeMigrationFile = await nativeGenerator.createCollection(
      nativeWorkspace,
      testScenario.collectionDefinition
    );

    // 4. Generate migration using library CLI
    logger.info('Generating migration using library CLI...');
    const libraryMigrationFile = await libraryCLI.generateFromDefinition(
      libraryWorkspace,
      testScenario.collectionDefinition
    );

    // 5. Parse both migration files
    logger.info('Parsing migration files...');
    const nativeParsed = await nativeGenerator.parseMigrationFile(nativeMigrationFile);
    const libraryParsed = await libraryCLI.parseMigrationFile(libraryMigrationFile);

    // 6. Compare migrations using the analyzer
    logger.info('Comparing migrations...');
    const comparison = await analyzer.compareMigrations(nativeParsed, libraryParsed);

    // 7. Display results
    logger.info('=== MIGRATION COMPARISON RESULTS ===');
    logger.info(`Overall Score: ${comparison.overallScore}%`);
    logger.info(`Structural Similarity: ${comparison.structuralSimilarity}%`);
    logger.info(`Content Similarity: ${comparison.contentSimilarity}%`);
    
    logger.info(`\nDifferences Summary:`);
    logger.info(`- Critical: ${comparison.criticalDifferences.length}`);
    logger.info(`- Major: ${comparison.majorDifferences.length}`);
    logger.info(`- Minor: ${comparison.minorDifferences.length}`);

    // 8. Show detailed differences if any
    if (comparison.criticalDifferences.length > 0) {
      logger.info('\n=== CRITICAL DIFFERENCES ===');
      comparison.criticalDifferences.forEach((diff, index) => {
        logger.info(`${index + 1}. ${diff.description}`);
        logger.info(`   Path: ${diff.path}`);
        logger.info(`   Native: ${JSON.stringify(diff.nativeValue)}`);
        logger.info(`   Library: ${JSON.stringify(diff.libraryValue)}`);
      });
    }

    if (comparison.majorDifferences.length > 0) {
      logger.info('\n=== MAJOR DIFFERENCES ===');
      comparison.majorDifferences.forEach((diff, index) => {
        logger.info(`${index + 1}. ${diff.description}`);
        logger.info(`   Path: ${diff.path}`);
      });
    }

    // 9. Collection-level analysis
    logger.info('\n=== COLLECTION ANALYSIS ===');
    comparison.collections.forEach(collection => {
      logger.info(`Collection: ${collection.name} (Score: ${collection.score}%)`);
      logger.info(`  Fields: ${collection.fields.length}`);
      logger.info(`  Indexes: ${collection.indexes.length}`);
      logger.info(`  Rules: ${collection.rules.length}`);
      
      // Show field comparison details
      collection.fields.forEach(field => {
        if (field.score < 100) {
          logger.info(`  Field '${field.fieldName}': ${field.score}% match`);
          field.differences.forEach(diff => {
            logger.info(`    - ${diff.description}`);
          });
        }
      });
    });

    // 10. Compare CLI responses (simulated)
    const nativeCliResponse = 'Migration generated successfully';
    const libraryCliResponse = 'Migration file created';
    const cliComparison = analyzer.compareCliResponses(nativeCliResponse, libraryCliResponse);
    
    logger.info('\n=== CLI RESPONSE COMPARISON ===');
    logger.info(`CLI Response Score: ${cliComparison.score}%`);
    logger.info(`Exit Code Match: ${cliComparison.exitCodeMatch}`);
    logger.info(`Output Similarity: ${cliComparison.outputSimilarity}%`);
    logger.info(`Structural Match: ${cliComparison.structuralMatch}`);

    // 11. Final assessment
    const overallCompatibility = analyzer.calculateCompatibilityScore(comparison);
    logger.info('\n=== FINAL ASSESSMENT ===');
    logger.info(`Overall Compatibility: ${overallCompatibility}%`);
    
    if (overallCompatibility >= testScenario.minimumScore) {
      logger.info(`✅ Test PASSED (meets minimum score of ${testScenario.minimumScore}%)`);
    } else {
      logger.info(`❌ Test FAILED (below minimum score of ${testScenario.minimumScore}%)`);
    }

    // 12. Cleanup
    await workspaceManager.stopPocketBase(nativeWorkspace);
    await workspaceManager.cleanupWorkspace(nativeWorkspace);
    await libraryCLI.cleanupLibraryWorkspace(libraryWorkspace);

    logger.info('CLI Response Analyzer example completed successfully');

  } catch (error) {
    logger.error('CLI Response Analyzer example failed:', error);
    throw error;
  }
}

/**
 * Example showing how to analyze specific field differences
 */
export function analyzeFieldDifferencesExample(): void {
  const analyzer = createCLIResponseAnalyzer();

  // Example field comparison
  const nativeField = {
    id: 'field_1',
    name: 'title',
    type: 'text',
    required: true,
    unique: false,
    options: { max: 100, min: 1 }
  };

  const libraryField = {
    id: 'field_2',
    name: 'title',
    type: 'editor', // Different type
    required: false, // Different required
    unique: true, // Different unique
    options: { max: 200, min: 2 } // Different options
  };

  const fieldComparison = analyzer.analyzeField(nativeField, libraryField);

  logger.info('=== FIELD COMPARISON EXAMPLE ===');
  logger.info(`Field: ${fieldComparison.fieldName}`);
  logger.info(`Score: ${fieldComparison.score}%`);
  logger.info(`Type Match: ${fieldComparison.typeMatch}`);
  logger.info(`Required Match: ${fieldComparison.requiredMatch}`);
  logger.info(`Unique Match: ${fieldComparison.uniqueMatch}`);
  logger.info(`Options Match: ${fieldComparison.optionsMatch}`);

  logger.info('\nDifferences:');
  fieldComparison.differences.forEach((diff, index) => {
    logger.info(`${index + 1}. [${diff.severity.toUpperCase()}] ${diff.description}`);
    logger.info(`   Native: ${JSON.stringify(diff.nativeValue)}`);
    logger.info(`   Library: ${JSON.stringify(diff.libraryValue)}`);
  });
}