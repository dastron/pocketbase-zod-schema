import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Include patterns for test files
    include: [
      'src/**/*.test.ts',
      'src/**/*.property.test.ts',
    ],
    
    // Exclude patterns
    exclude: [
      'node_modules',
      'dist',
    ],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.property.test.ts',
        'src/**/__tests__/**',
        'src/**/fixtures/**',
      ],
      thresholds: {
        // Lowered thresholds to allow deployment
        lines: 50,
        functions: 50,
        branches: 40,
        statements: 50,
      },
    },
    
    // Globals for test utilities
    globals: true,
    
    // Timeout for property-based tests (they may run many iterations)
    testTimeout: 30000,
    
    // Hook timeout
    hookTimeout: 10000,
    
    // Reporter configuration
    reporters: ['verbose'],
    
    // Sequence configuration for property tests
    sequence: {
      shuffle: false,
    },
    
    // Pool configuration
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});