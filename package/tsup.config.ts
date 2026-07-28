import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    // Public entry points
    index: 'src/index.ts',
    server: 'src/server.ts',

    // CLI binary (wired via package.json "bin", not "exports")
    'cli/migrate': 'src/cli/migrate.ts',
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
  external: ['zod', 'chalk', 'commander', 'ora', 'pocketbase', 'tsx'],
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