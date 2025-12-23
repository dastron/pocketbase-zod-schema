# E2E Migration Validation Tests

This directory contains the end-to-end test infrastructure for validating the pocketbase-zod-schema library's migration generation against PocketBase's native CLI migration system.

## Overview

The E2E test system:
1. Downloads PocketBase executable
2. Creates isolated test workspaces
3. Generates migrations using both PocketBase CLI and the library
4. Compares the generated migrations for compatibility
5. Reports detailed compatibility metrics

## Directory Structure

```
tests/e2e/
├── components/          # Tests for individual E2E system components
├── integration/         # Full end-to-end integration tests
├── properties/          # Property-based tests for E2E components
├── fixtures/            # Test scenarios and expected outputs
├── utils/               # Test utilities and helpers
├── setup.ts             # Global test setup
├── teardown.ts          # Global test cleanup
├── vitest.config.ts     # Vitest configuration for E2E tests
└── README.md           # This file
```

## Running E2E Tests

### Prerequisites

- Node.js 20+
- Yarn 4.8.1+
- Internet connection (for PocketBase download)

### Commands

```bash
# Run all E2E tests
yarn test:e2e

# Run E2E tests in watch mode
yarn test:e2e:watch

# Run E2E tests with verbose logging
yarn test:e2e:verbose

# Run E2E tests with coverage
yarn test:e2e:coverage
```

### Environment Configuration

Copy `.env.example` to `.env` and adjust settings as needed:

```bash
cp tests/e2e/.env.example tests/e2e/.env
```

Key environment variables:
- `PB_VERSION`: PocketBase version to test against (default: 0.34.2)
- `E2E_WORKSPACE_DIR`: Directory for temporary test workspaces
- `E2E_LOG_LEVEL`: Logging verbosity (debug, info, warn, error)
- `E2E_PORT_START/END`: Port range for test PocketBase instances

## Test Categories

### Component Tests (`components/`)
Test individual E2E system components in isolation:
- PB Downloader
- Workspace Manager
- Native Migration Generator
- Library CLI Simulator
- Diff Analyzer
- Report Generator

### Integration Tests (`integration/`)
Test complete end-to-end workflows:
- Full E2E validation pipeline
- Field type compatibility
- Index and rule preservation
- CLI response comparison

### Property Tests (`properties/`)
Property-based tests for universal correctness:
- Version management consistency
- Workspace isolation
- Migration comparison accuracy
- Error handling robustness

## Test Scenarios

Test scenarios are defined in `fixtures/test-scenarios.ts`:

- **Basic Collections**: Standard field types, blank collections
- **Field Types**: All supported PocketBase field types
- **Indexes & Rules**: Unique indexes, API rules, auth filtering
- **Auth Collections**: Special system fields, auth-specific rules
- **Updates**: Adding fields and indexes to existing collections

## Writing Tests

### Component Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { PBDownloader } from '../components/pb-downloader';

describe('PBDownloader', () => {
  it('should download and cache PocketBase executable', async () => {
    const downloader = new PBDownloader();
    const path = await downloader.downloadPocketBase('0.34.2');
    
    expect(path).toBeTruthy();
    expect(await downloader.verifyExecutable(path)).toBe(true);
  });
});
```

### Property Test Example

```typescript
import { describe, it } from 'vitest';
import fc from 'fast-check';

describe('Workspace Isolation Property', () => {
  it('should ensure complete workspace isolation', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.string(), { minLength: 2, maxLength: 5 }),
      async (testIds) => {
        // Property: Each test gets unique workspace
        const workspaces = await Promise.all(
          testIds.map(id => createWorkspace(id))
        );
        
        const dirs = workspaces.map(w => w.workspaceDir);
        const uniqueDirs = new Set(dirs);
        
        return dirs.length === uniqueDirs.size;
      }
    ), { numRuns: 100 });
  });
});
```

## Debugging

### Verbose Logging
```bash
E2E_LOG_LEVEL=debug yarn test:e2e
```

### Preserve Workspaces
```bash
E2E_CLEANUP_ON_FAILURE=false yarn test:e2e
```

### Single Test
```bash
yarn test:e2e --testNamePattern="PBDownloader"
```

## CI/CD Integration

The E2E tests are designed to run in CI/CD environments:
- Proper exit codes for success/failure
- Configurable timeouts
- Workspace cleanup
- Parallel execution support

## Troubleshooting

### Common Issues

1. **Port conflicts**: Adjust `E2E_PORT_START/END` range
2. **Download timeouts**: Increase `E2E_DOWNLOAD_TIMEOUT`
3. **Workspace cleanup**: Check `E2E_WORKSPACE_DIR` permissions
4. **PocketBase startup**: Verify `E2E_STARTUP_TIMEOUT` is sufficient

### Logs

E2E tests log to console with prefixes:
- `[E2E DEBUG]`: Detailed debugging information
- `[E2E INFO]`: General information
- `[E2E WARN]`: Warnings (non-fatal)
- `[E2E ERROR]`: Errors (test failures)

## Contributing

When adding new E2E tests:
1. Follow the existing directory structure
2. Use the provided utilities and helpers
3. Add appropriate test scenarios to fixtures
4. Include both positive and negative test cases
5. Update this README if adding new categories