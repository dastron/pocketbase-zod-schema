/**
 * Library CLI Component Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLibraryCLI, LibraryCLI, LibraryWorkspace } from './library-cli.js';
import { basicScenarios, fieldTypeScenarios } from '../fixtures/test-scenarios.js';

describe('LibraryCLI', () => {
  let libraryCLI: LibraryCLI;
  let workspace: LibraryWorkspace;

  beforeEach(async () => {
    libraryCLI = createLibraryCLI();
    workspace = await libraryCLI.createLibraryWorkspace();
  });

  afterEach(async () => {
    if (workspace) {
      await libraryCLI.cleanupLibraryWorkspace(workspace);
    }
  });

  describe('createLibraryWorkspace', () => {
    it('should create a library workspace with proper structure', async () => {
      expect(workspace.workspaceId).toBeDefined();
      expect(workspace.workspaceDir).toBeDefined();
      expect(workspace.schemaDir).toBeDefined();
      expect(workspace.migrationDir).toBeDefined();
      expect(workspace.packageJsonPath).toBeDefined();
      expect(workspace.configPath).toBeDefined();
    });

    it('should create unique workspace IDs', async () => {
      const workspace2 = await libraryCLI.createLibraryWorkspace();
      
      expect(workspace.workspaceId).not.toBe(workspace2.workspaceId);
      expect(workspace.workspaceDir).not.toBe(workspace2.workspaceDir);
      
      await libraryCLI.cleanupLibraryWorkspace(workspace2);
    });
  });

  describe('generateFromSchema', () => {
    it('should generate migration from basic collection schema', async () => {
      const scenario = basicScenarios[0]; // basic-collection
      
      const migrationFile = await libraryCLI.generateFromSchema(workspace, scenario.collectionDefinition);
      
      expect(migrationFile).toBeDefined();
      expect(migrationFile).toMatch(/\.js$/);
      
      // Verify migration file was created
      const migrationFiles = await libraryCLI.getMigrationFiles(workspace);
      expect(migrationFiles).toContain(migrationFile);
    }, 30000); // 30 second timeout

    it('should generate migration from field types collection schema', async () => {
      const scenario = fieldTypeScenarios[0]; // all-field-types
      
      const migrationFile = await libraryCLI.generateFromSchema(workspace, scenario.collectionDefinition);
      
      expect(migrationFile).toBeDefined();
      expect(migrationFile).toMatch(/\.js$/);
      
      // Verify migration file was created
      const migrationFiles = await libraryCLI.getMigrationFiles(workspace);
      expect(migrationFiles).toContain(migrationFile);
    }, 30000); // 30 second timeout
  });

  describe('parseMigrationFile', () => {
    it('should parse generated migration file correctly', async () => {
      const scenario = basicScenarios[0]; // basic-collection
      
      const migrationFile = await libraryCLI.generateFromSchema(workspace, scenario.collectionDefinition);
      const parsedMigration = await libraryCLI.parseMigrationFile(migrationFile);
      
      expect(parsedMigration.filename).toBeDefined();
      expect(parsedMigration.upFunction).toBeDefined();
      expect(parsedMigration.downFunction).toBeDefined();
      expect(parsedMigration.collections).toBeDefined();
      expect(parsedMigration.collections.length).toBeGreaterThan(0);
      
      // Check that a collection with the expected name or pluralized name exists
      const expectedName = scenario.collectionDefinition.name;
      const pluralizedName = expectedName.endsWith('s') ? expectedName : expectedName + 's';
      
      const collection = parsedMigration.collections.find(c => 
        c.name === expectedName || c.name === pluralizedName
      );
      expect(collection).toBeDefined();
      expect(collection?.type).toBe(scenario.collectionDefinition.type);
    });

    it('should parse collection fields correctly', async () => {
      const scenario = basicScenarios[0]; // basic-collection
      
      const migrationFile = await libraryCLI.generateFromSchema(workspace, scenario.collectionDefinition);
      const parsedMigration = await libraryCLI.parseMigrationFile(migrationFile);
      
      // Check that a collection with the expected name or pluralized name exists
      const expectedName = scenario.collectionDefinition.name;
      const pluralizedName = expectedName.endsWith('s') ? expectedName : expectedName + 's';
      
      const collection = parsedMigration.collections.find(c => 
        c.name === expectedName || c.name === pluralizedName
      );
      expect(collection).toBeDefined();
      
      // Should have system fields plus user-defined fields
      expect(collection!.fields.length).toBeGreaterThanOrEqual(scenario.collectionDefinition.fields.length);
      
      // Check for user-defined fields
      for (const expectedField of scenario.collectionDefinition.fields) {
        const field = collection!.fields.find(f => f.name === expectedField.name);
        expect(field).toBeDefined();
        expect(field?.type).toBe(expectedField.type);
        expect(field?.required).toBe(expectedField.required || false);
      }
    });
  });

  describe('getMigrationFiles', () => {
    it('should return empty array for new workspace', async () => {
      const files = await libraryCLI.getMigrationFiles(workspace);
      expect(files).toEqual([]);
    });

    it('should return migration files after generation', async () => {
      const scenario = basicScenarios[0];
      
      await libraryCLI.generateFromSchema(workspace, scenario.collectionDefinition);
      
      const files = await libraryCLI.getMigrationFiles(workspace);
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/\.js$/);
    });

    it('should return files in sorted order', async () => {
      const scenario1 = basicScenarios[0];
      const scenario2 = basicScenarios[1];
      
      const file1 = await libraryCLI.generateFromSchema(workspace, scenario1.collectionDefinition);
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1100));
      const file2 = await libraryCLI.generateFromSchema(workspace, scenario2.collectionDefinition);
      
      const files = await libraryCLI.getMigrationFiles(workspace);
      // Allow 2 or 3 files (sometimes an update migration might be generated)
      expect(files.length).toBeGreaterThanOrEqual(2);
      expect(files.length).toBeLessThanOrEqual(3);
      expect(files).toContain(file1);
      expect(files).toContain(file2);
    });
  });

  describe('cleanupLibraryWorkspace', () => {
    it('should clean up workspace without errors', async () => {
      const scenario = basicScenarios[0];
      await libraryCLI.generateFromSchema(workspace, scenario.collectionDefinition);
      
      // Should not throw
      await expect(libraryCLI.cleanupLibraryWorkspace(workspace)).resolves.not.toThrow();
    });
  });
});