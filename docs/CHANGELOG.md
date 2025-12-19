# Changelog

## [0.1.0](https://github.com/dastron/pocketbase-zod-schema/releases/tag/v0.1.0) (2024-12-18)


### Features

* **core:** initial release of PocketBase Zod Migration package
* **cli:** add migration management commands (generate and status)
* **migration:** implement schema-driven migration generation from Zod schemas
* **exports:** add comprehensive package exports with tree-shaking support
* **types:** provide TypeScript type definitions for all modules
* **architecture:** implement modular architecture with optional components
* **compatibility:** add support for both ESM and CommonJS module systems
* **workspace:** implement workspace and monorepo compatibility
* **safety:** add destructive change detection and warnings
* **snapshot:** implement schema snapshot management
* **permissions:** add permission template system
* **schema:** provide base schema patterns for common PocketBase field types
* **relations:** implement relation field detection and configuration
* **generation:** add migration file generation compatible with PocketBase format
* **config:** implement configuration system supporting JSON and JavaScript formats
* **ui:** add progress reporting and colored CLI output
* **errors:** implement comprehensive error handling with actionable messages


### Documentation

* **readme:** add comprehensive installation and usage guide
* **api:** create complete API reference documentation
* **migration:** add migration guide for existing PocketBase users
* **contributing:** provide detailed contributing guidelines
* **changelog:** set up automated changelog generation


### Build System

* **tsup:** configure build system for library compilation
* **exports:** set up granular exports for tree-shaking
* **ci:** implement GitHub Actions for testing and publishing
* **release:** configure Release Please for automated releases

---

## Release Notes

### Version 0.1.0

This is the initial release of the PocketBase Zod Migration package. The package provides a complete solution for schema-driven development with PocketBase, allowing developers to define their database structure using Zod schemas and automatically generate type-safe migrations.

**Key Features:**
- Transform Zod schemas into PocketBase migrations
- CLI tools for migration management
- Full TypeScript support with type inference
- Modular architecture with tree-shaking support
- Comprehensive error handling and user feedback
- Support for both ESM and CommonJS environments

**Getting Started:**
1. Install the package: `npm install pocketbase-zod-schema`
2. Define your schemas using Zod
3. Generate migrations: `npx pocketbase-migrate generate`
4. Apply migrations to your PocketBase instance

**Documentation:**
- Complete API reference in README.md
- Usage examples and best practices
- Configuration options and CLI commands
- Troubleshooting guide

**Compatibility:**
- Node.js 18+
- PocketBase 0.26+
- TypeScript 5.8+
- Zod 3.20+

---

## Contributing

When contributing to this project, please:

1. Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages
2. Update this CHANGELOG.md with your changes
3. Ensure all tests pass before submitting a pull request
4. Add tests for new functionality
5. Update documentation as needed

### Commit Message Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

**Examples:**
```
feat(cli): add --dry-run option to generate command
fix(migration): handle edge case in field type detection
docs(readme): update installation instructions
test(analyzer): add property tests for schema parsing
```