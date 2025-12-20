/**
 * Test scenario configuration system tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  TestScenarioConfig,
  getFilteredScenarios,
  validateScenarioConfig,
  loadConfigFromEnv,
  getAvailableCategories,
  getAvailableTags,
  createQuickTestConfig,
  createComprehensiveTestConfig,
  createBasicTestConfig,
  allScenarios
} from './test-scenarios.js';
import { ScenarioConfigLoader } from './scenario-config-loader.js';

describe('Test Scenario Configuration System', () => {
  const testConfigDir = join(process.cwd(), 'tests/e2e/fixtures/test-config');
  const testConfigPath = join(testConfigDir, 'test-scenarios.json');
  const testCustomScenariosPath = join(testConfigDir, 'test-custom-scenarios.json');

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
    if (existsSync(testCustomScenariosPath)) {
      unlinkSync(testCustomScenariosPath);
    }
    
    // Clean up environment variables
    delete process.env.E2E_ENABLED_CATEGORIES;
    delete process.env.E2E_DISABLED_CATEGORIES;
    delete process.env.E2E_ENABLED_SCENARIOS;
    delete process.env.E2E_DISABLED_SCENARIOS;
    delete process.env.E2E_TAGS;
    delete process.env.E2E_EXCLUDE_TAGS;
    delete process.env.E2E_MINIMUM_SCORE;
  });

  describe('Basic Configuration', () => {
    it('should filter scenarios by enabled categories', () => {
      const config: TestScenarioConfig = {
        enabledCategories: ['basic']
      };

      const filtered = getFilteredScenarios(config);
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every(s => s.category === 'basic')).toBe(true);
    });

    it('should filter scenarios by disabled categories', () => {
      const config: TestScenarioConfig = {
        disabledCategories: ['auth']
      };

      const filtered = getFilteredScenarios(config);
      expect(filtered.every(s => s.category !== 'auth')).toBe(true);
    });

    it('should filter scenarios by enabled scenarios', () => {
      const config: TestScenarioConfig = {
        enabledScenarios: ['basic-collection', 'blank-collection']
      };

      const filtered = getFilteredScenarios(config);
      expect(filtered.length).toBe(2);
      expect(filtered.map(s => s.name)).toEqual(['basic-collection', 'blank-collection']);
    });

    it('should filter scenarios by disabled scenarios', () => {
      const config: TestScenarioConfig = {
        disabledScenarios: ['basic-collection']
      };

      const filtered = getFilteredScenarios(config);
      expect(filtered.every(s => s.name !== 'basic-collection')).toBe(true);
    });

    it('should filter scenarios by tags', () => {
      const config: TestScenarioConfig = {
        tags: ['basic']
      };

      const filtered = getFilteredScenarios(config);
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every(s => s.tags && s.tags.includes('basic'))).toBe(true);
    });

    it('should filter scenarios by minimum score', () => {
      const config: TestScenarioConfig = {
        minimumScore: 90
      };

      const filtered = getFilteredScenarios(config);
      expect(filtered.every(s => s.minimumScore >= 90)).toBe(true);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate valid configuration', () => {
      const config: TestScenarioConfig = {
        enabledCategories: ['basic', 'field-types'],
        minimumScore: 80
      };

      const result = validateScenarioConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid categories', () => {
      const config: TestScenarioConfig = {
        enabledCategories: ['invalid-category' as any]
      };

      const result = validateScenarioConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid enabled categories'))).toBe(true);
    });

    it('should reject invalid minimum score', () => {
      const config: TestScenarioConfig = {
        minimumScore: 150
      };

      const result = validateScenarioConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Minimum score must be between 0 and 100'))).toBe(true);
    });
  });

  describe('Environment Variable Loading', () => {
    it('should load configuration from environment variables', () => {
      process.env.E2E_ENABLED_CATEGORIES = 'basic,field-types';
      process.env.E2E_MINIMUM_SCORE = '85';
      process.env.E2E_TAGS = 'basic,text-fields';

      const config = loadConfigFromEnv();
      
      expect(config.enabledCategories).toEqual(['basic', 'field-types']);
      expect(config.minimumScore).toBe(85);
      expect(config.tags).toEqual(['basic', 'text-fields']);
    });
  });

  describe('File-based Configuration', () => {
    it('should load configuration from JSON file', () => {
      const testConfig: TestScenarioConfig = {
        enabledCategories: ['basic'],
        minimumScore: 75
      };

      writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));

      const loader = new ScenarioConfigLoader(testConfigPath);
      const config = loader.loadConfig();

      expect(config.enabledCategories).toEqual(['basic']);
      expect(config.minimumScore).toBe(75);
    });

    it('should load custom scenarios from JSON file', () => {
      const customScenarios = [
        {
          name: 'test-custom-scenario',
          description: 'Test custom scenario',
          category: 'basic' as const,
          collectionDefinition: {
            name: 'test_custom',
            type: 'base' as const,
            fields: [
              {
                name: 'title',
                type: 'text' as const,
                required: true
              }
            ]
          },
          expectedFeatures: ['custom_feature'],
          minimumScore: 80,
          enabled: true,
          tags: ['custom']
        }
      ];

      writeFileSync(testCustomScenariosPath, JSON.stringify(customScenarios, null, 2));

      const loader = new ScenarioConfigLoader(undefined, testCustomScenariosPath);
      const config = loader.loadConfig();

      expect(config.customScenarios).toBeDefined();
      expect(config.customScenarios!.length).toBe(1);
      expect(config.customScenarios![0].name).toBe('test-custom-scenario');
    });
  });

  describe('Utility Functions', () => {
    it('should get available categories', () => {
      const categories = getAvailableCategories();
      expect(categories).toContain('basic');
      expect(categories).toContain('field-types');
      expect(categories).toContain('auth');
    });

    it('should get available tags', () => {
      const tags = getAvailableTags();
      expect(tags.length).toBeGreaterThan(0);
      expect(tags).toContain('basic');
    });

    it('should create quick test configuration', () => {
      const config = createQuickTestConfig(['basic-collection', 'blank-collection']);
      expect(config.enabledScenarios).toEqual(['basic-collection', 'blank-collection']);
      expect(config.minimumScore).toBe(0);
    });

    it('should create comprehensive test configuration', () => {
      const config = createComprehensiveTestConfig();
      expect(config.enabledCategories).toContain('basic');
      expect(config.enabledCategories).toContain('field-types');
      expect(config.enabledCategories).toContain('auth');
      expect(config.minimumScore).toBe(70);
    });

    it('should create basic test configuration', () => {
      const config = createBasicTestConfig();
      expect(config.enabledCategories).toEqual(['basic', 'field-types']);
      expect(config.minimumScore).toBe(80);
    });
  });

  describe('Scenario Coverage', () => {
    it('should include all required field types', () => {
      const requiredFieldTypes = [
        'text', 'editor', 'number', 'bool', 'email', 'url', 'date', 
        'select', 'file', 'relation', 'json', 'geoPoint', 'autodate'
      ];

      // Get all scenarios that might contain field types
      const relevantScenarios = allScenarios.filter(s => 
        s.category === 'field-types' || s.category === 'relations'
      );
      const allFields = relevantScenarios.flatMap(s => s.collectionDefinition.fields);
      const usedFieldTypes = new Set(allFields.map(f => f.type));

      requiredFieldTypes.forEach(fieldType => {
        expect(usedFieldTypes.has(fieldType)).toBe(true);
      });
    });

    it('should include auth collection scenarios', () => {
      const authScenarios = allScenarios.filter(s => s.category === 'auth');
      expect(authScenarios.length).toBeGreaterThan(0);
      expect(authScenarios.some(s => s.collectionDefinition.type === 'auth')).toBe(true);
    });

    it('should include relation scenarios', () => {
      const relationScenarios = allScenarios.filter(s => s.category === 'relations');
      expect(relationScenarios.length).toBeGreaterThan(0);
      
      const hasRelationFields = relationScenarios.some(s => 
        s.collectionDefinition.fields.some(f => f.type === 'relation')
      );
      expect(hasRelationFields).toBe(true);
    });

    it('should include update scenarios', () => {
      const updateScenarios = allScenarios.filter(s => s.category === 'updates');
      expect(updateScenarios.length).toBeGreaterThan(0);
      
      const hasUpdateOperations = updateScenarios.some(s => 
        s.collectionDefinition.updateOperations && s.collectionDefinition.updateOperations.length > 0
      );
      expect(hasUpdateOperations).toBe(true);
    });
  });
});