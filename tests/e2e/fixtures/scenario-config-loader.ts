/**
 * Configuration loader for test scenarios
 * Supports loading custom scenarios from JSON files and environment variables
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { TestScenario, TestScenarioConfig, validateScenarioConfig, loadConfigFromEnv, defaultConfig } from './test-scenarios.js';

/**
 * Load test scenario configuration from multiple sources
 * Priority: CLI args > Environment variables > Config file > Defaults
 */
export class ScenarioConfigLoader {
  private configPath?: string;
  private customScenariosPath?: string;

  constructor(configPath?: string, customScenariosPath?: string) {
    this.configPath = configPath;
    this.customScenariosPath = customScenariosPath;
  }

  /**
   * Load configuration from all sources
   */
  loadConfig(): TestScenarioConfig {
    let config: TestScenarioConfig = { ...defaultConfig };

    // 1. Load from config file if provided
    if (this.configPath && existsSync(this.configPath)) {
      const fileConfig = this.loadConfigFromFile(this.configPath);
      config = { ...config, ...fileConfig };
    }

    // 2. Load from environment variables
    const envConfig = loadConfigFromEnv();
    config = { ...config, ...envConfig };

    // 3. Load custom scenarios if provided
    if (this.customScenariosPath && existsSync(this.customScenariosPath)) {
      const customScenarios = this.loadCustomScenarios(this.customScenariosPath);
      config.customScenarios = [...(config.customScenarios || []), ...customScenarios];
    }

    // Validate the final configuration
    const validation = validateScenarioConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid scenario configuration: ${validation.errors.join(', ')}`);
    }

    return config;
  }

  /**
   * Load configuration from JSON file
   */
  private loadConfigFromFile(filePath: string): TestScenarioConfig {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const config = JSON.parse(content) as TestScenarioConfig;
      
      // Validate the loaded configuration
      const validation = validateScenarioConfig(config);
      if (!validation.valid) {
        console.warn(`Warning: Invalid configuration in ${filePath}: ${validation.errors.join(', ')}`);
        return {};
      }

      return config;
    } catch (error) {
      console.warn(`Warning: Failed to load configuration from ${filePath}:`, error);
      return {};
    }
  }

  /**
   * Load custom scenarios from JSON file
   */
  private loadCustomScenarios(filePath: string): TestScenario[] {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const scenarios = JSON.parse(content) as TestScenario[];
      
      // Validate each scenario
      const validScenarios: TestScenario[] = [];
      for (const scenario of scenarios) {
        if (this.validateCustomScenario(scenario)) {
          validScenarios.push(scenario);
        } else {
          console.warn(`Warning: Invalid custom scenario '${scenario.name}' in ${filePath}`);
        }
      }

      return validScenarios;
    } catch (error) {
      console.warn(`Warning: Failed to load custom scenarios from ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Validate a custom scenario
   */
  private validateCustomScenario(scenario: TestScenario): boolean {
    // Basic validation
    if (!scenario.name || !scenario.description || !scenario.category) {
      return false;
    }

    if (!scenario.collectionDefinition || !scenario.collectionDefinition.name) {
      return false;
    }

    if (!Array.isArray(scenario.expectedFeatures)) {
      return false;
    }

    if (typeof scenario.minimumScore !== 'number' || scenario.minimumScore < 0 || scenario.minimumScore > 100) {
      return false;
    }

    // Validate collection definition
    const collection = scenario.collectionDefinition;
    if (!['base', 'auth', 'view'].includes(collection.type)) {
      return false;
    }

    if (!Array.isArray(collection.fields)) {
      return false;
    }

    // Validate fields
    for (const field of collection.fields) {
      if (!field.name || !field.type) {
        return false;
      }

      const validTypes = ['text', 'editor', 'number', 'bool', 'email', 'url', 'date', 'select', 'file', 'relation', 'json', 'geoPoint', 'autodate'];
      if (!validTypes.includes(field.type)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Save configuration to file
   */
  saveConfig(config: TestScenarioConfig, filePath: string): void {
    try {
      const content = JSON.stringify(config, null, 2);
      require('fs').writeFileSync(filePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save configuration to ${filePath}: ${error}`);
    }
  }

  /**
   * Create a sample configuration file
   */
  createSampleConfig(filePath: string): void {
    const sampleConfig: TestScenarioConfig = {
      enabledCategories: ['basic', 'field-types'],
      disabledScenarios: ['complex-api-rules'],
      tags: ['basic', 'text-fields'],
      minimumScore: 80
    };

    this.saveConfig(sampleConfig, filePath);
  }

  /**
   * Create a sample custom scenarios file
   */
  createSampleCustomScenarios(filePath: string): void {
    const sampleScenarios: TestScenario[] = [
      {
        name: 'custom-test-scenario',
        description: 'Custom test scenario example',
        category: 'basic',
        collectionDefinition: {
          name: 'custom_test',
          type: 'base',
          fields: [
            {
              name: 'custom_field',
              type: 'text',
              required: true,
              options: { min: 1, max: 50 }
            }
          ]
        },
        expectedFeatures: ['custom_feature'],
        minimumScore: 75,
        enabled: true,
        tags: ['custom', 'example']
      }
    ];

    try {
      const content = JSON.stringify(sampleScenarios, null, 2);
      require('fs').writeFileSync(filePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to create sample custom scenarios file: ${error}`);
    }
  }
}

/**
 * Default configuration file paths
 */
export const DEFAULT_CONFIG_PATHS = {
  config: join(process.cwd(), 'tests/e2e/config/scenarios.json'),
  customScenarios: join(process.cwd(), 'tests/e2e/config/custom-scenarios.json')
};

/**
 * Load configuration with default paths
 */
export function loadDefaultConfig(): TestScenarioConfig {
  const loader = new ScenarioConfigLoader(
    DEFAULT_CONFIG_PATHS.config,
    DEFAULT_CONFIG_PATHS.customScenarios
  );
  return loader.loadConfig();
}

/**
 * Create default configuration files if they don't exist
 */
export function initializeConfigFiles(): void {
  const configDir = join(process.cwd(), 'tests/e2e/config');
  
  // Create config directory if it doesn't exist
  if (!existsSync(configDir)) {
    require('fs').mkdirSync(configDir, { recursive: true });
  }

  const loader = new ScenarioConfigLoader();

  // Create sample config file if it doesn't exist
  if (!existsSync(DEFAULT_CONFIG_PATHS.config)) {
    loader.createSampleConfig(DEFAULT_CONFIG_PATHS.config);
    console.log(`Created sample configuration file: ${DEFAULT_CONFIG_PATHS.config}`);
  }

  // Create sample custom scenarios file if it doesn't exist
  if (!existsSync(DEFAULT_CONFIG_PATHS.customScenarios)) {
    loader.createSampleCustomScenarios(DEFAULT_CONFIG_PATHS.customScenarios);
    console.log(`Created sample custom scenarios file: ${DEFAULT_CONFIG_PATHS.customScenarios}`);
  }
}