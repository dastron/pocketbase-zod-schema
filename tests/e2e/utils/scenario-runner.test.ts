/**
 * Scenario runner tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ScenarioRunner, ScenarioExecutionResult, createQuickRunner, createBasicRunner, createComprehensiveRunner } from './scenario-runner.js';
import { TestScenario, TestScenarioConfig } from '../fixtures/test-scenarios.js';

describe('Scenario Runner', () => {
  const testConfigDir = join(process.cwd(), 'tests/e2e/utils/test-config');
  const testConfigPath = join(testConfigDir, 'test-scenarios.json');

  beforeEach(() => {
    // Create test config directory
    if (!existsSync(testConfigDir)) {
      mkdirSync(testConfigDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
  });

  describe('Basic Functionality', () => {
    it('should create runner with default configuration', () => {
      const runner = new ScenarioRunner();
      const scenarios = runner.getScenarios();
      
      expect(scenarios.length).toBeGreaterThan(0);
      expect(scenarios.every(s => s.enabled !== false)).toBe(true);
    });

    it('should create runner with custom configuration', () => {
      const config: TestScenarioConfig = {
        enabledCategories: ['basic'],
        minimumScore: 90
      };

      const runner = new ScenarioRunner({ config });
      const scenarios = runner.getScenarios();
      
      expect(scenarios.length).toBeGreaterThan(0);
      expect(scenarios.every(s => s.category === 'basic')).toBe(true);
      expect(scenarios.every(s => s.minimumScore >= 90)).toBe(true);
    });

    it('should load configuration from file', () => {
      const testConfig: TestScenarioConfig = {
        enabledCategories: ['basic'],
        minimumScore: 85
      };

      writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));

      const runner = new ScenarioRunner({ configPath: testConfigPath });
      const scenarios = runner.getScenarios();
      
      expect(scenarios.length).toBeGreaterThan(0);
      expect(scenarios.every(s => s.category === 'basic')).toBe(true);
    });
  });

  describe('Scenario Execution', () => {
    it('should run scenarios with mock executor', async () => {
      const runner = new ScenarioRunner({
        config: { enabledScenarios: ['basic-collection'] }
      });

      const mockExecutor = async (scenario: TestScenario): Promise<ScenarioExecutionResult> => {
        return {
          scenario,
          success: true,
          score: 95,
          duration: 100
        };
      };

      const results = await runner.runScenarios(mockExecutor);
      
      expect(results.totalScenarios).toBe(1);
      expect(results.executedScenarios).toBe(1);
      expect(results.successfulScenarios).toBe(1);
      expect(results.failedScenarios).toBe(0);
      expect(results.averageScore).toBe(95);
      expect(results.results).toHaveLength(1);
      expect(results.results[0].success).toBe(true);
    });

    it('should handle failed scenarios', async () => {
      const runner = new ScenarioRunner({
        config: { enabledScenarios: ['basic-collection'] }
      });

      const mockExecutor = async (scenario: TestScenario): Promise<ScenarioExecutionResult> => {
        return {
          scenario,
          success: false,
          score: 0,
          duration: 50,
          error: new Error('Test failure')
        };
      };

      const results = await runner.runScenarios(mockExecutor);
      
      expect(results.totalScenarios).toBe(1);
      expect(results.executedScenarios).toBe(1);
      expect(results.successfulScenarios).toBe(0);
      expect(results.failedScenarios).toBe(1);
      expect(results.averageScore).toBe(0);
      expect(results.results[0].success).toBe(false);
      expect(results.results[0].error).toBeDefined();
    });

    it('should run single scenario by name', async () => {
      const runner = new ScenarioRunner();

      const mockExecutor = async (scenario: TestScenario): Promise<ScenarioExecutionResult> => {
        return {
          scenario,
          success: true,
          score: 90,
          duration: 75
        };
      };

      const result = await runner.runScenario('basic-collection', mockExecutor);
      
      expect(result).toBeDefined();
      expect(result!.scenario.name).toBe('basic-collection');
      expect(result!.success).toBe(true);
      expect(result!.score).toBe(90);
    });

    it('should handle dry run mode', async () => {
      const runner = new ScenarioRunner({
        config: { enabledScenarios: ['basic-collection'] },
        dryRun: true
      });

      const mockExecutor = async (scenario: TestScenario): Promise<ScenarioExecutionResult> => {
        throw new Error('Should not be called in dry run mode');
      };

      const results = await runner.runScenarios(mockExecutor);
      
      expect(results.totalScenarios).toBe(1);
      expect(results.executedScenarios).toBe(0);
      expect(results.skippedScenarios).toBe(1);
      expect(results.results).toHaveLength(0);
    });
  });

  describe('Statistics and Information', () => {
    it('should provide scenario statistics', () => {
      const runner = new ScenarioRunner({
        config: { enabledCategories: ['basic', 'field-types'] }
      });

      const stats = runner.getScenarioStats();
      
      expect(stats.totalAvailable).toBeGreaterThan(0);
      expect(stats.totalEnabled).toBeGreaterThan(0);
      expect(Object.keys(stats.byCategory)).toContain('basic');
      expect(Object.keys(stats.byCategory)).toContain('field-types');
    });

    it('should print configuration summary', () => {
      const runner = new ScenarioRunner({
        config: { enabledCategories: ['basic'] }
      });

      // This should not throw
      expect(() => runner.printConfigSummary()).not.toThrow();
    });
  });

  describe('Convenience Constructors', () => {
    it('should create quick runner', () => {
      const runner = createQuickRunner(['basic-collection', 'blank-collection']);
      const scenarios = runner.getScenarios();
      
      expect(scenarios).toHaveLength(2);
      expect(scenarios.map(s => s.name)).toEqual(['basic-collection', 'blank-collection']);
    });

    it('should create basic runner', () => {
      const runner = createBasicRunner();
      const scenarios = runner.getScenarios();
      
      expect(scenarios.length).toBeGreaterThan(0);
      expect(scenarios.every(s => ['basic', 'field-types'].includes(s.category))).toBe(true);
    });

    it('should create comprehensive runner', () => {
      const runner = createComprehensiveRunner();
      const scenarios = runner.getScenarios();
      
      expect(scenarios.length).toBeGreaterThan(0);
      
      const categories = new Set(scenarios.map(s => s.category));
      expect(categories.has('basic')).toBe(true);
      expect(categories.has('field-types')).toBe(true);
      expect(categories.has('auth')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid scenario name', async () => {
      const runner = new ScenarioRunner();

      const mockExecutor = async (scenario: TestScenario): Promise<ScenarioExecutionResult> => {
        return {
          scenario,
          success: true,
          score: 90,
          duration: 75
        };
      };

      await expect(runner.runScenario('non-existent-scenario', mockExecutor))
        .rejects.toThrow("Scenario 'non-existent-scenario' not found or not enabled");
    });

    it('should handle executor exceptions', async () => {
      const runner = new ScenarioRunner({
        config: { enabledScenarios: ['basic-collection'] }
      });

      const mockExecutor = async (scenario: TestScenario): Promise<ScenarioExecutionResult> => {
        throw new Error('Executor failed');
      };

      const results = await runner.runScenarios(mockExecutor);
      
      expect(results.failedScenarios).toBe(1);
      expect(results.results[0].success).toBe(false);
      expect(results.results[0].error?.message).toBe('Executor failed');
    });
  });
});