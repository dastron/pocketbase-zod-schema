import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Include patterns for E2E test files
    include: [
      'tests/e2e/**/*.test.ts',
      'tests/e2e/**/*.e2e.test.ts',
      'tests/e2e/**/*.property.test.ts',
    ],
    
    // Exclude patterns
    exclude: [
      'node_modules',
      'dist',
      'package/src/**',
      'tests/e2e/fixtures/**',
      'tests/e2e/utils/**',
    ],
    
    // Coverage configuration for E2E tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['tests/e2e/**/*.ts'],
      exclude: [
        'tests/e2e/**/*.test.ts',
        'tests/e2e/**/*.e2e.test.ts',
        'tests/e2e/**/*.property.test.ts',
        'tests/e2e/fixtures/**',
        'tests/e2e/utils/**',
        'tests/e2e/**/.gitkeep',
      ],
      reportsDirectory: 'tests/e2e/coverage',
    },
    
    // Globals for test utilities
    globals: true,
    
    // Extended timeout for E2E tests (they involve real PocketBase instances)
    testTimeout: 120000, // 2 minutes
    
    // Hook timeout for setup/teardown
    hookTimeout: 60000, // 1 minute
    
    // Reporter configuration
    reporters: ['verbose'],
    
    // Sequence configuration
    sequence: {
      shuffle: false,
    },
    
    // Pool configuration - use forks for isolation (Vitest 4+ syntax)
    pool: 'forks',
    isolate: true,
    
    // Environment variables for E2E tests
    env: {
      // PocketBase version for testing
      PB_VERSION: process.env.PB_VERSION || '0.34.2',
      
      // Test workspace directory
      E2E_WORKSPACE_DIR: process.env.E2E_WORKSPACE_DIR || './tests/e2e/workspaces',
      
      // Test timeout settings
      E2E_DOWNLOAD_TIMEOUT: process.env.E2E_DOWNLOAD_TIMEOUT || '60000',
      E2E_STARTUP_TIMEOUT: process.env.E2E_STARTUP_TIMEOUT || '30000',
      
      // Logging level for E2E tests
      E2E_LOG_LEVEL: process.env.E2E_LOG_LEVEL || 'info',
      
      // Port range for test PocketBase instances
      E2E_PORT_START: process.env.E2E_PORT_START || '8090',
      E2E_PORT_END: process.env.E2E_PORT_END || '8190',
    },
    
    // Setup files for E2E tests
    setupFiles: ['tests/e2e/setup.ts'],
    
    // Teardown files for cleanup
    globalTeardown: ['tests/e2e/teardown.ts'],
  },
});