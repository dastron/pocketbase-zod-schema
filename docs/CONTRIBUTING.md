# Contributing to PocketBase Zod Migration

Thank you for your interest in contributing to PocketBase Zod Migration! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Architecture Notes for Contributors](#architecture-notes-for-contributors)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Documentation](#documentation)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

## Code of Conduct

This project adheres to a code of conduct that we expect all contributors to follow. Please be respectful and constructive in all interactions.

### Our Standards

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

## Getting Started

### Prerequisites

- **Node.js 20 or higher** (the package declares `engines.node >= 20`; CI runs 20 and 22). Reading
  PocketBase's `_migrations` table uses `node:sqlite` and needs **Node >= 22.5** — tests that
  touch it skip on older runtimes.
- Yarn 4.8.1, via Corepack (`corepack enable`)
- Git
- TypeScript knowledge
- Familiarity with PocketBase and Zod

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/pocketbase-zod-schema.git
   cd pocketbase-zod-schema
   ```

2. **Install Dependencies**
   ```bash
   corepack enable
   yarn install --immutable
   ```

3. **Build, test, check**
   ```bash
   yarn build
   yarn test
   yarn typecheck
   yarn lint
   ```

`yarn` at the repo root may prompt Corepack to download Yarn 4. The binaries in `node_modules/.bin/`
(`tsc`, `vitest`, `eslint`, `tsup`) can be invoked directly to avoid that.

## Project Structure

This is a Yarn 4 workspace monorepo. The publishable library is `package/`; the repo root is a
demo/host workspace that consumes it.

```
pocketbase-zod-schema/
├── package/                    # The published library (pocketbase-zod-schema)
│   └── src/
│       ├── cli/                # CLI entry point, commands, config, logging
│       │   └── commands/       # generate, status, generate-types, lint
│       ├── migration/          # The pipeline
│       │   ├── analyzer/       # Zod schemas -> SchemaDefinition
│       │   ├── diff/           # SchemaDefinition vs. snapshot -> SchemaDiff
│       │   ├── generator/      # SchemaDiff -> migration files
│       │   ├── engine/         # node:vm simulation of PocketBase's JSVM
│       │   ├── utils/          # pluralize, type mapping, relation detection, ids
│       │   ├── snapshot.ts     # state reconstruction entry point
│       │   ├── validation.ts   # destructive-change detection used by the CLI
│       │   └── errors.ts       # error classes
│       ├── schema/             # defineCollection, defineView, field helpers
│       │                       #  ...and the example schemas the host workspace uses
│       ├── type-gen/           # generate-types implementation
│       ├── mutator/            # data mutation helpers
│       └── utils/              # permissions and templates
├── pocketbase/pb_migrations/   # Migrations generated from package/src/schema
├── tests/e2e/                  # End-to-end suite driving a real PocketBase binary
├── docs/                       # Documentation
└── scripts/                    # PocketBase download / start / stop
```

Tests live in `__tests__/` directories next to the code they cover. There is no top-level `src/`
and no `examples/` directory — `package/src/schema/*.ts` doubles as the library's example schemas
*and* the schema directory `pocketbase-migrate.config.js` points at.

### Commands: which workspace

Run library commands from `package/`, host commands from the repo root. The root `package.json`
proxies the common ones (`yarn test`, `yarn build`, `yarn typecheck`, `yarn lint`) to the
workspace.

```bash
# library (cd package/)
yarn test                              # vitest run
yarn test:watch
yarn test:property                     # property-based tests only
yarn test:coverage
yarn typecheck                         # tsc --noEmit
yarn lint                              # eslint src --fix
yarn build                             # tsup (esm + cjs + dts)
vitest run src/migration/__tests__/integration/view-collection.test.ts   # single file
vitest run -t "should parse an in-place view query update"              # single test

# host (repo root)
yarn db:generate                       # schemas -> migration files
yarn db:status                         # preview changes without writing
yarn db:typegen                        # regenerate pocketbase-types.ts
yarn db:download && yarn db:start      # fetch + run PocketBase
yarn test:e2e                          # drives a real PocketBase binary; slow
```

## Architecture Notes for Contributors

Three invariants matter more than anything else here.

### There is no snapshot file

"Current database state" means *the state produced by executing the migration files*.
`snapshot.ts:loadSnapshotWithMigrations()` plans a file list (newest `*_collections_snapshot.js`
plus everything after it) and runs each `up()` in a `node:vm` sandbox emulating PocketBase's goja
JSVM. There is no static/regex reader — a migration the engine cannot execute is a hard error, not
a warning. See [EXECUTION_ENGINE.md](./EXECUTION_ENGINE.md).

### Anything the generator writes, the engine must read back

Otherwise `db:generate` emits the same migration forever, because the diff never sees the change
land. **When you add a new emitted construct, add a round-trip test** alongside
`__tests__/integration/generated-migration-replay.test.ts` and
`generate-no-additional-migration.test.ts`.

### All collection metadata rides in the Zod description

There is no registry. `defineCollection()` serializes `{collectionName, type, viewQuery,
permissions, indexes}` into the schema's `.describe()` string as JSON; field helpers and
`RelationField`/`RelationsField` do the same per field under `__pocketbase_field__` and
`__pocketbase_relation__`. The analyzer's `extractors.ts` parses it back out. Consequence:
`defineCollection` *overwrites* the description, so it must wrap the schema, not the reverse.

### Two destructive-change implementations

`diff/destructiveness.ts` (used by `DiffEngine`) and `migration/validation.ts` (used by the CLI).
A change to destructive-change policy usually needs both.

## Development Workflow

### Branch Naming

Use descriptive branch names with prefixes:

- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `test/` - Test improvements
- `refactor/` - Code refactoring
- `chore/` - Maintenance tasks

Examples:
- `feat/add-workspace-support`
- `fix/migration-timestamp-conflict`
- `docs/update-api-reference`

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting changes
- `refactor`: Code restructuring
- `perf`: Performance improvements
- `test`: Test changes
- `chore`: Maintenance

**Examples:**
```
feat(cli): add --dry-run option for migration preview
fix(analyzer): handle circular dependencies in schema imports
docs(readme): add troubleshooting section
test(migration): add property tests for diff engine
```

### Code Style

- Use TypeScript strict mode
- Follow existing code formatting (Prettier configuration)
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Prefer explicit types over `any`

### Error Handling

- Use the custom error classes from `package/src/migration/errors.ts`
- Provide actionable error messages
- Include context information in error messages (each class has a `getDetailedMessage()`)
- A state reconstruction you cannot trust is worse than an error — do not swallow an execution
  failure with a warning

## Testing

### Test Structure

- **Unit tests**: individual functions and classes, in `__tests__/` next to the code
- **Integration tests**: `package/src/migration/__tests__/integration/` — the full
  schema → diff → generate → replay loop
- **Property tests**: fast-check, run with `yarn test:property`
- **E2E**: `tests/e2e/`, drives a real PocketBase binary

### Running Tests

```bash
# from package/
yarn test                 # all unit + integration tests
yarn test:watch
yarn test:coverage
yarn test:property        # property-based tests only

vitest run src/migration/__tests__/integration/view-collection.test.ts   # single file
vitest run -t "should parse an in-place view query update"              # single test by name

# from the repo root
yarn test:e2e             # slow: downloads PocketBase, fileParallelism off
yarn test:e2e:verbose
```

### Test Style

**No vitest snapshots anywhere.** Tests build a `SchemaDefinition`, run `compare()` → `generate()`
into an `os.tmpdir()` directory, then assert with `toContain` or by parsing the output and
comparing structurally.

Two helpers matter, and mixing them up is the usual mistake
(`package/src/migration/__tests__/helpers/`):

| Helper | Use it to assert on | Never use it to |
| --- | --- | --- |
| `migration-executor.ts` | what a migration **does** — execute it, then read the resulting state and a before/after diff | — |
| `migration-parser.ts` | what the generator **wrote** — emitted field literals, operation calls, closure shapes | reconstruct state |

`__tests__/fixtures/reference-migrations/` holds real PocketBase-authored migrations used as ground
truth. Regenerate them from an actual PocketBase instance rather than hand-writing them.

### Test Guidelines

- Write tests for new functionality, and cover both success and error cases
- **New emitted construct → round-trip test.** Anything the generator writes must replay through
  `loadSnapshotWithMigrations` and reproduce the state it was generated for, with a zero follow-up
  diff. Without one, a regression shows up as `db:generate` looping forever instead of as a test
  failure.
- Use descriptive test names
- Maintain or improve coverage

## Documentation

### API Documentation

- Use JSDoc comments for all public APIs
- Include parameter types and return types
- Provide usage examples
- Document error conditions

```typescript
/**
 * Generates PocketBase migrations from schema differences.
 *
 * One file is written per collection operation.
 *
 * @param diff - The schema differences to generate migrations for
 * @param config - Output directory, or a MigrationGeneratorConfig
 * @returns Paths of the migration files written; empty when the diff is empty
 *
 * @throws {MigrationGenerationError} When migration generation fails
 *
 * @example
 * ```typescript
 * const paths = generate(diff, "./pocketbase/pb_migrations");
 * ```
 */
export function generate(diff: SchemaDiff, config: MigrationGeneratorConfig | string): string[] {
  // Implementation
}
```

### Documentation Updates

When adding a feature, update whatever it touches:

| You changed | Also update |
| --- | --- |
| A CLI command or flag | [API.md](./API.md) CLI section, [CONFIGURATION.md](./CONFIGURATION.md), both READMEs |
| A config key | [CONFIGURATION.md](./CONFIGURATION.md), the `MigrationConfig` type in [API.md](./API.md) |
| An exported function's signature | [API.md](./API.md) |
| A Zod → PocketBase mapping rule | [TYPE_MAPPING.md](./TYPE_MAPPING.md) |
| Engine behaviour or API surface | [EXECUTION_ENGINE.md](./EXECUTION_ENGINE.md) |
| A field helper or `defineCollection` option | [TYPE_MAPPING.md](./TYPE_MAPPING.md), `package/README.md` |
| Anything breaking | The upgrade notes in [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) |

`package/README.md` is what npm shows, so keep it self-contained; the root `README.md` also covers
working in this repo.

### Changelog

**Do not hand-edit `package/CHANGELOG.md`.** Release Please generates it from conventional commits
and will conflict with manual edits. Put the user-visible summary in your commit message instead —
that is what ends up in the changelog. For a breaking change use `feat!:`/`fix!:` or a
`BREAKING CHANGE:` footer, and add an upgrade note to
[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md#version-upgrade-notes).

## Submitting Changes

### Pull Request Process

1. **Create a Feature Branch**
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make Your Changes**
   - Write code following project conventions
   - Add tests for new functionality
   - Update documentation as needed

3. **Test Your Changes**
   ```bash
   yarn precommit        # lint + typecheck + test
   yarn build
   yarn test:e2e         # if you touched the generator or the engine
   ```

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push and Create PR**
   ```bash
   git push origin feat/your-feature-name
   ```

### Pull Request Guidelines

- **Title**: Use conventional commit format
- **Description**: Explain what changes you made and why
- **Testing**: Describe how you tested your changes
- **Documentation**: Note any documentation updates
- **Breaking Changes**: Highlight any breaking changes

### PR Template

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] Added tests for new functionality
- [ ] Updated existing tests as needed

## Documentation
- [ ] Updated the docs the change touches (see the table in CONTRIBUTING.md)
- [ ] Upgrade note added to MIGRATION_GUIDE.md if this is breaking

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review of code completed
- [ ] Tests added/updated and passing
- [ ] Round-trip test added if the generator emits a new construct
- [ ] Documentation updated
- [ ] No breaking changes (or breaking changes documented)
```

CHANGELOG.md is generated by Release Please — do not edit it in a PR.

## Release Process

### Automated Releases

This project uses [Release Please](https://github.com/googleapis/release-please) for automated releases:

- **Automatic Version Bumping**: Versions are determined by commit message types
- **Changelog Generation**: Automatically generated from conventional commits
- **NPM Publishing**: Automated via GitHub Actions when releases are created

### Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes (`feat!:` or `fix!:` commits)
- **MINOR**: New features (`feat:` commits)
- **PATCH**: Bug fixes (`fix:` commits)

### Release Workflow

1. **Make Changes**: Create feature branch and implement changes
2. **Commit**: Use conventional commit messages
3. **Create PR**: Submit pull request to `main` branch
4. **Merge**: Once approved, merge to `main`
5. **Automatic Release**: Release Please creates release PR automatically
6. **Merge Release PR**: Merging the release PR triggers NPM publishing

Details, including the emergency manual path, are in [RELEASE.md](./RELEASE.md). The workflow file
is `.github/workflows/release.yml`.

## Getting Help

### Communication Channels

- **Issues**: GitHub Issues for bug reports and feature requests
- **Discussions**: GitHub Discussions for questions and ideas
- **Email**: Contact maintainers directly for security issues

### Issue Templates

When reporting bugs or requesting features, please use the provided issue templates and include:

- Clear description of the problem or feature
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Environment information (Node.js version, OS, etc.)
- Relevant code examples or configuration

### Security Issues

For security vulnerabilities, please email the maintainers directly rather than creating a public issue.

## Recognition

Contributors are recognized in release notes and GitHub's contributor statistics.

Thank you for contributing to PocketBase Zod Migration! 🎉