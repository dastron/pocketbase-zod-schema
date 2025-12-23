/**
 * Tests for ReportGenerator component
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createReportGenerator, TestResults, TestReport } from './report-generator.js';
import { MigrationComparison, CliResponseComparison } from './cli-response-analyzer.js';
import { TestScenario } from '../fixtures/test-scenarios.js';

describe('ReportGenerator', () => {
  let reportGenerator: ReturnType<typeof createReportGenerator>;
  let tempDir: string;

  beforeEach(async () => {
    reportGenerator = createReportGenerator();
    tempDir = await mkdtemp(join(tmpdir(), 'report-generator-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('generateReport', () => {
    it('should generate a comprehensive report from test results', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResult('basic-test', 'basic', true, 95, 1000),
        createMockTestResult('field-types-test', 'field-types', true, 85, 2000),
        createMockTestResult('failed-test', 'indexes', false, 45, 500, 'Migration parsing failed'),
      ];

      // Act
      const report = await reportGenerator.generateReport(testResults);

      // Assert
      expect(report).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.pocketbaseVersion).toBeDefined();
      expect(report.libraryVersion).toBeDefined();
      expect(report.overallScore).toBe(75); // (95 + 85 + 45) / 3 = 75
      expect(report.testResults).toHaveLength(3);
      expect(report.summary.totalTests).toBe(3);
      expect(report.summary.passedTests).toBe(2);
      expect(report.summary.failedTests).toBe(1);
      expect(report.summary.averageScore).toBe(75);
      expect(report.recommendations).toBeDefined();
      expect(report.executionMetrics).toBeDefined();
    });

    it('should handle empty test results', async () => {
      // Arrange
      const testResults: TestResults[] = [];

      // Act
      const report = await reportGenerator.generateReport(testResults);

      // Assert
      expect(report.overallScore).toBe(0);
      expect(report.testResults).toHaveLength(0);
      expect(report.summary.totalTests).toBe(0);
      expect(report.summary.passedTests).toBe(0);
      expect(report.summary.failedTests).toBe(0);
    });

    it('should calculate category breakdown correctly', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResult('basic-1', 'basic', true, 90, 1000),
        createMockTestResult('basic-2', 'basic', true, 80, 1200),
        createMockTestResult('field-1', 'field-types', false, 60, 800),
        createMockTestResult('field-2', 'field-types', true, 85, 900),
      ];

      // Act
      const report = await reportGenerator.generateReport(testResults);

      // Assert
      expect(report.summary.categoryBreakdown).toHaveLength(2);
      
      const basicCategory = report.summary.categoryBreakdown.find(c => c.category === 'basic');
      expect(basicCategory).toBeDefined();
      expect(basicCategory!.totalTests).toBe(2);
      expect(basicCategory!.passedTests).toBe(2);
      expect(basicCategory!.averageScore).toBe(85); // (90 + 80) / 2

      const fieldTypesCategory = report.summary.categoryBreakdown.find(c => c.category === 'field-types');
      expect(fieldTypesCategory).toBeDefined();
      expect(fieldTypesCategory!.totalTests).toBe(2);
      expect(fieldTypesCategory!.passedTests).toBe(1);
      expect(fieldTypesCategory!.averageScore).toBe(73); // (60 + 85) / 2 = 72.5 -> 73
    });

    it('should calculate execution metrics correctly', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResult('fast-test', 'basic', true, 90, 500),
        createMockTestResult('slow-test', 'field-types', true, 85, 3000),
        createMockTestResult('medium-test', 'indexes', true, 80, 1500),
      ];

      // Act
      const report = await reportGenerator.generateReport(testResults);

      // Assert
      expect(report.executionMetrics.totalExecutionTime).toBe(5000); // 500 + 3000 + 1500
      expect(report.executionMetrics.averageTestTime).toBe(1667); // 5000 / 3 = 1666.67 -> 1667
      expect(report.executionMetrics.slowestTest.name).toBe('slow-test');
      expect(report.executionMetrics.slowestTest.time).toBe(3000);
      expect(report.executionMetrics.fastestTest.name).toBe('fast-test');
      expect(report.executionMetrics.fastestTest.time).toBe(500);
    });
  });

  describe('generateConsoleReport', () => {
    it('should generate a formatted console report', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResult('test-1', 'basic', true, 95, 1000),
        createMockTestResult('test-2', 'field-types', false, 45, 2000, 'Test failed'),
      ];
      const report = await reportGenerator.generateReport(testResults);

      // Act
      const consoleReport = reportGenerator.generateConsoleReport(report);

      // Assert
      expect(consoleReport).toContain('POCKETBASE E2E MIGRATION VALIDATION REPORT');
      expect(consoleReport).toContain('Overall Compatibility Score');
      expect(consoleReport).toContain('SUMMARY');
      expect(consoleReport).toContain('Total Tests: 2');
      expect(consoleReport).toContain('Passed: 1');
      expect(consoleReport).toContain('Failed: 1');
      expect(consoleReport).toContain('CATEGORY BREAKDOWN');
      expect(consoleReport).toContain('TEST RESULTS');
      expect(consoleReport).toContain('test-1');
      expect(consoleReport).toContain('test-2');
      expect(consoleReport).toContain('EXECUTION METRICS');
    });

    it('should include recommendations when present', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResult('low-score-test', 'basic', false, 30, 1000, 'Critical failure'),
      ];
      const report = await reportGenerator.generateReport(testResults);

      // Act
      const consoleReport = reportGenerator.generateConsoleReport(report);

      // Assert
      expect(consoleReport).toContain('RECOMMENDATIONS');
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('generateJSONReport', () => {
    it('should generate valid JSON report', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResult('test-1', 'basic', true, 90, 1000),
      ];
      const report = await reportGenerator.generateReport(testResults);

      // Act
      const jsonReport = reportGenerator.generateJSONReport(report);

      // Assert
      expect(() => JSON.parse(jsonReport)).not.toThrow();
      const parsed = JSON.parse(jsonReport);
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.overallScore).toBe(90);
      expect(parsed.testResults).toHaveLength(1);
      expect(parsed.summary).toBeDefined();
      expect(parsed.recommendations).toBeDefined();
      expect(parsed.executionMetrics).toBeDefined();
    });
  });

  describe('generateHTMLReport', () => {
    it('should generate valid HTML report', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResult('test-1', 'basic', true, 90, 1000),
        createMockTestResult('test-2', 'field-types', false, 60, 1500, 'Minor issues'),
      ];
      const report = await reportGenerator.generateReport(testResults);

      // Act
      const htmlReport = await reportGenerator.generateHTMLReport(report);

      // Assert
      expect(htmlReport).toContain('<!DOCTYPE html>');
      expect(htmlReport).toContain('<html lang="en">');
      expect(htmlReport).toContain('PocketBase E2E Migration Validation Report');
      expect(htmlReport).toContain('Overall Compatibility Score');
      expect(htmlReport).toContain('Test Summary');
      expect(htmlReport).toContain('Category Breakdown');
      expect(htmlReport).toContain('Test Results');
      expect(htmlReport).toContain('test-1');
      expect(htmlReport).toContain('test-2');
      expect(htmlReport).toContain('Execution Metrics');
      expect(htmlReport).toContain('</html>');
    });

    it('should include recommendations section when recommendations exist', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResult('failing-test', 'basic', false, 40, 1000, 'Critical error'),
      ];
      const report = await reportGenerator.generateReport(testResults);

      // Act
      const htmlReport = await reportGenerator.generateHTMLReport(report);

      // Assert
      expect(htmlReport).toContain('Recommendations');
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('saveReport', () => {
    it('should save console report to file', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResult('test-1', 'basic', true, 90, 1000),
      ];
      const report = await reportGenerator.generateReport(testResults);
      const outputPath = join(tempDir, 'console-report.txt');

      // Act
      await reportGenerator.saveReport(report, 'console', outputPath);

      // Assert
      const savedContent = await readFile(outputPath, 'utf-8');
      expect(savedContent).toContain('POCKETBASE E2E MIGRATION VALIDATION REPORT');
      expect(savedContent).toContain('test-1');
    });

    it('should save JSON report to file', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResult('test-1', 'basic', true, 90, 1000),
      ];
      const report = await reportGenerator.generateReport(testResults);
      const outputPath = join(tempDir, 'json-report.json');

      // Act
      await reportGenerator.saveReport(report, 'json', outputPath);

      // Assert
      const savedContent = await readFile(outputPath, 'utf-8');
      const parsed = JSON.parse(savedContent);
      expect(parsed.overallScore).toBe(90);
      expect(parsed.testResults).toHaveLength(1);
    });

    it('should save HTML report to file', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResult('test-1', 'basic', true, 90, 1000),
      ];
      const report = await reportGenerator.generateReport(testResults);
      const outputPath = join(tempDir, 'html-report.html');

      // Act
      await reportGenerator.saveReport(report, 'html', outputPath);

      // Assert
      const savedContent = await readFile(outputPath, 'utf-8');
      expect(savedContent).toContain('<!DOCTYPE html>');
      expect(savedContent).toContain('test-1');
    });

    it('should create output directory if it does not exist', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResult('test-1', 'basic', true, 90, 1000),
      ];
      const report = await reportGenerator.generateReport(testResults);
      const outputPath = join(tempDir, 'nested', 'dir', 'report.json');

      // Act
      await reportGenerator.saveReport(report, 'json', outputPath);

      // Assert
      const savedContent = await readFile(outputPath, 'utf-8');
      expect(savedContent).toBeDefined();
    });

    it('should throw error for unsupported format', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResult('test-1', 'basic', true, 90, 1000),
      ];
      const report = await reportGenerator.generateReport(testResults);

      // Act & Assert
      await expect(
        reportGenerator.saveReport(report, 'xml' as any, join(tempDir, 'report.xml'))
      ).rejects.toThrow('Unsupported report format: xml');
    });
  });

  describe('recommendations generation', () => {
    it('should generate recommendations for low overall score', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResult('test-1', 'basic', false, 50, 1000),
        createMockTestResult('test-2', 'field-types', false, 40, 1000),
      ];

      // Act
      const report = await reportGenerator.generateReport(testResults);

      // Assert
      expect(report.recommendations.some(rec => rec.includes('Overall compatibility is below 70%'))).toBe(true);
    });

    it('should generate recommendations for critical issues', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResultWithDifferences('test-1', 'basic', true, 80, 1000, 2, 1, 0),
      ];

      // Act
      const report = await reportGenerator.generateReport(testResults);

      // Assert
      expect(report.recommendations.some(rec => rec.includes('2 critical issues found'))).toBe(true);
    });

    it('should generate recommendations for failed tests', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResult('test-1', 'basic', false, 60, 1000, 'Test failed'),
        createMockTestResult('test-2', 'field-types', false, 50, 1000, 'Another failure'),
      ];

      // Act
      const report = await reportGenerator.generateReport(testResults);

      // Assert
      expect(report.recommendations.some(rec => rec.includes('2 tests failed'))).toBe(true);
    });

    it('should generate excellent compatibility message for high scores', async () => {
      // Arrange
      const testResults: TestResults[] = [
        createMockTestResult('test-1', 'basic', true, 98, 1000),
        createMockTestResult('test-2', 'field-types', true, 96, 1000),
      ];

      // Act
      const report = await reportGenerator.generateReport(testResults);

      // Assert
      expect(report.recommendations.some(rec => rec.includes('Excellent compatibility!'))).toBe(true);
    });
  });
});

// Helper functions for creating mock test data

function createMockTestResult(
  name: string,
  category: string,
  passed: boolean,
  score: number,
  executionTime: number,
  error?: string
): TestResults {
  const scenario: TestScenario = {
    name,
    description: `Test scenario for ${name}`,
    category: category as any,
    collectionDefinition: {
      name: `${name}_collection`,
      type: 'base',
      fields: [
        { name: 'title', type: 'text', required: true },
      ],
    },
    expectedFeatures: ['text_field', 'required_validation'],
    minimumScore: 80,
  };

  const migrationComparison: MigrationComparison = {
    filename: {
      nativeFilename: `${Date.now()}_${name}.js`,
      libraryFilename: `${Date.now()}_${name}.js`,
      timestampMatch: true,
      namePatternMatch: true,
      score: 100,
    },
    collections: [],
    overallScore: score,
    criticalDifferences: [],
    majorDifferences: [],
    minorDifferences: [],
    structuralSimilarity: score,
    contentSimilarity: score,
  };

  const cliResponseComparison: CliResponseComparison = {
    exitCodeMatch: passed,
    outputSimilarity: score,
    errorSimilarity: 100,
    structuralMatch: passed,
    differences: passed ? [] : ['Output format differs'],
    score: score,
  };

  return {
    scenario,
    migrationComparison,
    cliResponseComparison,
    executionTime,
    passed,
    error,
    nativeMigrationPath: `/tmp/native_${name}.js`,
    libraryMigrationPath: `/tmp/library_${name}.js`,
  };
}

function createMockTestResultWithDifferences(
  name: string,
  category: string,
  passed: boolean,
  score: number,
  executionTime: number,
  criticalCount: number,
  majorCount: number,
  minorCount: number
): TestResults {
  const result = createMockTestResult(name, category, passed, score, executionTime);
  
  if (result.migrationComparison) {
    // Add mock differences
    for (let i = 0; i < criticalCount; i++) {
      result.migrationComparison.criticalDifferences.push({
        severity: 'critical',
        category: 'field',
        description: `Critical difference ${i + 1}`,
        nativeValue: 'native_value',
        libraryValue: 'library_value',
        path: `field_${i}`,
      });
    }

    for (let i = 0; i < majorCount; i++) {
      result.migrationComparison.majorDifferences.push({
        severity: 'major',
        category: 'index',
        description: `Major difference ${i + 1}`,
        nativeValue: 'native_index',
        libraryValue: 'library_index',
        path: `index_${i}`,
      });
    }

    for (let i = 0; i < minorCount; i++) {
      result.migrationComparison.minorDifferences.push({
        severity: 'minor',
        category: 'rule',
        description: `Minor difference ${i + 1}`,
        nativeValue: 'native_rule',
        libraryValue: 'library_rule',
        path: `rule_${i}`,
      });
    }
  }

  return result;
}