#!/usr/bin/env node

/**
 * CLI utility for managing E2E test scenarios
 */

import { program } from 'commander';
import { 
  getAvailableCategories, 
  getAvailableTags, 
  allScenarios,
  getFilteredScenarios,
  validateScenarioConfig,
  TestScenarioConfig
} from '../fixtures/test-scenarios.js';
import { ScenarioConfigLoader, initializeConfigFiles } from '../fixtures/scenario-config-loader.js';
import { ScenarioRunner } from '../utils/scenario-runner.js';

program
  .name('scenario-cli')
  .description('CLI for managing E2E test scenarios')
  .version('1.0.0');

// List command
program
  .command('list')
  .description('List available scenarios')
  .option('-c, --category <category>', 'Filter by category')
  .option('-t, --tag <tag>', 'Filter by tag')
  .option('--enabled-only', 'Show only enabled scenarios')
  .action((options) => {
    let scenarios = allScenarios;

    if (options.category) {
      scenarios = scenarios.filter(s => s.category === options.category);
    }

    if (options.tag) {
      scenarios = scenarios.filter(s => s.tags && s.tags.includes(options.tag));
    }

    if (options.enabledOnly) {
      scenarios = scenarios.filter(s => s.enabled !== false);
    }

    console.log(`Found ${scenarios.length} scenarios:\n`);

    scenarios.forEach((scenario, index) => {
      console.log(`${index + 1}. ${scenario.name} (${scenario.category})`);
      console.log(`   ${scenario.description}`);
      console.log(`   Tags: ${scenario.tags?.join(', ') || 'none'}`);
      console.log(`   Minimum score: ${scenario.minimumScore}`);
      console.log(`   Enabled: ${scenario.enabled !== false ? 'yes' : 'no'}`);
      if (scenario.skipReason) {
        console.log(`   Skip reason: ${scenario.skipReason}`);
      }
      console.log();
    });
  });

// Categories command
program
  .command('categories')
  .description('List available categories')
  .action(() => {
    const categories = getAvailableCategories();
    console.log('Available categories:');
    categories.forEach(category => {
      const count = allScenarios.filter(s => s.category === category).length;
      console.log(`  ${category}: ${count} scenarios`);
    });
  });

// Tags command
program
  .command('tags')
  .description('List available tags')
  .action(() => {
    const tags = getAvailableTags();
    console.log('Available tags:');
    tags.forEach(tag => {
      const count = allScenarios.filter(s => s.tags && s.tags.includes(tag)).length;
      console.log(`  ${tag}: ${count} scenarios`);
    });
  });

// Config command
program
  .command('config')
  .description('Manage scenario configuration')
  .option('--init', 'Initialize configuration files')
  .option('--validate <file>', 'Validate configuration file')
  .option('--show', 'Show current configuration')
  .action((options) => {
    if (options.init) {
      initializeConfigFiles();
      console.log('Configuration files initialized successfully!');
      return;
    }

    if (options.validate) {
      try {
        const loader = new ScenarioConfigLoader(options.validate);
        const config = loader.loadConfig();
        const validation = validateScenarioConfig(config);
        
        if (validation.valid) {
          console.log('✅ Configuration is valid');
        } else {
          console.log('❌ Configuration is invalid:');
          validation.errors.forEach(error => {
            console.log(`  - ${error}`);
          });
          process.exit(1);
        }
      } catch (error) {
        console.error('❌ Failed to load configuration:', (error as Error).message);
        process.exit(1);
      }
      return;
    }

    if (options.show) {
      try {
        const runner = new ScenarioRunner();
        runner.printConfigSummary();
      } catch (error) {
        console.error('❌ Failed to load configuration:', (error as Error).message);
        process.exit(1);
      }
      return;
    }

    console.log('Use --init, --validate <file>, or --show');
  });

// Test command
program
  .command('test')
  .description('Test scenario configuration')
  .option('-c, --config <file>', 'Configuration file path')
  .option('--custom-scenarios <file>', 'Custom scenarios file path')
  .option('--dry-run', 'Show what would be executed without running')
  .option('-v, --verbose', 'Verbose output')
  .action((options) => {
    try {
      const runner = new ScenarioRunner({
        configPath: options.config,
        customScenariosPath: options.customScenarios,
        verbose: options.verbose,
        dryRun: options.dryRun
      });

      if (options.dryRun) {
        console.log('Dry run - scenarios that would be executed:');
        const scenarios = runner.getScenarios();
        scenarios.forEach((scenario, index) => {
          console.log(`  ${index + 1}. ${scenario.name} (${scenario.category})`);
          console.log(`     ${scenario.description}`);
          console.log(`     Tags: ${scenario.tags?.join(', ') || 'none'}`);
          console.log(`     Minimum score: ${scenario.minimumScore}`);
          console.log();
        });
        console.log(`Total scenarios: ${scenarios.length}`);
      } else {
        runner.printConfigSummary();
      }
    } catch (error) {
      console.error('❌ Failed to test configuration:', (error as Error).message);
      process.exit(1);
    }
  });

// Filter command
program
  .command('filter')
  .description('Filter scenarios based on criteria')
  .option('--categories <categories>', 'Comma-separated list of categories')
  .option('--tags <tags>', 'Comma-separated list of tags')
  .option('--min-score <score>', 'Minimum score threshold', parseInt)
  .option('--enabled-only', 'Show only enabled scenarios')
  .action((options) => {
    const config: TestScenarioConfig = {};

    if (options.categories) {
      config.enabledCategories = options.categories.split(',').map((s: string) => s.trim());
    }

    if (options.tags) {
      config.tags = options.tags.split(',').map((s: string) => s.trim());
    }

    if (options.minScore) {
      config.minimumScore = options.minScore;
    }

    const scenarios = getFilteredScenarios(config);

    if (options.enabledOnly) {
      const enabledScenarios = scenarios.filter(s => s.enabled !== false);
      console.log(`Found ${enabledScenarios.length} enabled scenarios (${scenarios.length} total):\n`);
      
      enabledScenarios.forEach((scenario, index) => {
        console.log(`${index + 1}. ${scenario.name} (${scenario.category})`);
        console.log(`   ${scenario.description}`);
        console.log(`   Score: ${scenario.minimumScore}`);
        console.log();
      });
    } else {
      console.log(`Found ${scenarios.length} scenarios:\n`);
      
      scenarios.forEach((scenario, index) => {
        console.log(`${index + 1}. ${scenario.name} (${scenario.category})`);
        console.log(`   ${scenario.description}`);
        console.log(`   Score: ${scenario.minimumScore}`);
        console.log(`   Enabled: ${scenario.enabled !== false ? 'yes' : 'no'}`);
        console.log();
      });
    }
  });

// Info command
program
  .command('info <scenario-name>')
  .description('Show detailed information about a scenario')
  .action((scenarioName) => {
    const scenario = allScenarios.find(s => s.name === scenarioName);
    
    if (!scenario) {
      console.error(`❌ Scenario '${scenarioName}' not found`);
      process.exit(1);
    }

    console.log(`Scenario: ${scenario.name}`);
    console.log(`Description: ${scenario.description}`);
    console.log(`Category: ${scenario.category}`);
    console.log(`Minimum Score: ${scenario.minimumScore}`);
    console.log(`Enabled: ${scenario.enabled !== false ? 'yes' : 'no'}`);
    console.log(`Tags: ${scenario.tags?.join(', ') || 'none'}`);
    
    if (scenario.skipReason) {
      console.log(`Skip Reason: ${scenario.skipReason}`);
    }

    if (scenario.dependencies) {
      console.log(`Dependencies: ${scenario.dependencies.join(', ')}`);
    }

    console.log('\nCollection Definition:');
    console.log(`  Name: ${scenario.collectionDefinition.name}`);
    console.log(`  Type: ${scenario.collectionDefinition.type}`);
    console.log(`  Fields: ${scenario.collectionDefinition.fields.length}`);
    
    scenario.collectionDefinition.fields.forEach((field, index) => {
      console.log(`    ${index + 1}. ${field.name} (${field.type})`);
      if (field.required) console.log(`       Required: yes`);
      if (field.unique) console.log(`       Unique: yes`);
      if (field.options && Object.keys(field.options).length > 0) {
        console.log(`       Options: ${JSON.stringify(field.options)}`);
      }
    });

    if (scenario.collectionDefinition.indexes) {
      console.log(`  Indexes: ${scenario.collectionDefinition.indexes.length}`);
      scenario.collectionDefinition.indexes.forEach((index, i) => {
        console.log(`    ${i + 1}. ${index}`);
      });
    }

    if (scenario.collectionDefinition.rules) {
      console.log('  Rules:');
      Object.entries(scenario.collectionDefinition.rules).forEach(([rule, value]) => {
        console.log(`    ${rule}: ${value === null ? 'null' : value === '' ? '""' : value}`);
      });
    }

    if (scenario.collectionDefinition.updateOperations) {
      console.log(`  Update Operations: ${scenario.collectionDefinition.updateOperations.length}`);
      scenario.collectionDefinition.updateOperations.forEach((op, i) => {
        console.log(`    ${i + 1}. ${op.type}: ${op.description}`);
      });
    }

    console.log(`\nExpected Features: ${scenario.expectedFeatures.join(', ')}`);
  });

program.parse();