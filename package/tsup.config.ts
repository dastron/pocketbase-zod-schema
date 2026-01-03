import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    // Main entry points
    index: 'src/index.ts',
    schema: 'src/schema.ts',
    enums: 'src/enums.ts',
    mutator: 'src/mutator.ts',
    
    // CLI entry points
    'cli/migrate': 'src/cli/migrate.ts',
    'cli/index': 'src/cli/index.ts',
    'cli/utils/index': 'src/cli/utils/index.ts',
    
    // Migration utilities - granular exports for tree-shaking
    'migration/index': 'src/migration/index.ts',
    'migration/analyzer': 'src/migration/analyzer.ts',
    'migration/diff': 'src/migration/diff.ts',
    'migration/generator': 'src/migration/generator.ts',
    'migration/snapshot': 'src/migration/snapshot.ts',
    'migration/utils/index': 'src/migration/utils/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  target: 'node20',
  treeshake: {
    preset: 'recommended',
    moduleSideEffects: false,
  },
  minify: false, // Keep false for better debugging, can be enabled for production
  external: ['zod', 'chalk', 'commander', 'ora', 'pocketbase'],
  banner: (ctx) => {
    // Only add shebang to CLI files (ESM version)
    if (ctx.format === 'esm' && ctx.path && ctx.path.includes('cli/migrate')) {
      return { js: '#!/usr/bin/env node' };
    }
    return {};
  },
  esbuildOptions(options) {
    // Optimize for tree-shaking
    options.treeShaking = true;
    // Don't mangle properties for better debugging and compatibility
  },
});