#!/usr/bin/env node

/**
 * CLI utility for managing E2E test results
 */

import { program } from 'commander';
import { ResultsTracker } from '../utils/results-tracker.js';
import { existsSync } from 'fs';

program
  .name('results-cli')
  .description('CLI for managing E2E test results')
  .version('1.0.0');

// Summary command
program
  .command('summary')
  .description('Show results summary')
  .option('-f, --file <path>', 'Results file path', 'tests/e2e/results/test-results.json')
  .action((options) => {
    try {
      const tracker = new ResultsTracker(options.file);
      const summary = tracker.getSummary();
      
      console.log('📊 E2E Test Results Summary');
      console.log('═'.repeat(40));
      console.log(`Total Tests: ${summary.totalTests}`);
      console.log(`Passed: ${summary.passedTests} ✅`);
      console.log(`Failed: ${summary.failedTests} ❌`);
      console.log(`Average Diff %: ${summary.averageDiffPercentage.toFixed(2)}%`);
      console.log(`Best Score: ${summary.bestDiffPercentage.toFixed(2)}%`);
      console.log(`Worst Score: ${summary.worstDiffPercentage.toFixed(2)}%`);
      console.log(`Last Updated: ${new Date(summary.lastUpdated).toLocaleString()}`);
    } catch (error) {
      console.error('❌ Failed to load results:', (error as Error).message);
      process.exit(1);
    }
  });

// List command
program
  .command('list')
  .description('List test results')
  .option('-f, --file <path>', 'Results file path', 'tests/e2e/results/test-results.json')
  .option('--passed', 'Show only passed tests')
  .option('--failed', 'Show only failed tests')
  .option('--min-score <score>', 'Minimum score threshold', parseFloat)
  .option('--max-score <score>', 'Maximum score threshold', parseFloat)
  .option('--since <date>', 'Show results since date (ISO format)')
  .action((options) => {
    try {
      const tracker = new ResultsTracker(options.file);
      
      const filter: any = {};
      if (options.passed) filter.passed = true;
      if (options.failed) filter.passed = false;
      if (options.minScore !== undefined) filter.minDiffPercentage = options.minScore;
      if (options.maxScore !== undefined) filter.maxDiffPercentage = options.maxScore;
      if (options.since) filter.since = options.since;
      
      const results = tracker.getFilteredResults(filter);
      
      console.log(`📋 Test Results (${results.length} tests)`);
      console.log('═'.repeat(80));
      
      if (results.length === 0) {
        console.log('No results match the specified criteria.');
        return;
      }
      
      results.forEach((result, index) => {
        const status = result.passed ? '✅' : '❌';
        const score = result.diffPercentage.toFixed(2);
        const timestamp = new Date(result.timestamp).toLocaleString();
        
        console.log(`${index + 1}. ${result.scenarioName} ${status}`);
        console.log(`   Score: ${score}% | ${timestamp}`);
        
        if (result.details?.differences && result.details.differences.length > 0) {
          console.log(`   Differences: ${result.details.differences.slice(0, 2).join(', ')}${result.details.differences.length > 2 ? '...' : ''}`);
        }
        console.log();
      });
    } catch (error) {
      console.error('❌ Failed to load results:', (error as Error).message);
      process.exit(1);
    }
  });

// Export command
program
  .command('export')
  .description('Export results to different formats')
  .option('-f, --file <path>', 'Results file path', 'tests/e2e/results/test-results.json')
  .option('-o, --output <path>', 'Output file path')
  .option('--format <format>', 'Export format (json, csv, markdown)', 'json')
  .action((options) => {
    try {
      const tracker = new ResultsTracker(options.file);
      
      if (!['json', 'csv', 'markdown'].includes(options.format)) {
        console.error('❌ Invalid format. Use: json, csv, or markdown');
        process.exit(1);
      }
      
      const content = tracker.exportResults(options.format as any, options.output);
      
      if (options.output) {
        console.log(`✅ Results exported to ${options.output}`);
      } else {
        console.log(content);
      }
    } catch (error) {
      console.error('❌ Failed to export results:', (error as Error).message);
      process.exit(1);
    }
  });

// Clear command
program
  .command('clear')
  .description('Clear all results')
  .option('-f, --file <path>', 'Results file path', 'tests/e2e/results/test-results.json')
  .option('--confirm', 'Skip confirmation prompt')
  .action((options) => {
    try {
      if (!options.confirm) {
        console.log('⚠️  This will permanently delete all test results.');
        console.log('Use --confirm to proceed without this prompt.');
        process.exit(0);
      }
      
      const tracker = new ResultsTracker(options.file);
      tracker.clearResults();
      
      console.log('✅ All results cleared successfully');
    } catch (error) {
      console.error('❌ Failed to clear results:', (error as Error).message);
      process.exit(1);
    }
  });

// Compare command
program
  .command('compare')
  .description('Compare current results with previous results')
  .option('-f, --file <path>', 'Current results file path', 'tests/e2e/results/test-results.json')
  .option('-p, --previous <path>', 'Previous results file path')
  .action((options) => {
    try {
      const tracker = new ResultsTracker(options.file);
      
      if (!options.previous) {
        console.error('❌ Previous results file path is required (use -p or --previous)');
        process.exit(1);
      }
      
      if (!existsSync(options.previous)) {
        console.error(`❌ Previous results file not found: ${options.previous}`);
        process.exit(1);
      }
      
      const trends = tracker.getTrends(options.previous);
      
      console.log('📈 Results Comparison');
      console.log('═'.repeat(40));
      
      if (trends.improved.length > 0) {
        console.log(`\n✅ Improved (${trends.improved.length}):`);
        trends.improved.forEach(result => {
          console.log(`  • ${result.scenarioName}: ${result.diffPercentage.toFixed(2)}%`);
        });
      }
      
      if (trends.degraded.length > 0) {
        console.log(`\n❌ Degraded (${trends.degraded.length}):`);
        trends.degraded.forEach(result => {
          console.log(`  • ${result.scenarioName}: ${result.diffPercentage.toFixed(2)}%`);
        });
      }
      
      if (trends.new.length > 0) {
        console.log(`\n🆕 New Tests (${trends.new.length}):`);
        trends.new.forEach(result => {
          console.log(`  • ${result.scenarioName}: ${result.diffPercentage.toFixed(2)}%`);
        });
      }
      
      if (trends.unchanged.length > 0) {
        console.log(`\n➡️  Unchanged (${trends.unchanged.length}):`);
        trends.unchanged.forEach(result => {
          console.log(`  • ${result.scenarioName}: ${result.diffPercentage.toFixed(2)}%`);
        });
      }
      
      if (trends.improved.length === 0 && trends.degraded.length === 0 && trends.new.length === 0) {
        console.log('\nNo changes detected between result sets.');
      }
    } catch (error) {
      console.error('❌ Failed to compare results:', (error as Error).message);
      process.exit(1);
    }
  });

// Info command
program
  .command('info <scenario>')
  .description('Show detailed information about a specific test result')
  .option('-f, --file <path>', 'Results file path', 'tests/e2e/results/test-results.json')
  .action((scenario, options) => {
    try {
      const tracker = new ResultsTracker(options.file);
      const result = tracker.getTestResult(scenario);
      
      if (!result) {
        console.error(`❌ No result found for scenario: ${scenario}`);
        process.exit(1);
      }
      
      console.log(`📋 Test Result: ${result.scenarioName}`);
      console.log('═'.repeat(50));
      console.log(`Status: ${result.passed ? '✅ Passed' : '❌ Failed'}`);
      console.log(`Score: ${result.diffPercentage.toFixed(2)}%`);
      console.log(`Timestamp: ${new Date(result.timestamp).toLocaleString()}`);
      
      if (result.details) {
        if (result.details.nativeFile) {
          console.log(`Native File: ${result.details.nativeFile}`);
        }
        if (result.details.libraryFile) {
          console.log(`Library File: ${result.details.libraryFile}`);
        }
        
        if (result.details.differences && result.details.differences.length > 0) {
          console.log('\nDifferences:');
          result.details.differences.forEach((diff, index) => {
            console.log(`  ${index + 1}. ${diff}`);
          });
        } else {
          console.log('\nNo differences found.');
        }
      }
    } catch (error) {
      console.error('❌ Failed to load result info:', (error as Error).message);
      process.exit(1);
    }
  });

// Update command
program
  .command('update <scenario> <score>')
  .description('Update a test result manually')
  .option('-f, --file <path>', 'Results file path', 'tests/e2e/results/test-results.json')
  .option('--passed', 'Mark as passed')
  .option('--failed', 'Mark as failed')
  .action((scenario, score, options) => {
    try {
      const diffPercentage = parseFloat(score);
      
      if (isNaN(diffPercentage) || diffPercentage < 0 || diffPercentage > 100) {
        console.error('❌ Score must be a number between 0 and 100');
        process.exit(1);
      }
      
      let passed: boolean;
      if (options.passed && options.failed) {
        console.error('❌ Cannot specify both --passed and --failed');
        process.exit(1);
      } else if (options.passed) {
        passed = true;
      } else if (options.failed) {
        passed = false;
      } else {
        passed = diffPercentage >= 70; // Default threshold
      }
      
      const tracker = new ResultsTracker(options.file);
      tracker.updateTestResult(scenario, diffPercentage, passed);
      
      console.log(`✅ Updated result for ${scenario}: ${diffPercentage}% (${passed ? 'Passed' : 'Failed'})`);
    } catch (error) {
      console.error('❌ Failed to update result:', (error as Error).message);
      process.exit(1);
    }
  });

program.parse();