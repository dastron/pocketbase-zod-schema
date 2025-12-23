/**
 * Test suite for WorkspaceManager component
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { createWorkspaceManager, WorkspaceManager, TestWorkspace } from './workspace-manager.js';
import { sleep } from '../utils/test-helpers.js';

describe('WorkspaceManager', () => {
  let workspaceManager: WorkspaceManager;
  let createdWorkspaces: TestWorkspace[] = [];

  beforeEach(() => {
    workspaceManager = createWorkspaceManager();
    createdWorkspaces = [];
  });

  afterEach(async () => {
    // Clean up all created workspaces
    for (const workspace of createdWorkspaces) {
      try {
        await workspaceManager.cleanupWorkspace(workspace);
      } catch (error) {
        console.warn(`Failed to cleanup workspace ${workspace.workspaceId}:`, error);
      }
    }
    createdWorkspaces = [];
  });

  describe('createWorkspace', () => {
    it('should create a unique workspace with all required properties', async () => {
      const workspace = await workspaceManager.createWorkspace();
      createdWorkspaces.push(workspace);

      expect(workspace.workspaceId).toBeDefined();
      expect(workspace.workspaceId).toMatch(/^test_\d+_[a-f0-9]{8}$/);
      expect(workspace.workspaceDir).toBeDefined();
      expect(workspace.pocketbasePort).toBeGreaterThan(0);
      expect(workspace.pocketbasePath).toBeDefined();
      expect(workspace.migrationDir).toBeDefined();
      expect(workspace.dataDir).toBeDefined();

      // Verify directory structure was created
      expect(existsSync(workspace.workspaceDir)).toBe(true);
      expect(existsSync(workspace.migrationDir)).toBe(true);
      expect(existsSync(workspace.dataDir)).toBe(true);
    });

    it('should create workspaces with unique IDs and ports', async () => {
      const workspace1 = await workspaceManager.createWorkspace();
      const workspace2 = await workspaceManager.createWorkspace();
      createdWorkspaces.push(workspace1, workspace2);

      expect(workspace1.workspaceId).not.toBe(workspace2.workspaceId);
      expect(workspace1.pocketbasePort).not.toBe(workspace2.pocketbasePort);
      expect(workspace1.workspaceDir).not.toBe(workspace2.workspaceDir);
    });

    it('should set up correct directory paths', async () => {
      const workspace = await workspaceManager.createWorkspace();
      createdWorkspaces.push(workspace);

      expect(workspace.migrationDir).toBe(join(workspace.workspaceDir, 'pb_migrations'));
      expect(workspace.dataDir).toBe(join(workspace.workspaceDir, 'pb_data'));
    });
  });

  describe('initializePocketBase', () => {
    it('should initialize PocketBase with required files', async () => {
      const workspace = await workspaceManager.createWorkspace();
      createdWorkspaces.push(workspace);

      await workspaceManager.initializePocketBase(workspace);

      // Check that initial migration was created
      const migrationFiles = require('fs').readdirSync(workspace.migrationDir);
      expect(migrationFiles.length).toBeGreaterThan(0);
      expect(migrationFiles.some((file: string) => file.includes('initial_setup.js'))).toBe(true);

      // Check that types file was created
      const typesFile = join(workspace.dataDir, 'types.d.ts');
      expect(existsSync(typesFile)).toBe(true);
    });

    it('should not fail when called multiple times', async () => {
      const workspace = await workspaceManager.createWorkspace();
      createdWorkspaces.push(workspace);

      await workspaceManager.initializePocketBase(workspace);
      await expect(workspaceManager.initializePocketBase(workspace)).resolves.not.toThrow();
    });
  });

  describe('PocketBase lifecycle', () => {
    it('should start and stop PocketBase successfully', async () => {
      const workspace = await workspaceManager.createWorkspace();
      createdWorkspaces.push(workspace);

      await workspaceManager.initializePocketBase(workspace);
      
      // Start PocketBase
      await workspaceManager.startPocketBase(workspace);

      // Verify PocketBase is running by checking health endpoint
      const response = await fetch(`http://127.0.0.1:${workspace.pocketbasePort}/api/health`);
      expect(response.ok).toBe(true);

      // Stop PocketBase
      await workspaceManager.stopPocketBase(workspace);

      // Wait a bit for the process to fully stop
      await sleep(1000);

      // Verify PocketBase is no longer running
      await expect(
        fetch(`http://127.0.0.1:${workspace.pocketbasePort}/api/health`)
      ).rejects.toThrow();
    }, 60000); // Increase timeout for PocketBase startup

    it('should handle multiple start calls gracefully', async () => {
      const workspace = await workspaceManager.createWorkspace();
      createdWorkspaces.push(workspace);

      await workspaceManager.initializePocketBase(workspace);
      
      await workspaceManager.startPocketBase(workspace);
      await expect(workspaceManager.startPocketBase(workspace)).resolves.not.toThrow();
      
      await workspaceManager.stopPocketBase(workspace);
    }, 60000);

    it('should handle stop calls when not running', async () => {
      const workspace = await workspaceManager.createWorkspace();
      createdWorkspaces.push(workspace);

      await expect(workspaceManager.stopPocketBase(workspace)).resolves.not.toThrow();
    });
  });

  describe('cleanupWorkspace', () => {
    it('should clean up workspace directory and resources', async () => {
      const workspace = await workspaceManager.createWorkspace();
      
      await workspaceManager.initializePocketBase(workspace);
      await workspaceManager.startPocketBase(workspace);
      
      // Verify workspace exists
      expect(existsSync(workspace.workspaceDir)).toBe(true);
      
      await workspaceManager.cleanupWorkspace(workspace);
      
      // Wait a bit for cleanup to complete
      await sleep(1000);
      
      // Verify workspace directory was removed
      expect(existsSync(workspace.workspaceDir)).toBe(false);
      
      // Verify PocketBase is no longer running
      await expect(
        fetch(`http://127.0.0.1:${workspace.pocketbasePort}/api/health`)
      ).rejects.toThrow();
    }, 60000);

    it('should handle cleanup when PocketBase is not running', async () => {
      const workspace = await workspaceManager.createWorkspace();
      
      await workspaceManager.initializePocketBase(workspace);
      
      await expect(workspaceManager.cleanupWorkspace(workspace)).resolves.not.toThrow();
      
      // Verify workspace directory was removed
      expect(existsSync(workspace.workspaceDir)).toBe(false);
    });
  });

  describe('concurrent workspace isolation', () => {
    it('should handle multiple concurrent workspaces', async () => {
      const workspace1 = await workspaceManager.createWorkspace();
      const workspace2 = await workspaceManager.createWorkspace();
      createdWorkspaces.push(workspace1, workspace2);

      await Promise.all([
        workspaceManager.initializePocketBase(workspace1),
        workspaceManager.initializePocketBase(workspace2),
      ]);

      await Promise.all([
        workspaceManager.startPocketBase(workspace1),
        workspaceManager.startPocketBase(workspace2),
      ]);

      // Verify both instances are running on different ports
      const [response1, response2] = await Promise.all([
        fetch(`http://127.0.0.1:${workspace1.pocketbasePort}/api/health`),
        fetch(`http://127.0.0.1:${workspace2.pocketbasePort}/api/health`),
      ]);

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);
      expect(workspace1.pocketbasePort).not.toBe(workspace2.pocketbasePort);

      // Clean up
      await Promise.all([
        workspaceManager.stopPocketBase(workspace1),
        workspaceManager.stopPocketBase(workspace2),
      ]);
    }, 90000); // Longer timeout for concurrent operations
  });
});