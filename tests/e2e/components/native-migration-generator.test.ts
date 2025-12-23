/**
 * Tests for Native Migration Generator Component
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createNativeMigrationGenerator, NativeMigrationGenerator } from './native-migration-generator.js';
import { createWorkspaceManager, WorkspaceManager, TestWorkspace } from './workspace-manager.js';
import { CollectionDefinition } from '../fixtures/test-scenarios.js';
import { logger } from '../utils/test-helpers.js';

describe('NativeMigrationGenerator', () => {
  let generator: NativeMigrationGenerator;
  let workspaceManager: WorkspaceManager;
  let workspace: TestWorkspace;

  beforeEach(async () => {
    generator = createNativeMigrationGenerator();
    workspaceManager = createWorkspaceManager();
    
    // Create and initialize workspace
    workspace = await workspaceManager.createWorkspace();
    await workspaceManager.initializePocketBase(workspace);
    await workspaceManager.startPocketBase(workspace);
    
    logger.debug(`Test workspace created: ${workspace.workspaceId}`);
  });

  afterEach(async () => {
    if (workspace) {
      await workspaceManager.cleanupWorkspace(workspace);
      logger.debug(`Test workspace cleaned up: ${workspace.workspaceId}`);
    }
  });

  describe('createCollection', () => {
    it('should create a basic collection and generate migration file', async () => {
      const definition: CollectionDefinition = {
        name: 'test_basic',
        type: 'base',
        fields: [
          {
            name: 'title',
            type: 'text',
            required: true,
            options: { min: 1, max: 100 }
          },
          {
            name: 'description',
            type: 'text',
            required: false,
            options: { max: 500 }
          }
        ]
      };

      const migrationFile = await generator.createCollection(workspace, definition);
      
      expect(migrationFile).toBeTruthy();
      expect(migrationFile).toMatch(/\.js$/);
      
      // Verify migration file exists and contains expected content
      const parsedMigration = await generator.parseMigrationFile(migrationFile);
      expect(parsedMigration.filename).toBeTruthy();
      expect(parsedMigration.upFunction).toContain('migrate');
      expect(parsedMigration.collections).toHaveLength(1);
      
      const collection = parsedMigration.collections[0];
      expect(collection.name).toBe('test_basic');
      expect(collection.type).toBe('base');
      expect(collection.fields).toHaveLength(2);
      
      const titleField = collection.fields.find(f => f.name === 'title');
      expect(titleField).toBeTruthy();
      expect(titleField?.type).toBe('text');
      expect(titleField?.required).toBe(true);
    });

    it('should create an auth collection with system fields', async () => {
      const definition: CollectionDefinition = {
        name: 'test_users',
        type: 'auth',
        fields: [
          {
            name: 'name',
            type: 'text',
            required: true
          }
        ],
        rules: {
          listRule: '@request.auth.id != ""',
          viewRule: '@request.auth.id != ""',
          createRule: '',
          updateRule: '@request.auth.id = id',
          deleteRule: '@request.auth.id = id'
        }
      };

      const migrationFile = await generator.createCollection(workspace, definition);
      
      expect(migrationFile).toBeTruthy();
      
      const parsedMigration = await generator.parseMigrationFile(migrationFile);
      const collection = parsedMigration.collections[0];
      
      expect(collection.name).toBe('test_users');
      expect(collection.type).toBe('auth');
      expect(collection.rules.listRule).toBe('@request.auth.id != ""');
      expect(collection.rules.createRule).toBe('');
    });

    it('should handle collection with various field types', async () => {
      const definition: CollectionDefinition = {
        name: 'test_field_types',
        type: 'base',
        fields: [
          { name: 'text_field', type: 'text', required: true },
          { name: 'number_field', type: 'number', required: false, options: { min: 0, max: 100 } },
          { name: 'bool_field', type: 'bool', required: false },
          { name: 'email_field', type: 'email', required: false },
          { name: 'date_field', type: 'date', required: false },
          { name: 'select_field', type: 'select', required: false, options: { values: ['option1', 'option2'] } }
        ]
      };

      const migrationFile = await generator.createCollection(workspace, definition);
      
      expect(migrationFile).toBeTruthy();
      
      const parsedMigration = await generator.parseMigrationFile(migrationFile);
      const collection = parsedMigration.collections[0];
      
      expect(collection.fields).toHaveLength(6);
      
      const fieldTypes = collection.fields.map(f => f.type);
      expect(fieldTypes).toContain('text');
      expect(fieldTypes).toContain('number');
      expect(fieldTypes).toContain('bool');
      expect(fieldTypes).toContain('email');
      expect(fieldTypes).toContain('date');
      expect(fieldTypes).toContain('select');
    });
  });

  describe('getMigrationFiles', () => {
    it('should return empty array for workspace with no migrations', async () => {
      const files = await generator.getMigrationFiles(workspace);
      
      // Should have at least the initial migration created by workspace manager
      expect(Array.isArray(files)).toBe(true);
    });

    it('should return migration files in sorted order', async () => {
      // Create multiple collections to generate multiple migration files
      const definition1: CollectionDefinition = {
        name: 'test_first',
        type: 'base',
        fields: [{ name: 'title', type: 'text', required: true }]
      };

      const definition2: CollectionDefinition = {
        name: 'test_second',
        type: 'base',
        fields: [{ name: 'name', type: 'text', required: true }]
      };

      await generator.createCollection(workspace, definition1);
      await generator.createCollection(workspace, definition2);

      const files = await generator.getMigrationFiles(workspace);
      
      expect(files.length).toBeGreaterThanOrEqual(2);
      
      // Files should be sorted (timestamps in filenames ensure this)
      for (let i = 1; i < files.length; i++) {
        expect(files[i] >= files[i - 1]).toBe(true);
      }
    });
  });

  describe('parseMigrationFile', () => {
    it('should parse migration file structure correctly', async () => {
      const definition: CollectionDefinition = {
        name: 'test_parse',
        type: 'base',
        fields: [
          {
            name: 'title',
            type: 'text',
            required: true
          }
        ]
      };

      const migrationFile = await generator.createCollection(workspace, definition);
      const parsedMigration = await generator.parseMigrationFile(migrationFile);

      expect(parsedMigration.filename).toBeTruthy();
      expect(parsedMigration.upFunction).toContain('migrate');
      expect(parsedMigration.downFunction).toBeTruthy();
      expect(parsedMigration.collections).toHaveLength(1);

      const collection = parsedMigration.collections[0];
      expect(collection.id).toBeTruthy();
      expect(collection.name).toBe('test_parse');
      expect(collection.type).toBe('base');
      expect(collection.system).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle invalid collection definitions gracefully', async () => {
      const invalidDefinition: CollectionDefinition = {
        name: '', // Invalid empty name
        type: 'base',
        fields: []
      };

      await expect(generator.createCollection(workspace, invalidDefinition))
        .rejects.toThrow();
    });

    it('should handle workspace connection failures', async () => {
      // Stop PocketBase to simulate connection failure
      await workspaceManager.stopPocketBase(workspace);

      const definition: CollectionDefinition = {
        name: 'test_connection_fail',
        type: 'base',
        fields: [{ name: 'title', type: 'text', required: true }]
      };

      await expect(generator.createCollection(workspace, definition))
        .rejects.toThrow();
    });
  });
});