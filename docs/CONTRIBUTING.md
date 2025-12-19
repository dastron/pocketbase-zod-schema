# Contributing to PocketBase Zod Migration

Thank you for your interest in contributing to PocketBase Zod Migration! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
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

- Node.js 18 or higher
- Yarn 4.8.1 (package manager)
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
   yarn install
   ```

3. **Build the Project**
   ```bash
   yarn build
   ```

4. **Run Tests**
   ```bash
   yarn test
   ```

5. **Start Development**
   ```bash
   yarn dev
   ```

## Project Structure

```
pocketbase-zod-schema/
├── src/                    # Source code
│   ├── cli/               # CLI commands and utilities
│   ├── migration/         # Core migration engine
│   ├── schema/            # Schema helpers and utilities
│   ├── mutator/           # Data mutators (optional)
│   └── types/             # Type generation (optional)
├── dist/                  # Compiled output
├── docs/                  # Documentation
├── scripts/               # Build and utility scripts
├── __tests__/             # Test files
└── examples/              # Usage examples
```

### Key Modules

- **CLI (`src/cli/`)**: Command-line interface and utilities
- **Migration (`src/migration/`)**: Core migration generation logic
- **Schema (`src/schema/`)**: Schema utilities and permission templates
- **Mutator (`src/mutator/`)**: Optional data manipulation utilities
- **Types (`src/types/`)**: Optional TypeScript type generation

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

- Use custom error classes from `src/migration/errors.ts`
- Provide actionable error messages
- Include context information in error messages
- Handle edge cases gracefully

## Testing

### Test Structure

- **Unit Tests**: Test individual functions and classes
- **Integration Tests**: Test component interactions
- **Property Tests**: Use fast-check for property-based testing
- **CLI Tests**: Test command-line interface functionality

### Running Tests

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage
yarn test:coverage

# Run only property tests
yarn test:property
```

### Writing Tests

1. **Unit Tests**
   ```typescript
   import { describe, it, expect } from 'vitest';
   import { SchemaAnalyzer } from '../analyzer.js';

   describe('SchemaAnalyzer', () => {
     it('should parse valid schema files', () => {
       const analyzer = new SchemaAnalyzer();
       // Test implementation
     });
   });
   ```

2. **Property Tests**
   ```typescript
   import { describe, it } from 'vitest';
   import fc from 'fast-check';

   describe('Migration Generator Properties', () => {
     it('should generate valid migration files for any schema diff', () => {
       fc.assert(fc.property(
         fc.record({
           // Property test generators
         }),
         (schemaDiff) => {
           // Property test implementation
         }
       ));
     });
   });
   ```

### Test Guidelines

- Write tests for new functionality
- Maintain or improve test coverage
- Use descriptive test names
- Test both success and error cases
- Mock external dependencies appropriately

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
 * @param diff - The schema differences to generate migrations for
 * @param outputDir - Directory to write migration files
 * @returns Path to the generated migration file
 * 
 * @throws {MigrationGenerationError} When migration generation fails
 * 
 * @example
 * ```typescript
 * const generator = new MigrationGenerator();
 * const migrationPath = generator.generate(diff, './migrations');
 * ```
 */
public generate(diff: SchemaDiff, outputDir: string): string {
  // Implementation
}
```

### README Updates

When adding new features:
- Update the feature list
- Add usage examples
- Update API reference
- Add troubleshooting information if needed

### Changelog

- Update `CHANGELOG.md` with your changes
- Follow the existing format
- Include breaking changes in the appropriate section

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
   yarn test
   yarn typecheck
   yarn lint
   yarn build
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
- [ ] Updated README.md
- [ ] Updated API documentation
- [ ] Updated CHANGELOG.md

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review of code completed
- [ ] Tests added/updated and passing
- [ ] Documentation updated
- [ ] No breaking changes (or breaking changes documented)
```

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

### Manual Release (if needed)

If manual intervention is required:

```bash
# Trigger Release Please manually
gh workflow run release-please.yml
```

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

Contributors will be recognized in:
- `CONTRIBUTORS.md` file
- Release notes for significant contributions
- GitHub contributor statistics

Thank you for contributing to PocketBase Zod Migration! 🎉