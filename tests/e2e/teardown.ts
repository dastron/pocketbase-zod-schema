/**
 * Global teardown for E2E tests
 * This file runs after all E2E tests complete
 */

import { rm } from 'fs/promises';
import { env, logger } from './utils/test-helpers.js';

export default async function teardown() {
  logger.info('Cleaning up E2E test environment...');
  
  try {
    // Clean up workspace directory
    const workspaceDir = env.getWorkspaceDir();
    
    try {
      await rm(workspaceDir, { recursive: true, force: true });
      logger.debug(`Cleaned up workspace directory: ${workspaceDir}`);
    } catch (error) {
      logger.warn(`Failed to cleanup workspace directory ${workspaceDir}:`, error);
    }
    
    logger.info('E2E test environment cleanup complete');
  } catch (error) {
    logger.error('Failed to cleanup E2E test environment:', error);
    // Don't throw here - we don't want cleanup failures to fail the test run
  }
}