/**
 * Test Workspace Manager Component
 * 
 * Creates and manages isolated PocketBase instances for testing with unique workspace
 * directories, port allocation, PocketBase initialization, and automatic cleanup.
 */

import { mkdir, rm, writeFile, readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { spawn, ChildProcess, execSync } from 'child_process';
import { createPBDownloader, PBDownloader } from './pb-downloader.js';
import { 
  generateTestId, 
  createTempDir, 
  cleanupTempDir, 
  isPortAvailable, 
  waitFor, 
  sleep,
  env, 
  logger 
} from '../utils/test-helpers.js';

export interface TestWorkspace {
  workspaceId: string;
  workspaceDir: string;
  pocketbasePort: number;
  pocketbasePath: string;
  migrationDir: string;
  dataDir: string;
}

export interface WorkspaceManager {
  createWorkspace(): Promise<TestWorkspace>;
  initializePocketBase(workspace: TestWorkspace): Promise<void>;
  startPocketBase(workspace: TestWorkspace): Promise<void>;
  stopPocketBase(workspace: TestWorkspace): Promise<void>;
  cleanupWorkspace(workspace: TestWorkspace): Promise<void>;
}

export class WorkspaceManagerImpl implements WorkspaceManager {
  private readonly pbDownloader: PBDownloader;
  private readonly activeWorkspaces = new Map<string, ChildProcess>();
  private readonly allocatedPorts = new Set<number>();

  constructor(pbDownloader?: PBDownloader) {
    this.pbDownloader = pbDownloader || createPBDownloader();
  }

  /**
   * Create a new isolated test workspace
   */
  async createWorkspace(): Promise<TestWorkspace> {
    const workspaceId = generateTestId();
    const workspaceDir = await createTempDir(`pb-workspace-${workspaceId}-`);
    
    // Allocate a unique port for this workspace
    const portRange = env.getPortRange();
    const pocketbasePort = await this.allocatePort(portRange.start, portRange.end);
    
    // Download PocketBase executable if needed
    const pocketbasePath = await this.pbDownloader.downloadPocketBase();
    
    // Set up workspace directory structure
    const migrationDir = join(workspaceDir, 'pb_migrations');
    const dataDir = join(workspaceDir, 'pb_data');
    
    // Ensure directories are clean (remove any existing files)
    await rm(migrationDir, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
    
    await mkdir(migrationDir, { recursive: true });
    await mkdir(dataDir, { recursive: true });
    
    // Verify migration directory is empty after creation
    const filesAfterClean = await readdir(migrationDir).catch(() => []);
    if (filesAfterClean.length > 0) {
      logger.warn(`Migration directory not empty after cleanup for workspace ${workspaceId}: ${filesAfterClean.join(', ')}`);
    }
    
    const workspace: TestWorkspace = {
      workspaceId,
      workspaceDir,
      pocketbasePort,
      pocketbasePath,
      migrationDir,
      dataDir,
    };
    
    logger.debug(`Created workspace ${workspaceId} at ${workspaceDir} on port ${pocketbasePort}`);
    
    return workspace;
  }

  /**
   * Initialize PocketBase with a clean database for the workspace
   */
  async initializePocketBase(workspace: TestWorkspace): Promise<void> {
    logger.debug(`Initializing PocketBase for workspace ${workspace.workspaceId}`);
    
    try {
      // Ensure data directory is completely clean (remove any existing database files)
      const dataDbFile = join(workspace.dataDir, 'data.db');
      const dataDbWalFile = join(workspace.dataDir, 'data.db-wal');
      const dataDbShmFile = join(workspace.dataDir, 'data.db-shm');
      
      await rm(dataDbFile, { force: true }).catch(() => {});
      await rm(dataDbWalFile, { force: true }).catch(() => {});
      await rm(dataDbShmFile, { force: true }).catch(() => {});
      
      // Create initial migration to set up the database structure
      await this.createInitialMigration(workspace);
      
      // Create PocketBase configuration
      await this.createPocketBaseConfig(workspace);
      
      // Create superuser BEFORE starting PocketBase to prevent browser popup
      await this.createSuperuser(workspace);
      
      // After superuser creation, PocketBase may have created a database file
      // Clean it up to ensure we start with a fresh database that only has our initial migration
      await rm(dataDbFile, { force: true }).catch(() => {});
      await rm(dataDbWalFile, { force: true }).catch(() => {});
      await rm(dataDbShmFile, { force: true }).catch(() => {});
      
      logger.debug(`PocketBase initialized for workspace ${workspace.workspaceId}`);
    } catch (error) {
      logger.error(`Failed to initialize PocketBase for workspace ${workspace.workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Create a superuser admin for the workspace using CLI command
   */
  async createSuperuser(workspace: TestWorkspace): Promise<void> {
    logger.info(`Creating superuser for workspace ${workspace.workspaceId} using CLI command`);
    
    try {
      // Use PocketBase CLI command to create superuser
      const command = `"${workspace.pocketbasePath}" superuser create test@example.com testpassword123 --dir "${workspace.workspaceDir}"`;
      
      logger.debug(`Executing command: ${command}`);
      
      const result = execSync(command, {
        cwd: workspace.workspaceDir,
        stdio: 'pipe',
        timeout: 10000,
        encoding: 'utf8'
      });
      
      logger.info(`Superuser created successfully for workspace ${workspace.workspaceId}`);
      logger.debug(`Command output: ${result}`);
      
    } catch (error: any) {
      // Check if the error is because superuser already exists
      if (error.stderr && error.stderr.includes('already exists')) {
        logger.debug(`Superuser already exists for workspace ${workspace.workspaceId}`);
        return;
      }
      
      logger.error(`Error creating superuser for workspace ${workspace.workspaceId}:`, error);
      throw new Error(`Failed to create superuser: ${error.message}`);
    }
  }

  /**
   * Start PocketBase server for the workspace
   */
  async startPocketBase(workspace: TestWorkspace): Promise<void> {
    if (this.activeWorkspaces.has(workspace.workspaceId)) {
      logger.debug(`PocketBase already running for workspace ${workspace.workspaceId}`);
      return;
    }

      logger.debug(`Starting PocketBase for workspace ${workspace.workspaceId} on port ${workspace.pocketbasePort}`);
      
      // Debug: List migration files before starting PocketBase
      const migrationFilesBeforeStart = await readdir(workspace.migrationDir).catch(() => []);
      if (migrationFilesBeforeStart.length > 0) {
        logger.warn(`Migration files found before PocketBase start for workspace ${workspace.workspaceId}: ${migrationFilesBeforeStart.join(', ')}`);
        // Remove any migration files that aren't our initial setup
        for (const file of migrationFilesBeforeStart) {
          if (file.endsWith('.js') && !file.includes('initial_setup')) {
            logger.warn(`Removing unexpected migration file: ${file}`);
            await rm(join(workspace.migrationDir, file), { force: true }).catch(() => {});
          }
        }
      }

      let startupError: Error | null = null;

    try {
      const process = spawn(workspace.pocketbasePath, [
        'serve',
        '--dir', workspace.workspaceDir,
        '--http', `127.0.0.1:${workspace.pocketbasePort}`,
        // Note: --dev flag removed as it may cause issues with migration handling
        // PocketBase will automatically apply migrations on startup
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: workspace.workspaceDir,
      });

      // Store the process for later cleanup
      this.activeWorkspaces.set(workspace.workspaceId, process);

      // Capture output for debugging
      let stdout = '';
      let stderr = '';
      
      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Set up process event handlers
      process.on('error', (error) => {
        logger.error(`PocketBase process error for workspace ${workspace.workspaceId}:`, error);
        startupError = error;
      });

      process.on('exit', (code, signal) => {
        logger.debug(`PocketBase process exited for workspace ${workspace.workspaceId} with code ${code}, signal ${signal}`);
        if (code !== 0 && code !== null) {
          startupError = new Error(`PocketBase exited with code ${code}. Stdout: ${stdout}, Stderr: ${stderr}`);
        } else if (signal) {
          startupError = new Error(`PocketBase killed with signal ${signal}. Stdout: ${stdout}, Stderr: ${stderr}`);
        } else {
          startupError = new Error(`PocketBase exited unexpectedly with code ${code}. Stdout: ${stdout}, Stderr: ${stderr}`);
        }
        this.activeWorkspaces.delete(workspace.workspaceId);
      });

      // Wait for PocketBase to be ready
      await waitFor(
        async () => {
          if (startupError) {
            throw startupError;
          }
          try {
            const response = await fetch(`http://127.0.0.1:${workspace.pocketbasePort}/api/health`);
            if (!response.ok) {
              return false;
            }
            // Give PocketBase a moment to finish applying migrations
            await sleep(1000);
            return true;
          } catch {
            return false;
          }
        },
        {
          timeout: env.getStartupTimeout(),
          interval: 500,
          timeoutMessage: `PocketBase failed to start within timeout for workspace ${workspace.workspaceId}. Stdout: ${stdout}, Stderr: ${stderr}`,
        }
      );

      logger.info(`PocketBase started successfully for workspace ${workspace.workspaceId} on port ${workspace.pocketbasePort}`);
    } catch (error) {
      // Clean up on failure
      await this.stopPocketBase(workspace);
      logger.error(`Failed to start PocketBase for workspace ${workspace.workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Stop PocketBase server for the workspace
   */
  async stopPocketBase(workspace: TestWorkspace): Promise<void> {
    const process = this.activeWorkspaces.get(workspace.workspaceId);
    
    if (!process) {
      logger.debug(`No active PocketBase process for workspace ${workspace.workspaceId}`);
      return;
    }

    logger.debug(`Stopping PocketBase for workspace ${workspace.workspaceId}`);

    try {
      // Create a promise that resolves when the process exits
      const exitPromise = new Promise<void>((resolve) => {
        if (process.exitCode !== null) {
          resolve();
          return;
        }
        process.once('exit', () => resolve());
      });

      // Try graceful shutdown first
      process.kill('SIGTERM');
      
      // Wait for graceful shutdown or timeout
      const timeoutPromise = sleep(2000);
      await Promise.race([exitPromise, timeoutPromise]);
      
      // Force kill if still running
      if (process.exitCode === null) {
        process.kill('SIGKILL');
        await exitPromise; // Wait for it to actually die
      }
      
      this.activeWorkspaces.delete(workspace.workspaceId);
      logger.debug(`PocketBase stopped for workspace ${workspace.workspaceId}`);
    } catch (error) {
      logger.warn(`Error stopping PocketBase for workspace ${workspace.workspaceId}:`, error);
      // Still remove from active workspaces
      this.activeWorkspaces.delete(workspace.workspaceId);
    }
  }

  /**
   * Clean up workspace and release allocated resources
   */
  async cleanupWorkspace(workspace: TestWorkspace): Promise<void> {
    logger.debug(`Cleaning up workspace ${workspace.workspaceId}`);

    try {
      // Stop PocketBase if still running
      await this.stopPocketBase(workspace);
      
      // Release allocated port
      this.allocatedPorts.delete(workspace.pocketbasePort);
      
      // Clean up workspace directory
      await cleanupTempDir(workspace.workspaceDir);
      
      logger.debug(`Workspace ${workspace.workspaceId} cleaned up successfully`);
    } catch (error) {
      logger.warn(`Error cleaning up workspace ${workspace.workspaceId}:`, error);
      // Continue with cleanup even if some steps fail
    }
  }

  /**
   * Allocate a unique port for a workspace
   */
  private async allocatePort(startPort: number, endPort: number): Promise<number> {
    for (let port = startPort; port <= endPort; port++) {
      // Skip ports already allocated in this instance
      if (this.allocatedPorts.has(port)) {
        continue;
      }
      
      // Check if port is actually available on the system
      const available = await isPortAvailable(port);
      if (available) {
        this.allocatedPorts.add(port);
        return port;
      }
    }
    
    throw new Error(`No available ports in range ${startPort}-${endPort}`);
  }

  /**
   * Create initial migration for clean database setup
   */
  private async createInitialMigration(workspace: TestWorkspace): Promise<void> {
    // List any existing migration files before creating initial one
    const existingFiles = await readdir(workspace.migrationDir).catch(() => []);
    if (existingFiles.length > 0) {
      logger.warn(`Found ${existingFiles.length} existing migration files in workspace ${workspace.workspaceId}: ${existingFiles.join(', ')}`);
      // Remove any existing migration files to ensure clean state
      for (const file of existingFiles) {
        if (file.endsWith('.js')) {
          await rm(join(workspace.migrationDir, file), { force: true }).catch(() => {});
        }
      }
    }
    
    const timestamp = Date.now();
    const migrationFile = join(workspace.migrationDir, `${timestamp}_initial_setup.js`);
    
    const migrationContent = `
/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  // Initial setup migration - creates clean database structure
  // This migration is automatically generated for E2E test workspace isolation
}, (db) => {
  // Down migration - no-op for initial setup
});
`;

    await writeFile(migrationFile, migrationContent.trim());
    logger.debug(`Created initial migration: ${migrationFile}`);
  }

  /**
   * Create PocketBase configuration for the workspace
   */
  private async createPocketBaseConfig(workspace: TestWorkspace): Promise<void> {
    // Create types.d.ts file for TypeScript support in migrations
    const typesFile = join(workspace.dataDir, 'types.d.ts');
    const typesContent = `
/**
 * This file was @generated using pocketbase-typegen
 */

import type PocketBase from 'pocketbase'
import type { RecordService } from 'pocketbase'

export enum Collections {
  // Collections will be added here as they are created
}

// Type safe PocketBase client
export type TypedPocketBase = PocketBase & {
  collection(idOrName: string): RecordService
}
`;

    await writeFile(typesFile, typesContent.trim());
    logger.debug(`Created types file: ${typesFile}`);
  }
}

// Export factory function for easier testing and dependency injection
export function createWorkspaceManager(pbDownloader?: PBDownloader): WorkspaceManager {
  return new WorkspaceManagerImpl(pbDownloader);
}