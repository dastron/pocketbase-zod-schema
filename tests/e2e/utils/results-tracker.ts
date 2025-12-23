/**
 * Results tracking system for E2E test diff percentages
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export interface TestResult {
  scenarioName: string;
  diffPercentage: number;
  timestamp: string;
  passed: boolean;
  details?: {
    nativeFile?: string;
    libraryFile?: string;
    differences?: string[];
    score?: number;
  };
}

export interface ResultsData {
  lastUpdated: string;
  totalTests: number;
  averageDiffPercentage: number;
  tests: Record<string, TestResult>;
}

/**
 * Results tracker for managing E2E test diff percentages
 */
export class ResultsTracker {
  private resultsPath: string;
  private data: ResultsData;

  constructor(resultsPath: string = 'tests/e2e/results/test-results.json') {
    this.resultsPath = resultsPath;
    this.data = this.loadResults();
  }

  /**
   * Load existing results or create new structure
   */
  private loadResults(): ResultsData {
    if (existsSync(this.resultsPath)) {
      try {
        const content = readFileSync(this.resultsPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        console.warn(`Warning: Failed to load results from ${this.resultsPath}, creating new results file`);
      }
    }

    return {
      lastUpdated: new Date().toISOString(),
      totalTests: 0,
      averageDiffPercentage: 0,
      tests: {}
    };
  }

  /**
   * Save results to file
   */
  private saveResults(): void {
    try {
      // Ensure directory exists
      const dir = dirname(this.resultsPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Update metadata
      this.data.lastUpdated = new Date().toISOString();
      this.data.totalTests = Object.keys(this.data.tests).length;
      
      // Calculate average diff percentage
      const diffPercentages = Object.values(this.data.tests).map(t => t.diffPercentage);
      this.data.averageDiffPercentage = diffPercentages.length > 0 
        ? diffPercentages.reduce((sum, diff) => sum + diff, 0) / diffPercentages.length 
        : 0;

      // Write to file
      writeFileSync(this.resultsPath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      throw new Error(`Failed to save results to ${this.resultsPath}: ${error}`);
    }
  }

  /**
   * Update or add a test result
   */
  updateTestResult(scenarioName: string, diffPercentage: number, passed: boolean, details?: TestResult['details']): void {
    this.data.tests[scenarioName] = {
      scenarioName,
      diffPercentage,
      timestamp: new Date().toISOString(),
      passed,
      details
    };

    this.saveResults();
  }

  /**
   * Get a specific test result
   */
  getTestResult(scenarioName: string): TestResult | undefined {
    return this.data.tests[scenarioName];
  }

  /**
   * Get all test results
   */
  getAllResults(): ResultsData {
    return { ...this.data };
  }

  /**
   * Get test results filtered by criteria
   */
  getFilteredResults(filter: {
    passed?: boolean;
    minDiffPercentage?: number;
    maxDiffPercentage?: number;
    since?: string; // ISO date string
  }): TestResult[] {
    return Object.values(this.data.tests).filter(result => {
      if (filter.passed !== undefined && result.passed !== filter.passed) {
        return false;
      }

      if (filter.minDiffPercentage !== undefined && result.diffPercentage < filter.minDiffPercentage) {
        return false;
      }

      if (filter.maxDiffPercentage !== undefined && result.diffPercentage > filter.maxDiffPercentage) {
        return false;
      }

      if (filter.since && new Date(result.timestamp) < new Date(filter.since)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    averageDiffPercentage: number;
    bestDiffPercentage: number;
    worstDiffPercentage: number;
    lastUpdated: string;
  } {
    const results = Object.values(this.data.tests);
    const passedTests = results.filter(r => r.passed).length;
    const diffPercentages = results.map(r => r.diffPercentage);

    return {
      totalTests: this.data.totalTests,
      passedTests,
      failedTests: this.data.totalTests - passedTests,
      averageDiffPercentage: this.data.averageDiffPercentage,
      bestDiffPercentage: diffPercentages.length > 0 ? Math.max(...diffPercentages) : 0,
      worstDiffPercentage: diffPercentages.length > 0 ? Math.min(...diffPercentages) : 0,
      lastUpdated: this.data.lastUpdated
    };
  }

  /**
   * Clear all results
   */
  clearResults(): void {
    this.data = {
      lastUpdated: new Date().toISOString(),
      totalTests: 0,
      averageDiffPercentage: 0,
      tests: {}
    };
    this.saveResults();
  }

  /**
   * Remove a specific test result
   */
  removeTestResult(scenarioName: string): boolean {
    if (this.data.tests[scenarioName]) {
      delete this.data.tests[scenarioName];
      this.saveResults();
      return true;
    }
    return false;
  }

  /**
   * Export results to different formats
   */
  exportResults(format: 'json' | 'csv' | 'markdown', outputPath?: string): string {
    const results = Object.values(this.data.tests);
    let content: string;

    switch (format) {
      case 'json':
        content = JSON.stringify(this.data, null, 2);
        break;

      case 'csv':
        const headers = 'Scenario,Diff Percentage,Passed,Timestamp,Details';
        const rows = results.map(r => 
          `"${r.scenarioName}",${r.diffPercentage},${r.passed},"${r.timestamp}","${r.details?.differences?.join('; ') || ''}"`
        );
        content = [headers, ...rows].join('\n');
        break;

      case 'markdown':
        const summary = this.getSummary();
        content = `# E2E Test Results

## Summary
- **Total Tests**: ${summary.totalTests}
- **Passed**: ${summary.passedTests}
- **Failed**: ${summary.failedTests}
- **Average Diff %**: ${summary.averageDiffPercentage.toFixed(2)}%
- **Best Diff %**: ${summary.bestDiffPercentage.toFixed(2)}%
- **Worst Diff %**: ${summary.worstDiffPercentage.toFixed(2)}%
- **Last Updated**: ${summary.lastUpdated}

## Test Results

| Scenario | Diff % | Status | Timestamp |
|----------|--------|--------|-----------|
${results.map(r => 
  `| ${r.scenarioName} | ${r.diffPercentage.toFixed(2)}% | ${r.passed ? '✅' : '❌'} | ${r.timestamp} |`
).join('\n')}
`;
        break;

      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    if (outputPath) {
      const dir = dirname(outputPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(outputPath, content);
    }

    return content;
  }

  /**
   * Compare with previous results to show trends
   */
  getTrends(previousResultsPath?: string): {
    improved: TestResult[];
    degraded: TestResult[];
    new: TestResult[];
    unchanged: TestResult[];
  } {
    if (!previousResultsPath || !existsSync(previousResultsPath)) {
      return {
        improved: [],
        degraded: [],
        new: Object.values(this.data.tests),
        unchanged: []
      };
    }

    try {
      const previousContent = readFileSync(previousResultsPath, 'utf-8');
      const previousData: ResultsData = JSON.parse(previousContent);
      
      const improved: TestResult[] = [];
      const degraded: TestResult[] = [];
      const newTests: TestResult[] = [];
      const unchanged: TestResult[] = [];

      Object.values(this.data.tests).forEach(currentResult => {
        const previousResult = previousData.tests[currentResult.scenarioName];
        
        if (!previousResult) {
          newTests.push(currentResult);
        } else if (currentResult.diffPercentage > previousResult.diffPercentage) {
          improved.push(currentResult);
        } else if (currentResult.diffPercentage < previousResult.diffPercentage) {
          degraded.push(currentResult);
        } else {
          unchanged.push(currentResult);
        }
      });

      return {
        improved,
        degraded,
        new: newTests,
        unchanged
      };
    } catch (error) {
      console.warn(`Warning: Failed to load previous results from ${previousResultsPath}`);
      return {
        improved: [],
        degraded: [],
        new: Object.values(this.data.tests),
        unchanged: []
      };
    }
  }
}

/**
 * Default results tracker instance
 */
export const defaultResultsTracker = new ResultsTracker();

/**
 * Utility function to quickly update a test result
 */
export function updateTestResult(
  scenarioName: string, 
  diffPercentage: number, 
  passed: boolean, 
  details?: TestResult['details']
): void {
  defaultResultsTracker.updateTestResult(scenarioName, diffPercentage, passed, details);
}

/**
 * Utility function to get test results summary
 */
export function getResultsSummary() {
  return defaultResultsTracker.getSummary();
}

/**
 * Utility function to export results
 */
export function exportResults(format: 'json' | 'csv' | 'markdown', outputPath?: string): string {
  return defaultResultsTracker.exportResults(format, outputPath);
}