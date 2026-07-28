# E2E Migration Validation Tests

This directory contains the end-to-end test infrastructure for validating the pocketbase-zod-schema library's migration generation against PocketBase's native CLI migration system.

## Overview

The E2E test system:
1. Downloads PocketBase executable
2. Creates isolated test workspaces
3. Generates migrations using both PocketBase CLI and the library
4. Compares the generated migrations for compatibility
5. Applies the library migration with the real binary and checks the result
6. Reports detailed compatibility metrics

### Validation stages

Each scenario is checked three ways, from weakest to strongest signal:

| Stage | Component | What it proves | Gated |
| --- | --- | --- | --- |
| Text comparison | `cli-response-analyzer.ts` | How closely the generated file resembles PocketBase's own (`overallScore`) | no — informational |
| State equivalence | `engine-state-comparator.ts` | Both migrations, executed in the engine, produce the same schema (`stateEquivalenceScore`) | yes |
| Real apply | `real-apply-verifier.ts` | PocketBase itself applies the migration, and the engine simulated exactly what it stored (`realApplyScore`) | yes |

Both gated scores are asserted per scenario against
`minimumStateEquivalenceScore` and `minimumRealApplyScore`
(`fixtures/test-scenarios.ts`), each defaulting to 100 — the two states must
be identical. A scenario pins a lower baseline only for a divergence that is
understood and tracked; every such number carries a comment naming the gap.
Dropping below a pinned baseline fails the test, so a regression cannot slip
through as a logged warning. When a gap is closed, raise its baseline back to
100 in the same change, otherwise the gate stops guarding it.

The text-similarity score is reported but never asserted: two migrations can
express the same schema in very different text (statement order, `addAt` vs
`add`, `unmarshal` vs property assignment), so it measures resemblance rather
than correctness.

### Reading migration files

`migration-inspector.ts` is the only thing that reads a migration file. It
executes the file through the migration engine (starting from the `users`
auth collection every real instance has) and reports the collections the file
created, modified, or deleted. There is no text scanning: a migration that
mutates a collection it looked up, loops over field definitions, or computes
a name is read exactly as PocketBase would run it, and a file the engine
cannot execute fails loudly instead of parsing as zero collections.

The real-apply stage is the oracle: it copies the library-generated
migration into a fresh workspace, runs `pocketbase migrate up`, reads the
collections back through `GET /api/collections`, and diffs that against the
engine's simulation of the same files. Both sides start from the collections
a freshly-initialized instance has, captured once per run.

Two failure modes it catches that nothing else does: a migration PocketBase
refuses to apply (a hard test failure — note `migrate up` exits 0 even when
a migration fails, so the outcome is parsed from its output), and a
migration PocketBase applies *differently* than the engine simulated, which
is a defect in the engine or the generator. Option defaults PocketBase
materializes (`pattern: ""`, `min: 0`) are reconciled first, so what remains
is real divergence.

#### Known divergences

There are none: every scenario scores 100 on all three stages, and no
scenario pins a baseline below the default 100. A scenario that has to pin a
lower one carries a comment naming the gap, so `minimumStateEquivalenceScore`
or `minimumRealApplyScore` appearing in `fixtures/test-scenarios.ts` is itself
the signal that something is outstanding.

Getting here closed four generator defects — `pattern` carried onto
`email`/`date` fields from the Zod validator, `password` emitted as
`type: "text"` rather than PocketBase's `password` type, `tokenKey` without
its min 30 / max 60, and a fixed collection id baked into the auth index
names — and three harness gaps, where `library-cli.ts` built Zod schemas that
under-described the scenario (`editor` and `autodate` as plain strings, a
select without its `maxSelect`) and `native-migration-generator.ts` created
collections over the REST API without the `created`/`updated` autodate fields
PocketBase's own collection form adds.

One difference is normalized rather than fixed. PocketBase names an auth
collection's generated indexes after the collection id
(`idx_tokenKey_pbc_2283551112`); the two sides assign ids independently — the
library generates a random `pb_` one by design — so those names can never
match. Both comparators substitute the id each side used before diffing (see
`normalizeIndexNames` in `state-diff.ts`), which keeps the uniqueness,
columns and `WHERE` clause under comparison while ignoring the id.

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
- `PB_VERSION`: PocketBase version to test against (default: 0.35.0)
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
- Engine State Comparator
- Real Apply Verifier
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
    const path = await downloader.downloadPocketBase('0.35.0');
    
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