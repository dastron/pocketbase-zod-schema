/**
 * Results tracker tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ResultsTracker, updateTestResult, getResultsSummary, exportResults } from './results-tracker.js';

describe('Results Tracker', () => {
  const testResultsDir = join(process.cwd(), 'tests/e2e/utils/test-results');
  const testResultsPath = join(testResultsDir, 'test-results.json');
  const previousResultsPath = join(testResultsDir, 'previous-results.json');

  beforeEach(() => {
    // Create test results directory
    if (!existsSync(testResultsDir)) {
      mkdirSync(testResultsDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (existsSync(testResultsPath)) {
      unlinkSync(testResultsPath);
    }
    if (existsSync(previousResultsPath)) {
      unlinkSync(previousResultsPath);
    }
  });

  describe('Basic Operations', () => {
    it('should create new results tracker', () => {
      const tracker = new ResultsTracker(testResultsPath);
      const results = tracker.getAllResults();
      
      expect(results.totalTests).toBe(0);
      expect(results.averageDiffPercentage).toBe(0);
      expect(Object.keys(results.tests)).toHaveLength(0);
    });

    it('should update test result', () => {
      const tracker = new ResultsTracker(testResultsPath);
      
      tracker.updateTestResult('test-scenario-1', 95.5, true, {
        nativeFile: 'native.js',
        libraryFile: 'library.js',
        score: 95
      });

      const result = tracker.getTestResult('test-scenario-1');
      
      expect(result).toBeDefined();
      expect(result!.scenarioName).toBe('test-scenario-1');
      expect(result!.diffPercentage).toBe(95.5);
      expect(result!.passed).toBe(true);
      expect(result!.details?.score).toBe(95);
    });

    it('should persist results to file', () => {
      const tracker = new ResultsTracker(testResultsPath);
      
      tracker.updateTestResult('test-scenario-1', 90, true);
      
      expect(existsSync(testResultsPath)).toBe(true);
      
      // Load from file
      const newTracker = new ResultsTracker(testResultsPath);
      const result = newTracker.getTestResult('test-scenario-1');
      
      expect(result).toBeDefined();
      expect(result!.diffPercentage).toBe(90);
    });

    it('should update existing test result', () => {
      const tracker = new ResultsTracker(testResultsPath);
      
      tracker.updateTestResult('test-scenario-1', 85, true);
      tracker.updateTestResult('test-scenario-1', 92, true);
      
      const result = tracker.getTestResult('test-scenario-1');
      
      expect(result!.diffPercentage).toBe(92);
    });

    it('should remove test result', () => {
      const tracker = new ResultsTracker(testResultsPath);
      
      tracker.updateTestResult('test-scenario-1', 90, true);
      expect(tracker.getTestResult('test-scenario-1')).toBeDefined();
      
      const removed = tracker.removeTestResult('test-scenario-1');
      
      expect(removed).toBe(true);
      expect(tracker.getTestResult('test-scenario-1')).toBeUndefined();
    });

    it('should clear all results', () => {
      const tracker = new ResultsTracker(testResultsPath);
      
      tracker.updateTestResult('test-scenario-1', 90, true);
      tracker.updateTestResult('test-scenario-2', 85, true);
      
      tracker.clearResults();
      
      const results = tracker.getAllResults();
      expect(results.totalTests).toBe(0);
      expect(Object.keys(results.tests)).toHaveLength(0);
    });
  });

  describe('Filtering and Queries', () => {
    it('should filter results by passed status', () => {
      const tracker = new ResultsTracker(testResultsPath);
      
      tracker.updateTestResult('test-1', 95, true);
      tracker.updateTestResult('test-2', 60, false);
      tracker.updateTestResult('test-3', 88, true);
      
      const passedResults = tracker.getFilteredResults({ passed: true });
      const failedResults = tracker.getFilteredResults({ passed: false });
      
      expect(passedResults).toHaveLength(2);
      expect(failedResults).toHaveLength(1);
    });

    it('should filter results by diff percentage range', () => {
      const tracker = new ResultsTracker(testResultsPath);
      
      tracker.updateTestResult('test-1', 95, true);
      tracker.updateTestResult('test-2', 75, true);
      tracker.updateTestResult('test-3', 88, true);
      
      const highScoreResults = tracker.getFilteredResults({ minDiffPercentage: 85 });
      const midRangeResults = tracker.getFilteredResults({ 
        minDiffPercentage: 70, 
        maxDiffPercentage: 90 
      });
      
      expect(highScoreResults).toHaveLength(2);
      expect(midRangeResults).toHaveLength(2);
    });
  });

  describe('Summary Statistics', () => {
    it('should calculate summary statistics', () => {
      const tracker = new ResultsTracker(testResultsPath);
      
      tracker.updateTestResult('test-1', 95, true);
      tracker.updateTestResult('test-2', 85, true);
      tracker.updateTestResult('test-3', 70, false);
      
      const summary = tracker.getSummary();
      
      expect(summary.totalTests).toBe(3);
      expect(summary.passedTests).toBe(2);
      expect(summary.failedTests).toBe(1);
      expect(summary.averageDiffPercentage).toBeCloseTo(83.33, 1);
      expect(summary.bestDiffPercentage).toBe(95);
      expect(summary.worstDiffPercentage).toBe(70);
    });

    it('should handle empty results', () => {
      const tracker = new ResultsTracker(testResultsPath);
      const summary = tracker.getSummary();
      
      expect(summary.totalTests).toBe(0);
      expect(summary.passedTests).toBe(0);
      expect(summary.failedTests).toBe(0);
      expect(summary.averageDiffPercentage).toBe(0);
    });
  });

  describe('Export Functionality', () => {
    it('should export results as JSON', () => {
      const tracker = new ResultsTracker(testResultsPath);
      
      tracker.updateTestResult('test-1', 95, true);
      tracker.updateTestResult('test-2', 85, false);
      
      const json = tracker.exportResults('json');
      const parsed = JSON.parse(json);
      
      expect(parsed.totalTests).toBe(2);
      expect(parsed.tests['test-1']).toBeDefined();
      expect(parsed.tests['test-2']).toBeDefined();
    });

    it('should export results as CSV', () => {
      const tracker = new ResultsTracker(testResultsPath);
      
      tracker.updateTestResult('test-1', 95, true);
      tracker.updateTestResult('test-2', 85, false);
      
      const csv = tracker.exportResults('csv');
      
      expect(csv).toContain('Scenario,Diff Percentage,Passed,Timestamp');
      expect(csv).toContain('test-1');
      expect(csv).toContain('test-2');
      expect(csv).toContain('95');
      expect(csv).toContain('85');
    });

    it('should export results as Markdown', () => {
      const tracker = new ResultsTracker(testResultsPath);
      
      tracker.updateTestResult('test-1', 95, true);
      tracker.updateTestResult('test-2', 85, false);
      
      const markdown = tracker.exportResults('markdown');
      
      expect(markdown).toContain('# E2E Test Results');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('test-1');
      expect(markdown).toContain('test-2');
      expect(markdown).toContain('✅');
      expect(markdown).toContain('❌');
    });

    it('should export results to file', () => {
      const tracker = new ResultsTracker(testResultsPath);
      const outputPath = join(testResultsDir, 'export.json');
      
      tracker.updateTestResult('test-1', 95, true);
      tracker.exportResults('json', outputPath);
      
      expect(existsSync(outputPath)).toBe(true);
      
      // Clean up
      unlinkSync(outputPath);
    });
  });

  describe('Trend Analysis', () => {
    it('should identify improved tests', () => {
      // Create previous results
      const previousData = {
        lastUpdated: new Date().toISOString(),
        totalTests: 2,
        averageDiffPercentage: 80,
        tests: {
          'test-1': {
            scenarioName: 'test-1',
            diffPercentage: 80,
            timestamp: new Date().toISOString(),
            passed: true
          },
          'test-2': {
            scenarioName: 'test-2',
            diffPercentage: 75,
            timestamp: new Date().toISOString(),
            passed: true
          }
        }
      };
      
      writeFileSync(previousResultsPath, JSON.stringify(previousData, null, 2));
      
      // Create current results with improvements
      const tracker = new ResultsTracker(testResultsPath);
      tracker.updateTestResult('test-1', 90, true); // Improved
      tracker.updateTestResult('test-2', 75, true); // Unchanged
      
      const trends = tracker.getTrends(previousResultsPath);
      
      expect(trends.improved).toHaveLength(1);
      expect(trends.improved[0].scenarioName).toBe('test-1');
      expect(trends.unchanged).toHaveLength(1);
      expect(trends.degraded).toHaveLength(0);
      expect(trends.new).toHaveLength(0);
    });

    it('should identify degraded tests', () => {
      const previousData = {
        lastUpdated: new Date().toISOString(),
        totalTests: 1,
        averageDiffPercentage: 90,
        tests: {
          'test-1': {
            scenarioName: 'test-1',
            diffPercentage: 90,
            timestamp: new Date().toISOString(),
            passed: true
          }
        }
      };
      
      writeFileSync(previousResultsPath, JSON.stringify(previousData, null, 2));
      
      const tracker = new ResultsTracker(testResultsPath);
      tracker.updateTestResult('test-1', 75, true); // Degraded
      
      const trends = tracker.getTrends(previousResultsPath);
      
      expect(trends.degraded).toHaveLength(1);
      expect(trends.degraded[0].scenarioName).toBe('test-1');
    });

    it('should identify new tests', () => {
      const previousData = {
        lastUpdated: new Date().toISOString(),
        totalTests: 1,
        averageDiffPercentage: 90,
        tests: {
          'test-1': {
            scenarioName: 'test-1',
            diffPercentage: 90,
            timestamp: new Date().toISOString(),
            passed: true
          }
        }
      };
      
      writeFileSync(previousResultsPath, JSON.stringify(previousData, null, 2));
      
      const tracker = new ResultsTracker(testResultsPath);
      tracker.updateTestResult('test-1', 90, true);
      tracker.updateTestResult('test-2', 85, true); // New test
      
      const trends = tracker.getTrends(previousResultsPath);
      
      expect(trends.new).toHaveLength(1);
      expect(trends.new[0].scenarioName).toBe('test-2');
    });
  });

  describe('Utility Functions', () => {
    it('should use default tracker for quick updates', () => {
      updateTestResult('quick-test', 88, true);
      
      const summary = getResultsSummary();
      expect(summary.totalTests).toBeGreaterThan(0);
    });

    it('should export using utility function', () => {
      updateTestResult('export-test', 92, true);
      
      const json = exportResults('json');
      expect(json).toContain('export-test');
    });
  });
});