/**
 * CLI Response Analyzer Component Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  CLIResponseAnalyzerImpl, 
  createCLIResponseAnalyzer,
  type MigrationComparison,
  type CliResponseComparison 
} from './cli-response-analyzer.js';
import { ParsedMigration, ParsedCollection, ParsedField } from './native-migration-generator.js';

describe('CLIResponseAnalyzer', () => {
  let analyzer: CLIResponseAnalyzerImpl;

  beforeEach(() => {
    analyzer = new CLIResponseAnalyzerImpl();
  });

  describe('compareMigrations', () => {
    it('should compare identical migrations with high score', async () => {
      const migration: ParsedMigration = {
        filename: '1234567890123_test_migration.js',
        upFunction: 'migrate((db) => { /* test */ })',
        downFunction: '(db) => { /* rollback */ }',
        collections: [{
          id: 'test_id',
          name: 'test_collection',
          type: 'base',
          system: false,
          fields: [{
            id: 'field_id',
            name: 'title',
            type: 'text',
            required: true,
            unique: false,
            options: { max: 100 }
          }],
          indexes: [],
          rules: {
            listRule: '@request.auth.id != ""',
            viewRule: '@request.auth.id != ""',
            createRule: '@request.auth.id != ""',
            updateRule: '@request.auth.id != ""',
            deleteRule: '@request.auth.id != ""'
          }
        }]
      };

      const comparison = await analyzer.compareMigrations(migration, migration);

      expect(comparison.overallScore).toBeGreaterThan(90);
      expect(comparison.criticalDifferences).toHaveLength(0);
      expect(comparison.majorDifferences).toHaveLength(0);
      expect(comparison.structuralSimilarity).toBe(100);
    });

    it('should detect differences between migrations', async () => {
      const nativeMigration: ParsedMigration = {
        filename: '1234567890123_test_migration.js',
        upFunction: 'migrate((db) => { /* native */ })',
        downFunction: '(db) => { /* rollback */ }',
        collections: [{
          id: 'test_id',
          name: 'test_collection',
          type: 'base',
          system: false,
          fields: [{
            id: 'field_id',
            name: 'title',
            type: 'text',
            required: true,
            unique: false,
            options: { max: 100 }
          }],
          indexes: [],
          rules: {
            listRule: '@request.auth.id != ""'
          }
        }]
      };

      const libraryMigration: ParsedMigration = {
        filename: '1234567890124_test_migration.js',
        upFunction: 'migrate((db) => { /* library */ })',
        downFunction: '(db) => { /* rollback */ }',
        collections: [{
          id: 'test_id_2',
          name: 'test_collection',
          type: 'base',
          system: false,
          fields: [{
            id: 'field_id_2',
            name: 'title',
            type: 'editor', // Different type
            required: false, // Different required
            unique: false,
            options: { max: 200 } // Different options
          }],
          indexes: [],
          rules: {
            listRule: '@request.auth.id = ""' // Different rule
          }
        }]
      };

      const comparison = await analyzer.compareMigrations(nativeMigration, libraryMigration);

      expect(comparison.overallScore).toBeLessThan(90);
      expect(comparison.criticalDifferences.length).toBeGreaterThan(0);
      expect(comparison.majorDifferences.length).toBeGreaterThan(0);
    });

    it('should handle missing collections', async () => {
      const nativeMigration: ParsedMigration = {
        filename: '1234567890123_test_migration.js',
        upFunction: 'migrate((db) => { /* native */ })',
        downFunction: '(db) => { /* rollback */ }',
        collections: [{
          id: 'test_id',
          name: 'collection1',
          type: 'base',
          system: false,
          fields: [],
          indexes: [],
          rules: {}
        }, {
          id: 'test_id_2',
          name: 'collection2',
          type: 'base',
          system: false,
          fields: [],
          indexes: [],
          rules: {}
        }]
      };

      const libraryMigration: ParsedMigration = {
        filename: '1234567890123_test_migration.js',
        upFunction: 'migrate((db) => { /* library */ })',
        downFunction: '(db) => { /* rollback */ }',
        collections: [{
          id: 'test_id',
          name: 'collection1',
          type: 'base',
          system: false,
          fields: [],
          indexes: [],
          rules: {}
        }]
      };

      const comparison = await analyzer.compareMigrations(nativeMigration, libraryMigration);

      expect(comparison.collections).toHaveLength(2);
      expect(comparison.collections.find(c => c.name === 'collection2')?.matched).toBe(false);
    });
  });

  describe('analyzeCollection', () => {
    it('should compare identical collections with perfect score', () => {
      const collection: ParsedCollection = {
        id: 'test_id',
        name: 'test_collection',
        type: 'base',
        system: false,
        fields: [{
          id: 'field_id',
          name: 'title',
          type: 'text',
          required: true,
          unique: false,
          options: {}
        }],
        indexes: ['CREATE INDEX idx_title ON test_collection (title)'],
        rules: {
          listRule: '@request.auth.id != ""'
        }
      };

      const comparison = analyzer.analyzeCollection(collection, collection);

      expect(comparison.score).toBe(100);
      expect(comparison.matched).toBe(true);
      expect(comparison.fields).toHaveLength(1);
      expect(comparison.fields[0].score).toBe(100);
    });

    it('should detect field differences', () => {
      const nativeCollection: ParsedCollection = {
        id: 'test_id',
        name: 'test_collection',
        type: 'base',
        system: false,
        fields: [{
          id: 'field_id',
          name: 'title',
          type: 'text',
          required: true,
          unique: false,
          options: { max: 100 }
        }],
        indexes: [],
        rules: {}
      };

      const libraryCollection: ParsedCollection = {
        id: 'test_id',
        name: 'test_collection',
        type: 'base',
        system: false,
        fields: [{
          id: 'field_id',
          name: 'title',
          type: 'editor', // Different type
          required: false, // Different required
          unique: true, // Different unique
          options: { max: 200 } // Different options
        }],
        indexes: [],
        rules: {}
      };

      const comparison = analyzer.analyzeCollection(nativeCollection, libraryCollection);

      expect(comparison.fields).toHaveLength(1);
      expect(comparison.fields[0].typeMatch).toBe(false);
      expect(comparison.fields[0].requiredMatch).toBe(false);
      expect(comparison.fields[0].uniqueMatch).toBe(false);
      expect(comparison.fields[0].optionsMatch).toBe(false);
      expect(comparison.fields[0].score).toBe(10); // Relation match (both undefined) gives 10 points
      expect(comparison.fields[0].differences.length).toBeGreaterThan(0);
    });

    it('should handle missing fields', () => {
      const nativeCollection: ParsedCollection = {
        id: 'test_id',
        name: 'test_collection',
        type: 'base',
        system: false,
        fields: [{
          id: 'field_id',
          name: 'title',
          type: 'text',
          required: true,
          unique: false,
          options: {}
        }, {
          id: 'field_id_2',
          name: 'description',
          type: 'text',
          required: false,
          unique: false,
          options: {}
        }],
        indexes: [],
        rules: {}
      };

      const libraryCollection: ParsedCollection = {
        id: 'test_id',
        name: 'test_collection',
        type: 'base',
        system: false,
        fields: [{
          id: 'field_id',
          name: 'title',
          type: 'text',
          required: true,
          unique: false,
          options: {}
        }],
        indexes: [],
        rules: {}
      };

      const comparison = analyzer.analyzeCollection(nativeCollection, libraryCollection);

      expect(comparison.fields).toHaveLength(2);
      expect(comparison.fields.find(f => f.fieldName === 'description')?.libraryField).toBeUndefined();
      expect(comparison.fields.find(f => f.fieldName === 'description')?.differences[0].severity).toBe('critical');
    });
  });

  describe('analyzeField', () => {
    it('should compare identical fields with perfect score', () => {
      const field: ParsedField = {
        id: 'field_id',
        name: 'title',
        type: 'text',
        required: true,
        unique: false,
        options: { max: 100 }
      };

      const comparison = analyzer.analyzeField(field, field);

      expect(comparison.score).toBe(100);
      expect(comparison.typeMatch).toBe(true);
      expect(comparison.requiredMatch).toBe(true);
      expect(comparison.uniqueMatch).toBe(true);
      expect(comparison.optionsMatch).toBe(true);
      expect(comparison.differences).toHaveLength(0);
    });

    it('should detect all field differences', () => {
      const nativeField: ParsedField = {
        id: 'field_id',
        name: 'title',
        type: 'text',
        required: true,
        unique: false,
        options: { max: 100 }
      };

      const libraryField: ParsedField = {
        id: 'field_id',
        name: 'title',
        type: 'editor',
        required: false,
        unique: true,
        options: { max: 200 }
      };

      const comparison = analyzer.analyzeField(nativeField, libraryField);

      expect(comparison.score).toBe(10); // Relation match (both undefined) gives 10 points
      expect(comparison.typeMatch).toBe(false);
      expect(comparison.requiredMatch).toBe(false);
      expect(comparison.uniqueMatch).toBe(false);
      expect(comparison.optionsMatch).toBe(false);
      expect(comparison.differences).toHaveLength(4);
      
      // Check severity levels
      expect(comparison.differences.find(d => d.path.includes('type'))?.severity).toBe('critical');
      expect(comparison.differences.find(d => d.path.includes('required'))?.severity).toBe('major');
      expect(comparison.differences.find(d => d.path.includes('unique'))?.severity).toBe('major');
      expect(comparison.differences.find(d => d.path.includes('options'))?.severity).toBe('minor');
    });
  });

  describe('compareCliResponses', () => {
    it('should compare successful CLI responses', () => {
      const nativeResponse = 'Migration generated successfully: 1234567890123_test.js';
      const libraryResponse = 'Migration file created: 1234567890124_test.js';

      const comparison = analyzer.compareCliResponses(nativeResponse, libraryResponse);

      expect(comparison.exitCodeMatch).toBe(true);
      expect(comparison.structuralMatch).toBe(true);
      expect(comparison.score).toBeGreaterThan(50);
    });

    it('should detect CLI response differences', () => {
      const nativeResponse = 'Migration generated successfully';
      const libraryResponse = 'Error: Failed to generate migration';

      const comparison = analyzer.compareCliResponses(nativeResponse, libraryResponse);

      expect(comparison.outputSimilarity).toBeLessThan(50);
      expect(comparison.differences.length).toBeGreaterThan(0);
    });

    it('should handle empty responses', () => {
      const comparison = analyzer.compareCliResponses('', '');

      expect(comparison.exitCodeMatch).toBe(true);
      expect(comparison.outputSimilarity).toBe(100);
      expect(comparison.score).toBeGreaterThan(0);
    });
  });

  describe('calculateCompatibilityScore', () => {
    it('should return the overall score from migration comparison', async () => {
      const migration: ParsedMigration = {
        filename: '1234567890123_test.js',
        upFunction: 'migrate((db) => {})',
        downFunction: '(db) => {}',
        collections: []
      };

      const comparison = await analyzer.compareMigrations(migration, migration);
      const score = analyzer.calculateCompatibilityScore(comparison);

      expect(score).toBe(comparison.overallScore);
    });
  });

  describe('factory function', () => {
    it('should create analyzer instance', () => {
      const analyzer = createCLIResponseAnalyzer();
      expect(analyzer).toBeDefined();
      expect(typeof analyzer.compareMigrations).toBe('function');
      expect(typeof analyzer.analyzeCollection).toBe('function');
      expect(typeof analyzer.analyzeField).toBe('function');
      expect(typeof analyzer.calculateCompatibilityScore).toBe('function');
      expect(typeof analyzer.compareCliResponses).toBe('function');
    });
  });

  describe('edge cases', () => {
    it('should handle empty migrations', async () => {
      const emptyMigration: ParsedMigration = {
        filename: 'empty.js',
        upFunction: '',
        downFunction: '',
        collections: []
      };

      const comparison = await analyzer.compareMigrations(emptyMigration, emptyMigration);

      expect(comparison.overallScore).toBeGreaterThan(0);
      expect(comparison.collections).toHaveLength(0);
    });

    it('should handle collections with no fields', () => {
      const collection: ParsedCollection = {
        id: 'test_id',
        name: 'empty_collection',
        type: 'base',
        system: false,
        fields: [],
        indexes: [],
        rules: {}
      };

      const comparison = analyzer.analyzeCollection(collection, collection);

      expect(comparison.score).toBeGreaterThan(0);
      expect(comparison.fields).toHaveLength(0);
    });

    it('should handle null and undefined values in rules', () => {
      const nativeCollection: ParsedCollection = {
        id: 'test_id',
        name: 'test_collection',
        type: 'base',
        system: false,
        fields: [],
        indexes: [],
        rules: {
          listRule: null,
          viewRule: '@request.auth.id != ""'
        }
      };

      const libraryCollection: ParsedCollection = {
        id: 'test_id',
        name: 'test_collection',
        type: 'base',
        system: false,
        fields: [],
        indexes: [],
        rules: {
          listRule: null,
          viewRule: '@request.auth.id != ""'
        }
      };

      const comparison = analyzer.analyzeCollection(nativeCollection, libraryCollection);

      expect(comparison.rules.find(r => r.ruleName === 'listRule')?.matches).toBe(true);
      expect(comparison.rules.find(r => r.ruleName === 'viewRule')?.matches).toBe(true);
    });
  });
});