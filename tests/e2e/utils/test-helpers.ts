/**
 * Base test utilities and helpers for E2E tests
 */

import { randomBytes } from 'crypto';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Generate a unique test ID for workspace isolation
 */
export function generateTestId(): string {
  return `test_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

/**
 * Create a temporary directory for test workspace
 */
export async function createTempDir(prefix: string = 'e2e-test-'): Promise<string> {
  return await mkdtemp(join(tmpdir(), prefix));
}

/**
 * Clean up a temporary directory
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    await rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Failed to cleanup temp directory ${dirPath}:`, error);
  }
}

/**
 * Wait for a condition to be true with timeout
 */
export async function waitFor(
  condition: () => Promise<boolean> | boolean,
  options: {
    timeout?: number;
    interval?: number;
    timeoutMessage?: string;
  } = {}
): Promise<void> {
  const { timeout = 30000, interval = 1000, timeoutMessage = 'Condition not met within timeout' } = options;
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(interval);
  }
  
  throw new Error(timeoutMessage);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get available port in the specified range
 */
export async function getAvailablePort(startPort: number = 8090, endPort: number = 8190): Promise<number> {
  for (let port = startPort; port <= endPort; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  
  throw new Error(`No available ports in range ${startPort}-${endPort}`);
}

/**
 * Check if a port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const { createServer } = require('net');
    const server = createServer();
    
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    
    server.on('error', () => resolve(false));
  });
}

/**
 * Retry an operation with exponential backoff
 */
export async function retry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2
  } = options;
  
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        break;
      }
      
      const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
      await sleep(delay);
    }
  }
  
  throw lastError!;
}

/**
 * Environment variable helpers
 */
export const env = {
  getPbVersion(): string {
    return process.env.PB_VERSION || '0.34.2';
  },
  
  getWorkspaceDir(): string {
    return process.env.E2E_WORKSPACE_DIR || './tests/e2e/workspaces';
  },
  
  getDownloadTimeout(): number {
    return parseInt(process.env.E2E_DOWNLOAD_TIMEOUT || '60000', 10);
  },
  
  getStartupTimeout(): number {
    return parseInt(process.env.E2E_STARTUP_TIMEOUT || '30000', 10);
  },
  
  getLogLevel(): string {
    return process.env.E2E_LOG_LEVEL || 'info';
  },
  
  getPortRange(): { start: number; end: number } {
    return {
      start: parseInt(process.env.E2E_PORT_START || '8090', 10),
      end: parseInt(process.env.E2E_PORT_END || '8190', 10),
    };
  },
};

/**
 * Logging utilities for E2E tests
 */
export const logger = {
  debug: (message: string, ...args: any[]) => {
    if (env.getLogLevel() === 'debug') {
      console.debug(`[E2E DEBUG] ${message}`, ...args);
    }
  },
  
  info: (message: string, ...args: any[]) => {
    if (['debug', 'info'].includes(env.getLogLevel())) {
      console.info(`[E2E INFO] ${message}`, ...args);
    }
  },
  
  warn: (message: string, ...args: any[]) => {
    console.warn(`[E2E WARN] ${message}`, ...args);
  },
  
  error: (message: string, ...args: any[]) => {
    console.error(`[E2E ERROR] ${message}`, ...args);
  },
};