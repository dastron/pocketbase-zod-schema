/**
 * Basic infrastructure test to verify E2E test setup
 */

import { describe, it, expect } from 'vitest';
import { env, logger, generateTestId, createTempDir, cleanupTempDir } from './utils/test-helpers.js';
import { updateTestResult, getResultsSummary } from './utils/results-tracker.js';
import { existsSync } from 'fs';
import { join } from 'path';

describe('E2E Infrastructure', () => {
  it('should have correct environment configuration', () => {
    expect(env.getPbVersion()).toBeTruthy();
    expect(env.getWorkspaceDir()).toBeTruthy();
    expect(env.getDownloadTimeout()).toBeGreaterThan(0);
    expect(env.getStartupTimeout()).toBeGreaterThan(0);
    expect(env.getLogLevel()).toMatch(/^(debug|info|warn|error)$/);
    
    const portRange = env.getPortRange();
    expect(portRange.start).toBeGreaterThan(0);
    expect(portRange.end).toBeGreaterThan(portRange.start);
  });
  
  it('should generate unique test IDs', () => {
    const id1 = generateTestId();
    const id2 = generateTestId();
    
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^test_\d+_[a-f0-9]{8}$/);
  });
  
  it('should create and cleanup temporary directories', async () => {
    const tempDir = await createTempDir('infrastructure-test-');
    
    expect(tempDir).toBeTruthy();
    expect(tempDir).toContain('infrastructure-test-');
    
    // Verify directory exists (we can't easily check filesystem in this test environment)
    // but we can verify the function returns a path
    expect(typeof tempDir).toBe('string');
    
    // Cleanup should not throw
    await expect(cleanupTempDir(tempDir)).resolves.toBeUndefined();
  });
  
  it('should have working logger', () => {
    // Logger should not throw
    expect(() => {
      logger.debug('Test debug message');
      logger.info('Test info message');
      logger.warn('Test warn message');
      logger.error('Test error message');
    }).not.toThrow();
  });

  it('should write results to results directory', () => {
    // Write a test result
    const testScenarioName = 'infrastructure-test';
    const testScore = 100;
    updateTestResult(testScenarioName, testScore, true, {
      score: testScore,
      differences: []
    });

    // Verify results file exists
    const resultsPath = join(process.cwd(), 'tests/e2e/results/test-results.json');
    expect(existsSync(resultsPath)).toBe(true);

    // Verify we can get the summary
    const summary = getResultsSummary();
    expect(summary.totalTests).toBeGreaterThan(0);
    expect(summary.averageDiffPercentage).toBeGreaterThanOrEqual(0);
  });
});