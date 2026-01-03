/**
 * Report Generator Component
 * 
 * Generates comprehensive test reports in multiple formats (console, JSON, HTML)
 * with test result aggregation, compatibility percentages, and recommendations.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { MigrationComparison, CliResponseComparison } from './cli-response-analyzer.js';
import { TestScenario } from '../fixtures/test-scenarios.js';
import { logger } from '../utils/test-helpers.js';

export interface ReportGenerator {
  generateReport(results: TestResults[]): Promise<TestReport>;
  generateConsoleReport(report: TestReport): string;
  generateJSONReport(report: TestReport): string;
  generateHTMLReport(report: TestReport): Promise<string>;
  saveReport(report: TestReport, format: 'console' | 'json' | 'html', outputPath?: string): Promise<void>;
}

export interface TestResults {
  scenario: TestScenario;
  migrationComparison?: MigrationComparison;
  cliResponseComparison?: CliResponseComparison;
  executionTime: number;
  passed: boolean;
  error?: string;
  nativeMigrationPath?: string;
  libraryMigrationPath?: string;
}

export interface TestReport {
  timestamp: string;
  pocketbaseVersion: string;
  libraryVersion: string;
  overallScore: number;
  testResults: TestScenarioResult[];
  summary: ReportSummary;
  recommendations: string[];
  executionMetrics: ExecutionMetrics;
}

export interface TestScenarioResult {
  scenarioName: string;
  description: string;
  category: string;
  passed: boolean;
  score: number;
  migrationComparison?: MigrationComparison;
  cliResponseComparison?: CliResponseComparison;
  executionTime: number;
  error?: string;
  expectedFeatures: string[];
  minimumScore: number;
}

export interface ReportSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  averageScore: number;
  categoryBreakdown: CategoryBreakdown[];
  severityBreakdown: SeverityBreakdown;
  compatibilityMetrics: CompatibilityMetrics;
}

export interface CategoryBreakdown {
  category: string;
  totalTests: number;
  passedTests: number;
  averageScore: number;
  criticalIssues: number;
  majorIssues: number;
  minorIssues: number;
}

export interface SeverityBreakdown {
  critical: number;
  major: number;
  minor: number;
  total: number;
}

export interface CompatibilityMetrics {
  structuralCompatibility: number;
  fieldTypeCompatibility: number;
  indexCompatibility: number;
  ruleCompatibility: number;
  cliResponseCompatibility: number;
}

export interface ExecutionMetrics {
  totalExecutionTime: number;
  averageTestTime: number;
  slowestTest: {
    name: string;
    time: number;
  };
  fastestTest: {
    name: string;
    time: number;
  };
}

export class ReportGeneratorImpl implements ReportGenerator {
  private readonly defaultOutputDir = './test-reports';

  /**
   * Generate a comprehensive test report from test results
   */
  async generateReport(results: TestResults[]): Promise<TestReport> {
    logger.info(`Generating report for ${results.length} test results`);

    try {
      const timestamp = new Date().toISOString();
      const pocketbaseVersion = process.env.PB_VERSION || '0.34.2';
      const libraryVersion = await this.getLibraryVersion();

      // Convert test results to scenario results
      const testResults = results.map(result => this.convertToScenarioResult(result));

      // Calculate overall score
      const overallScore = this.calculateOverallScore(testResults);

      // Generate summary
      const summary = this.generateSummary(testResults);

      // Generate recommendations
      const recommendations = this.generateRecommendations(testResults, summary);

      // Calculate execution metrics
      const executionMetrics = this.calculateExecutionMetrics(results);

      const report: TestReport = {
        timestamp,
        pocketbaseVersion,
        libraryVersion,
        overallScore,
        testResults,
        summary,
        recommendations,
        executionMetrics,
      };

      logger.info(`Report generated successfully. Overall score: ${overallScore}%`);
      return report;

    } catch (error) {
      logger.error('Failed to generate report:', error);
      throw error;
    }
  }

  /**
   * Generate console-formatted report
   */
  generateConsoleReport(report: TestReport): string {
    const lines: string[] = [];

    // Header
    lines.push('');
    lines.push('═'.repeat(80));
    lines.push('  POCKETBASE E2E MIGRATION VALIDATION REPORT');
    lines.push('═'.repeat(80));
    lines.push('');

    // Basic info
    lines.push(`Generated: ${new Date(report.timestamp).toLocaleString()}`);
    lines.push(`PocketBase Version: ${report.pocketbaseVersion}`);
    lines.push(`Library Version: ${report.libraryVersion}`);
    lines.push('');

    // Overall score
    const scoreColor = this.getScoreColor(report.overallScore);
    lines.push(`Overall Compatibility Score: ${scoreColor}${report.overallScore}%${this.resetColor()}`);
    lines.push('');

    // Summary
    lines.push('SUMMARY');
    lines.push('─'.repeat(40));
    lines.push(`Total Tests: ${report.summary.totalTests}`);
    lines.push(`Passed: ${report.summary.passedTests} (${Math.round(report.summary.passedTests / report.summary.totalTests * 100)}%)`);
    lines.push(`Failed: ${report.summary.failedTests} (${Math.round(report.summary.failedTests / report.summary.totalTests * 100)}%)`);
    lines.push(`Average Score: ${report.summary.averageScore}%`);
    lines.push('');

    // Category breakdown
    lines.push('CATEGORY BREAKDOWN');
    lines.push('─'.repeat(40));
    for (const category of report.summary.categoryBreakdown) {
      lines.push(`${category.category.toUpperCase()}:`);
      lines.push(`  Tests: ${category.passedTests}/${category.totalTests} passed`);
      lines.push(`  Score: ${category.averageScore}%`);
      lines.push(`  Issues: ${category.criticalIssues} critical, ${category.majorIssues} major, ${category.minorIssues} minor`);
      lines.push('');
    }

    // Compatibility metrics
    lines.push('COMPATIBILITY METRICS');
    lines.push('─'.repeat(40));
    const metrics = report.summary.compatibilityMetrics;
    lines.push(`Structural Compatibility: ${metrics.structuralCompatibility}%`);
    lines.push(`Field Type Compatibility: ${metrics.fieldTypeCompatibility}%`);
    lines.push(`Index Compatibility: ${metrics.indexCompatibility}%`);
    lines.push(`Rule Compatibility: ${metrics.ruleCompatibility}%`);
    lines.push(`CLI Response Compatibility: ${metrics.cliResponseCompatibility}%`);
    lines.push('');

    // Test results
    lines.push('TEST RESULTS');
    lines.push('─'.repeat(40));
    for (const result of report.testResults) {
      const status = result.passed ? '✓' : '✗';
      const statusColor = result.passed ? '\x1b[32m' : '\x1b[31m';
      lines.push(`${statusColor}${status}${this.resetColor()} ${result.scenarioName} (${result.score}%) - ${result.executionTime}ms`);
      
      if (!result.passed && result.error) {
        lines.push(`    Error: ${result.error}`);
      }
      
      if (result.migrationComparison) {
        const comp = result.migrationComparison;
        if (comp.criticalDifferences.length > 0) {
          lines.push(`    Critical Issues: ${comp.criticalDifferences.length}`);
        }
        if (comp.majorDifferences.length > 0) {
          lines.push(`    Major Issues: ${comp.majorDifferences.length}`);
        }
      }
    }
    lines.push('');

    // Execution metrics
    lines.push('EXECUTION METRICS');
    lines.push('─'.repeat(40));
    lines.push(`Total Execution Time: ${report.executionMetrics.totalExecutionTime}ms`);
    lines.push(`Average Test Time: ${report.executionMetrics.averageTestTime}ms`);
    lines.push(`Slowest Test: ${report.executionMetrics.slowestTest.name} (${report.executionMetrics.slowestTest.time}ms)`);
    lines.push(`Fastest Test: ${report.executionMetrics.fastestTest.name} (${report.executionMetrics.fastestTest.time}ms)`);
    lines.push('');

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('RECOMMENDATIONS');
      lines.push('─'.repeat(40));
      for (const recommendation of report.recommendations) {
        lines.push(`• ${recommendation}`);
      }
      lines.push('');
    }

    lines.push('═'.repeat(80));
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate JSON-formatted report
   */
  generateJSONReport(report: TestReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Generate HTML-formatted report
   */
  async generateHTMLReport(report: TestReport): Promise<string> {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PocketBase E2E Migration Validation Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
            font-weight: 300;
        }
        .header .subtitle {
            margin-top: 10px;
            opacity: 0.9;
            font-size: 1.1em;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .info-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .info-card h3 {
            margin-top: 0;
            color: #667eea;
        }
        .score {
            font-size: 3em;
            font-weight: bold;
            text-align: center;
            margin: 20px 0;
        }
        .score.excellent { color: #28a745; }
        .score.good { color: #17a2b8; }
        .score.fair { color: #ffc107; }
        .score.poor { color: #dc3545; }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .summary-item {
            text-align: center;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 5px;
        }
        .summary-item .number {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
        }
        .category-breakdown {
            margin: 30px 0;
        }
        .category-item {
            background: white;
            margin: 10px 0;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .category-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        .category-name {
            font-size: 1.2em;
            font-weight: bold;
            text-transform: uppercase;
            color: #667eea;
        }
        .category-score {
            font-size: 1.5em;
            font-weight: bold;
        }
        .category-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 10px;
            margin-top: 10px;
        }
        .stat {
            text-align: center;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 5px;
        }
        .test-results {
            margin: 30px 0;
        }
        .test-item {
            background: white;
            margin: 10px 0;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            border-left: 4px solid #ddd;
        }
        .test-item.passed {
            border-left-color: #28a745;
        }
        .test-item.failed {
            border-left-color: #dc3545;
        }
        .test-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .test-name {
            font-weight: bold;
            font-size: 1.1em;
        }
        .test-score {
            font-weight: bold;
            font-size: 1.2em;
        }
        .test-description {
            color: #666;
            margin-bottom: 10px;
        }
        .test-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
            margin-top: 10px;
        }
        .detail {
            text-align: center;
            padding: 8px;
            background: #f8f9fa;
            border-radius: 3px;
            font-size: 0.9em;
        }
        .recommendations {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin: 30px 0;
        }
        .recommendations h3 {
            color: #667eea;
            margin-top: 0;
        }
        .recommendations ul {
            padding-left: 20px;
        }
        .recommendations li {
            margin: 10px 0;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .metric {
            text-align: center;
            padding: 15px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .metric-value {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
        }
        .metric-label {
            color: #666;
            font-size: 0.9em;
            margin-top: 5px;
        }
        .footer {
            text-align: center;
            margin-top: 50px;
            padding: 20px;
            color: #666;
            border-top: 1px solid #ddd;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>PocketBase E2E Migration Validation Report</h1>
        <div class="subtitle">Generated on ${new Date(report.timestamp).toLocaleString()}</div>
    </div>

    <div class="info-grid">
        <div class="info-card">
            <h3>PocketBase Version</h3>
            <div style="font-size: 1.5em; font-weight: bold;">${report.pocketbaseVersion}</div>
        </div>
        <div class="info-card">
            <h3>Library Version</h3>
            <div style="font-size: 1.5em; font-weight: bold;">${report.libraryVersion}</div>
        </div>
        <div class="info-card">
            <h3>Overall Compatibility Score</h3>
            <div class="score ${this.getScoreClass(report.overallScore)}">${report.overallScore}%</div>
        </div>
    </div>

    <div class="info-card">
        <h3>Test Summary</h3>
        <div class="summary-grid">
            <div class="summary-item">
                <div class="number">${report.summary.totalTests}</div>
                <div>Total Tests</div>
            </div>
            <div class="summary-item">
                <div class="number">${report.summary.passedTests}</div>
                <div>Passed</div>
            </div>
            <div class="summary-item">
                <div class="number">${report.summary.failedTests}</div>
                <div>Failed</div>
            </div>
            <div class="summary-item">
                <div class="number">${report.summary.averageScore}%</div>
                <div>Average Score</div>
            </div>
        </div>
    </div>

    <div class="info-card">
        <h3>Compatibility Metrics</h3>
        <div class="metrics-grid">
            <div class="metric">
                <div class="metric-value">${report.summary.compatibilityMetrics.structuralCompatibility}%</div>
                <div class="metric-label">Structural</div>
            </div>
            <div class="metric">
                <div class="metric-value">${report.summary.compatibilityMetrics.fieldTypeCompatibility}%</div>
                <div class="metric-label">Field Types</div>
            </div>
            <div class="metric">
                <div class="metric-value">${report.summary.compatibilityMetrics.indexCompatibility}%</div>
                <div class="metric-label">Indexes</div>
            </div>
            <div class="metric">
                <div class="metric-value">${report.summary.compatibilityMetrics.ruleCompatibility}%</div>
                <div class="metric-label">Rules</div>
            </div>
            <div class="metric">
                <div class="metric-value">${report.summary.compatibilityMetrics.cliResponseCompatibility}%</div>
                <div class="metric-label">CLI Response</div>
            </div>
        </div>
    </div>

    <div class="category-breakdown">
        <h3>Category Breakdown</h3>
        ${report.summary.categoryBreakdown.map(category => `
            <div class="category-item">
                <div class="category-header">
                    <div class="category-name">${category.category}</div>
                    <div class="category-score ${this.getScoreClass(category.averageScore)}">${category.averageScore}%</div>
                </div>
                <div class="category-stats">
                    <div class="stat">
                        <div style="font-weight: bold;">${category.passedTests}/${category.totalTests}</div>
                        <div>Tests Passed</div>
                    </div>
                    <div class="stat">
                        <div style="font-weight: bold; color: #dc3545;">${category.criticalIssues}</div>
                        <div>Critical</div>
                    </div>
                    <div class="stat">
                        <div style="font-weight: bold; color: #ffc107;">${category.majorIssues}</div>
                        <div>Major</div>
                    </div>
                    <div class="stat">
                        <div style="font-weight: bold; color: #17a2b8;">${category.minorIssues}</div>
                        <div>Minor</div>
                    </div>
                </div>
            </div>
        `).join('')}
    </div>

    <div class="test-results">
        <h3>Test Results</h3>
        ${report.testResults.map(result => `
            <div class="test-item ${result.passed ? 'passed' : 'failed'}">
                <div class="test-header">
                    <div class="test-name">${result.scenarioName}</div>
                    <div class="test-score ${this.getScoreClass(result.score)}">${result.score}%</div>
                </div>
                <div class="test-description">${result.description}</div>
                <div class="test-details">
                    <div class="detail">
                        <div style="font-weight: bold;">${result.category}</div>
                        <div>Category</div>
                    </div>
                    <div class="detail">
                        <div style="font-weight: bold;">${result.executionTime}ms</div>
                        <div>Execution Time</div>
                    </div>
                    <div class="detail">
                        <div style="font-weight: bold;">${result.expectedFeatures.length}</div>
                        <div>Expected Features</div>
                    </div>
                    <div class="detail">
                        <div style="font-weight: bold;">${result.minimumScore}%</div>
                        <div>Minimum Score</div>
                    </div>
                </div>
                ${result.error ? `<div style="color: #dc3545; margin-top: 10px; font-weight: bold;">Error: ${result.error}</div>` : ''}
            </div>
        `).join('')}
    </div>

    ${report.recommendations.length > 0 ? `
        <div class="recommendations">
            <h3>Recommendations</h3>
            <ul>
                ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
    ` : ''}

    <div class="info-card">
        <h3>Execution Metrics</h3>
        <div class="metrics-grid">
            <div class="metric">
                <div class="metric-value">${report.executionMetrics.totalExecutionTime}ms</div>
                <div class="metric-label">Total Time</div>
            </div>
            <div class="metric">
                <div class="metric-value">${report.executionMetrics.averageTestTime}ms</div>
                <div class="metric-label">Average Time</div>
            </div>
            <div class="metric">
                <div class="metric-value">${report.executionMetrics.slowestTest.time}ms</div>
                <div class="metric-label">Slowest: ${report.executionMetrics.slowestTest.name}</div>
            </div>
            <div class="metric">
                <div class="metric-value">${report.executionMetrics.fastestTest.time}ms</div>
                <div class="metric-label">Fastest: ${report.executionMetrics.fastestTest.name}</div>
            </div>
        </div>
    </div>

    <div class="footer">
        <p>Generated by PocketBase E2E Migration Validation System</p>
        <p>Report timestamp: ${report.timestamp}</p>
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Save report to file in specified format
   */
  async saveReport(report: TestReport, format: 'console' | 'json' | 'html', outputPath?: string): Promise<void> {
    try {
      let content: string;
      let filename: string;
      let extension: string;

      // Generate content based on format
      switch (format) {
        case 'console':
          content = this.generateConsoleReport(report);
          extension = 'txt';
          break;
        case 'json':
          content = this.generateJSONReport(report);
          extension = 'json';
          break;
        case 'html':
          content = await this.generateHTMLReport(report);
          extension = 'html';
          break;
        default:
          throw new Error(`Unsupported report format: ${format}`);
      }

      // Determine output path
      if (!outputPath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        filename = `e2e-report-${timestamp}.${extension}`;
        outputPath = join(this.defaultOutputDir, filename);
      }

      // Ensure output directory exists
      await mkdir(dirname(outputPath), { recursive: true });

      // Write file
      await writeFile(outputPath, content, 'utf-8');

      logger.info(`Report saved to: ${outputPath}`);

    } catch (error) {
      logger.error(`Failed to save report in ${format} format:`, error);
      throw error;
    }
  }

  /**
   * Convert TestResults to TestScenarioResult
   */
  private convertToScenarioResult(result: TestResults): TestScenarioResult {
    return {
      scenarioName: result.scenario.name,
      description: result.scenario.description,
      category: result.scenario.category,
      passed: result.passed,
      score: result.migrationComparison?.overallScore || 0,
      migrationComparison: result.migrationComparison,
      cliResponseComparison: result.cliResponseComparison,
      executionTime: result.executionTime,
      error: result.error,
      expectedFeatures: result.scenario.expectedFeatures,
      minimumScore: result.scenario.minimumScore,
    };
  }

  /**
   * Calculate overall compatibility score
   */
  private calculateOverallScore(testResults: TestScenarioResult[]): number {
    if (testResults.length === 0) return 0;

    const totalScore = testResults.reduce((sum, result) => sum + result.score, 0);
    return Math.round(totalScore / testResults.length);
  }

  /**
   * Generate comprehensive summary
   */
  private generateSummary(testResults: TestScenarioResult[]): ReportSummary {
    const totalTests = testResults.length;
    const passedTests = testResults.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const averageScore = this.calculateOverallScore(testResults);

    // Category breakdown
    const categoryMap = new Map<string, TestScenarioResult[]>();
    testResults.forEach(result => {
      if (!categoryMap.has(result.category)) {
        categoryMap.set(result.category, []);
      }
      categoryMap.get(result.category)!.push(result);
    });

    const categoryBreakdown: CategoryBreakdown[] = Array.from(categoryMap.entries()).map(([category, results]) => {
      const totalCategoryTests = results.length;
      const passedCategoryTests = results.filter(r => r.passed).length;
      const avgCategoryScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / totalCategoryTests);

      // Count issues by severity
      let criticalIssues = 0;
      let majorIssues = 0;
      let minorIssues = 0;

      results.forEach(result => {
        if (result.migrationComparison) {
          criticalIssues += result.migrationComparison.criticalDifferences.length;
          majorIssues += result.migrationComparison.majorDifferences.length;
          minorIssues += result.migrationComparison.minorDifferences.length;
        }
      });

      return {
        category,
        totalTests: totalCategoryTests,
        passedTests: passedCategoryTests,
        averageScore: avgCategoryScore,
        criticalIssues,
        majorIssues,
        minorIssues,
      };
    });

    // Severity breakdown
    let totalCritical = 0;
    let totalMajor = 0;
    let totalMinor = 0;

    testResults.forEach(result => {
      if (result.migrationComparison) {
        totalCritical += result.migrationComparison.criticalDifferences.length;
        totalMajor += result.migrationComparison.majorDifferences.length;
        totalMinor += result.migrationComparison.minorDifferences.length;
      }
    });

    const severityBreakdown: SeverityBreakdown = {
      critical: totalCritical,
      major: totalMajor,
      minor: totalMinor,
      total: totalCritical + totalMajor + totalMinor,
    };

    // Compatibility metrics
    const compatibilityMetrics = this.calculateCompatibilityMetrics(testResults);

    return {
      totalTests,
      passedTests,
      failedTests,
      averageScore,
      categoryBreakdown,
      severityBreakdown,
      compatibilityMetrics,
    };
  }

  /**
   * Calculate compatibility metrics
   */
  private calculateCompatibilityMetrics(testResults: TestScenarioResult[]): CompatibilityMetrics {
    const validResults = testResults.filter(r => r.migrationComparison);
    
    if (validResults.length === 0) {
      return {
        structuralCompatibility: 0,
        fieldTypeCompatibility: 0,
        indexCompatibility: 0,
        ruleCompatibility: 0,
        cliResponseCompatibility: 0,
      };
    }

    // Calculate averages
    const structuralCompatibility = Math.round(
      validResults.reduce((sum, r) => sum + (r.migrationComparison?.structuralSimilarity || 0), 0) / validResults.length
    );

    const fieldTypeCompatibility = Math.round(
      validResults.reduce((sum, r) => {
        const comp = r.migrationComparison;
        if (!comp) return sum;
        
        const fieldScores = comp.collections.flatMap(c => c.fields.map(f => f.score));
        const avgFieldScore = fieldScores.length > 0 ? fieldScores.reduce((s, score) => s + score, 0) / fieldScores.length : 0;
        return sum + avgFieldScore;
      }, 0) / validResults.length
    );

    const indexCompatibility = Math.round(
      validResults.reduce((sum, r) => {
        const comp = r.migrationComparison;
        if (!comp) return sum;
        
        const indexScores = comp.collections.flatMap(c => c.indexes.map(i => i.score));
        const avgIndexScore = indexScores.length > 0 ? indexScores.reduce((s, score) => s + score, 0) / indexScores.length : 100;
        return sum + avgIndexScore;
      }, 0) / validResults.length
    );

    const ruleCompatibility = Math.round(
      validResults.reduce((sum, r) => {
        const comp = r.migrationComparison;
        if (!comp) return sum;
        
        const ruleScores = comp.collections.flatMap(c => c.rules.map(rule => rule.score));
        const avgRuleScore = ruleScores.length > 0 ? ruleScores.reduce((s, score) => s + score, 0) / ruleScores.length : 100;
        return sum + avgRuleScore;
      }, 0) / validResults.length
    );

    const cliResponseCompatibility = Math.round(
      testResults.filter(r => r.cliResponseComparison).reduce((sum, r) => sum + (r.cliResponseComparison?.score || 0), 0) / 
      Math.max(testResults.filter(r => r.cliResponseComparison).length, 1)
    );

    return {
      structuralCompatibility,
      fieldTypeCompatibility,
      indexCompatibility,
      ruleCompatibility,
      cliResponseCompatibility,
    };
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(testResults: TestScenarioResult[], summary: ReportSummary): string[] {
    const recommendations: string[] = [];

    // Overall score recommendations
    if (summary.averageScore < 70) {
      recommendations.push('Overall compatibility is below 70%. Consider reviewing critical differences and implementing fixes.');
    } else if (summary.averageScore < 85) {
      recommendations.push('Good compatibility score. Focus on resolving major differences to improve further.');
    } else if (summary.averageScore >= 95) {
      recommendations.push('Excellent compatibility! The library is highly compatible with PocketBase CLI.');
    }

    // Critical issues
    if (summary.severityBreakdown.critical > 0) {
      recommendations.push(`${summary.severityBreakdown.critical} critical issues found. These should be addressed immediately as they may cause migration failures.`);
    }

    // Category-specific recommendations
    summary.categoryBreakdown.forEach(category => {
      if (category.averageScore < 60) {
        recommendations.push(`${category.category} category has low compatibility (${category.averageScore}%). Review ${category.category} test scenarios for specific issues.`);
      }
    });

    // Field type compatibility
    if (summary.compatibilityMetrics.fieldTypeCompatibility < 80) {
      recommendations.push('Field type compatibility is below 80%. Review field type mappings and options handling.');
    }

    // Index compatibility
    if (summary.compatibilityMetrics.indexCompatibility < 90) {
      recommendations.push('Index compatibility could be improved. Check index generation and naming conventions.');
    }

    // Rule compatibility
    if (summary.compatibilityMetrics.ruleCompatibility < 85) {
      recommendations.push('API rule compatibility needs attention. Verify rule generation and formatting.');
    }

    // Failed tests
    const failedTests = testResults.filter(r => !r.passed);
    if (failedTests.length > 0) {
      const failedCategories = [...new Set(failedTests.map(t => t.category))];
      recommendations.push(`${failedTests.length} tests failed in categories: ${failedCategories.join(', ')}. Review error messages for specific issues.`);
    }

    // Performance recommendations
    const slowTests = testResults.filter(r => r.executionTime > 5000); // > 5 seconds
    if (slowTests.length > 0) {
      recommendations.push(`${slowTests.length} tests took longer than 5 seconds to execute. Consider optimizing test performance.`);
    }

    return recommendations;
  }

  /**
   * Calculate execution metrics
   */
  private calculateExecutionMetrics(results: TestResults[]): ExecutionMetrics {
    if (results.length === 0) {
      return {
        totalExecutionTime: 0,
        averageTestTime: 0,
        slowestTest: { name: '', time: 0 },
        fastestTest: { name: '', time: 0 },
      };
    }

    const totalExecutionTime = results.reduce((sum, r) => sum + r.executionTime, 0);
    const averageTestTime = Math.round(totalExecutionTime / results.length);

    const sortedByTime = [...results].sort((a, b) => b.executionTime - a.executionTime);
    const slowestTest = {
      name: sortedByTime[0].scenario.name,
      time: sortedByTime[0].executionTime,
    };
    const fastestTest = {
      name: sortedByTime[sortedByTime.length - 1].scenario.name,
      time: sortedByTime[sortedByTime.length - 1].executionTime,
    };

    return {
      totalExecutionTime,
      averageTestTime,
      slowestTest,
      fastestTest,
    };
  }

  /**
   * Get library version from package.json
   */
  private async getLibraryVersion(): Promise<string> {
    try {
      // Try to read from package.json
      const packageJsonPath = join(process.cwd(), 'package', 'package.json');
      const { readFile } = await import('fs/promises');
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
      return packageJson.version || '0.1.0';
    } catch {
      return '0.1.0'; // Default version
    }
  }

  /**
   * Get color code for score display
   */
  private getScoreColor(score: number): string {
    if (score >= 90) return '\x1b[32m'; // Green
    if (score >= 75) return '\x1b[36m'; // Cyan
    if (score >= 60) return '\x1b[33m'; // Yellow
    return '\x1b[31m'; // Red
  }

  /**
   * Get CSS class for score display
   */
  private getScoreClass(score: number): string {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    return 'poor';
  }

  /**
   * Reset console color
   */
  private resetColor(): string {
    return '\x1b[0m';
  }
}

// Export factory function for easier testing and dependency injection
export function createReportGenerator(): ReportGenerator {
  return new ReportGeneratorImpl();
}