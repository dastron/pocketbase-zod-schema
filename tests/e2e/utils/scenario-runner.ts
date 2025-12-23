/**
 * Test scenario runner with configuration support
 */

import { TestScenario, TestScenarioConfig, getFilteredScenarios } from '../fixtures/test-scenarios.js';
import { ScenarioConfigLoader, loadDefaultConfig } from '../fixtures/scenario-config-loader.js';
import { ResultsTracker } from './results-tracker.js';

export interface ScenarioRunnerOptions {
  config?: TestScenarioConfig;
  configPath?: string;
  customScenariosPath?: string;
  verbose?: boolean;
  dryRun?: boolean;
  resultsTracker?: ResultsTracker;
  resultsPath?: string;
}

export interface ScenarioExecutionResult {
  scenario: TestScenario;
  success: boolean;
  score: number;
  duration: number;
  error?: Error;
  details?: any;
}

export interface ScenarioRunnerResult {
  totalScenarios: number;
  executedScenarios: number;
  skippedScenarios: number;
  successfulScenarios: number;
  failedScenarios: number;
  averageScore: number;
  totalDuration: number;
  results: ScenarioExecutionResult[];
}

/**
 * Test scenario runner with configuration support
 */
export class ScenarioRunner {
  private config: TestScenarioConfig;
  private options: ScenarioRunnerOptions;
  private resultsTracker: ResultsTracker;

  constructor(options: ScenarioRunnerOptions = {}) {
    this.options = options;
    
    // Load configuration
    if (options.config) {
      this.config = options.config;
    } else if (options.configPath || options.customScenariosPath) {
      const loader = new ScenarioConfigLoader(options.configPath, options.customScenariosPath);
      this.config = loader.loadConfig();
    } else {
      this.config = loadDefaultConfig();
    }

    // Initialize results tracker
    this.resultsTracker = options.resultsTracker || new ResultsTracker(options.resultsPath);
  }

  /**
   * Get the results tracker instance
   */
  getResultsTracker(): ResultsTracker {
    return this.resultsTracker;
  }

  /**
   * Get scenarios to run based on configuration
   */
  getScenarios(): TestScenario[] {
    return getFilteredScenarios(this.config);
  }

  /**
   * Run all configured scenarios
   */
  async runScenarios(
    executor: (scenario: TestScenario) => Promise<ScenarioExecutionResult>
  ): Promise<ScenarioRunnerResult> {
    const scenarios = this.getScenarios();
    const results: ScenarioExecutionResult[] = [];
    
    if (this.options.verbose) {
      console.log(`Running ${scenarios.length} scenarios...`);
    }

    if (this.options.dryRun) {
      console.log('Dry run - scenarios that would be executed:');
      scenarios.forEach((scenario, index) => {
        console.log(`  ${index + 1}. ${scenario.name} (${scenario.category})`);
        console.log(`     ${scenario.description}`);
        console.log(`     Tags: ${scenario.tags?.join(', ') || 'none'}`);
        console.log(`     Minimum score: ${scenario.minimumScore}`);
        console.log();
      });
      
      return {
        totalScenarios: scenarios.length,
        executedScenarios: 0,
        skippedScenarios: scenarios.length,
        successfulScenarios: 0,
        failedScenarios: 0,
        averageScore: 0,
        totalDuration: 0,
        results: []
      };
    }

    let totalDuration = 0;
    let successfulScenarios = 0;
    let failedScenarios = 0;
    let totalScore = 0;

    for (const scenario of scenarios) {
      if (this.options.verbose) {
        console.log(`Executing scenario: ${scenario.name}`);
      }

      try {
        const startTime = Date.now();
        const result = await executor(scenario);
        const endTime = Date.now();
        
        result.duration = endTime - startTime;
        totalDuration += result.duration;
        
        if (result.success) {
          successfulScenarios++;
          totalScore += result.score;
        } else {
          failedScenarios++;
        }
        
        results.push(result);
        
        if (this.options.verbose) {
          console.log(`  Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
          console.log(`  Score: ${result.score}`);
          console.log(`  Duration: ${result.duration}ms`);
          if (result.error) {
            console.log(`  Error: ${result.error.message}`);
          }
        }
      } catch (error) {
        const result: ScenarioExecutionResult = {
          scenario,
          success: false,
          score: 0,
          duration: 0,
          error: error as Error
        };
        
        results.push(result);
        failedScenarios++;
        
        if (this.options.verbose) {
          console.log(`  Result: FAILED`);
          console.log(`  Error: ${(error as Error).message}`);
        }
      }
    }

    const averageScore = successfulScenarios > 0 ? totalScore / successfulScenarios : 0;

    return {
      totalScenarios: scenarios.length,
      executedScenarios: scenarios.length,
      skippedScenarios: 0,
      successfulScenarios,
      failedScenarios,
      averageScore,
      totalDuration,
      results
    };
  }

  /**
   * Run a single scenario by name
   */
  async runScenario(
    scenarioName: string,
    executor: (scenario: TestScenario) => Promise<ScenarioExecutionResult>
  ): Promise<ScenarioExecutionResult | null> {
    const scenarios = this.getScenarios();
    const scenario = scenarios.find(s => s.name === scenarioName);
    
    if (!scenario) {
      throw new Error(`Scenario '${scenarioName}' not found or not enabled`);
    }

    if (this.options.verbose) {
      console.log(`Executing single scenario: ${scenario.name}`);
    }

    const startTime = Date.now();
    const result = await executor(scenario);
    const endTime = Date.now();
    
    result.duration = endTime - startTime;
    
    if (this.options.verbose) {
      console.log(`Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`Score: ${result.score}`);
      console.log(`Duration: ${result.duration}ms`);
      if (result.error) {
        console.log(`Error: ${result.error.message}`);
      }
    }

    return result;
  }

  /**
   * Get scenario statistics
   */
  getScenarioStats(): {
    totalAvailable: number;
    totalEnabled: number;
    byCategory: Record<string, number>;
    byTags: Record<string, number>;
  } {
    const scenarios = this.getScenarios();
    const byCategory: Record<string, number> = {};
    const byTags: Record<string, number> = {};

    scenarios.forEach(scenario => {
      // Count by category
      byCategory[scenario.category] = (byCategory[scenario.category] || 0) + 1;
      
      // Count by tags
      if (scenario.tags) {
        scenario.tags.forEach(tag => {
          byTags[tag] = (byTags[tag] || 0) + 1;
        });
      }
    });

    return {
      totalAvailable: scenarios.length,
      totalEnabled: scenarios.filter(s => s.enabled !== false).length,
      byCategory,
      byTags
    };
  }

  /**
   * Print scenario configuration summary
   */
  printConfigSummary(): void {
    const stats = this.getScenarioStats();
    
    console.log('Scenario Configuration Summary:');
    console.log(`  Total scenarios available: ${stats.totalAvailable}`);
    console.log(`  Total scenarios enabled: ${stats.totalEnabled}`);
    
    console.log('\n  By category:');
    Object.entries(stats.byCategory).forEach(([category, count]) => {
      console.log(`    ${category}: ${count}`);
    });
    
    if (Object.keys(stats.byTags).length > 0) {
      console.log('\n  By tags:');
      Object.entries(stats.byTags).forEach(([tag, count]) => {
        console.log(`    ${tag}: ${count}`);
      });
    }
    
    console.log('\n  Configuration:');
    if (this.config.enabledCategories) {
      console.log(`    Enabled categories: ${this.config.enabledCategories.join(', ')}`);
    }
    if (this.config.disabledCategories) {
      console.log(`    Disabled categories: ${this.config.disabledCategories.join(', ')}`);
    }
    if (this.config.enabledScenarios) {
      console.log(`    Enabled scenarios: ${this.config.enabledScenarios.join(', ')}`);
    }
    if (this.config.disabledScenarios) {
      console.log(`    Disabled scenarios: ${this.config.disabledScenarios.join(', ')}`);
    }
    if (this.config.tags) {
      console.log(`    Required tags: ${this.config.tags.join(', ')}`);
    }
    if (this.config.excludeTags) {
      console.log(`    Excluded tags: ${this.config.excludeTags.join(', ')}`);
    }
    if (this.config.minimumScore !== undefined) {
      console.log(`    Minimum score: ${this.config.minimumScore}`);
    }
  }
}

/**
 * Create a scenario runner with quick configuration
 */
export function createQuickRunner(scenarioNames: string[], options: Omit<ScenarioRunnerOptions, 'config'> = {}): ScenarioRunner {
  return new ScenarioRunner({
    ...options,
    config: {
      enabledScenarios: scenarioNames,
      minimumScore: 0
    }
  });
}

/**
 * Create a scenario runner for comprehensive testing
 */
export function createComprehensiveRunner(options: Omit<ScenarioRunnerOptions, 'config'> = {}): ScenarioRunner {
  return new ScenarioRunner({
    ...options,
    config: {
      enabledCategories: ['basic', 'field-types', 'indexes', 'rules', 'auth', 'relations', 'updates'],
      minimumScore: 70
    }
  });
}

/**
 * Create a scenario runner for basic testing
 */
export function createBasicRunner(options: Omit<ScenarioRunnerOptions, 'config'> = {}): ScenarioRunner {
  return new ScenarioRunner({
    ...options,
    config: {
      enabledCategories: ['basic', 'field-types'],
      minimumScore: 80
    }
  });
}