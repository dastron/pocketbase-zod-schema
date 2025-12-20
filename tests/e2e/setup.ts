/**
 * Global setup for E2E tests
 * This file runs before all E2E tests
 */

import { mkdir } from 'fs/promises';
import { env, logger } from './utils/test-helpers.js';

export default async function setup() {
  logger.info('Setting up E2E test environment...');
  
  try {
    // Create workspace directory if it doesn't exist
    const workspaceDir = env.getWorkspaceDir();
    await mkdir(workspaceDir, { recursive: true });
    logger.debug(`Created workspace directory: ${workspaceDir}`);
    
    // Log environment configuration
    logger.debug('E2E Environment Configuration:', {
      pbVersion: env.getPbVersion(),
      workspaceDir: env.getWorkspaceDir(),
      downloadTimeout: env.getDownloadTimeout(),
      startupTimeout: env.getStartupTimeout(),
      logLevel: env.getLogLevel(),
      portRange: env.getPortRange(),
    });
    
    logger.info('E2E test environment setup complete');
  } catch (error) {
    logger.error('Failed to setup E2E test environment:', error);
    throw error;
  }
}