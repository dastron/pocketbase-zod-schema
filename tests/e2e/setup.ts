/**
 * Global setup for E2E tests
 * This file runs before all E2E tests
 * Returns a teardown function that runs after all tests complete
 */

import { mkdir, rm } from 'fs/promises';
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

  // Return teardown function that runs after all tests
  return async function teardown() {
    logger.info('Cleaning up E2E test environment...');

    try {
      // Clean up workspace directory
      const workspaceDir = env.getWorkspaceDir();

      try {
        // await rm(workspaceDir, { recursive: true, force: true });
        logger.debug(`Cleaned up workspace directory: ${workspaceDir}`);
      } catch (error) {
        logger.warn(`Failed to cleanup workspace directory ${workspaceDir}:`, error);
      }

      logger.info('E2E test environment cleanup complete');
    } catch (error) {
      logger.error('Failed to cleanup E2E test environment:', error);
      // Don't throw here - we don't want cleanup failures to fail the test run
    }
  };
}