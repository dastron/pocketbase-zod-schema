# Release Guide

This document explains how releases work in the PocketBase Zod Migration project using Release Please.

## Overview

This project uses [Release Please](https://github.com/googleapis/release-please) to automate the release process. Release Please:

- Automatically creates release PRs based on conventional commits
- Generates changelogs from commit messages
- Bumps versions according to semantic versioning
- Publishes to NPM when release PRs are merged

## Conventional Commits

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

| Type | Description | Version Bump |
|------|-------------|--------------|
| `feat` | New feature | MINOR |
| `fix` | Bug fix | PATCH |
| `feat!` or `fix!` | Breaking change | MAJOR |
| `docs` | Documentation only | None |
| `style` | Code style changes | None |
| `refactor` | Code refactoring | None |
| `perf` | Performance improvements | PATCH |
| `test` | Test changes | None |
| `build` | Build system changes | None |
| `ci` | CI configuration changes | None |
| `chore` | Other changes | None |

### Examples

**Feature (MINOR bump):**
```bash
git commit -m "feat(cli): add --dry-run option for migration preview"
```

**Bug Fix (PATCH bump):**
```bash
git commit -m "fix(analyzer): handle circular dependencies in schema imports"
```

**Breaking Change (MAJOR bump):**
```bash
git commit -m "feat(api)!: change migration generator API signature

BREAKING CHANGE: The generate() method now requires a config object instead of individual parameters."
```

**Documentation:**
```bash
git commit -m "docs(readme): update installation instructions"
```

## Release Workflow

### 1. Development

Make changes on a feature branch:

```bash
git checkout -b feat/my-new-feature
# Make changes
git add .
git commit -m "feat(core): add new feature"
git push origin feat/my-new-feature
```

### 2. Create Pull Request

Create a PR to merge your feature branch into `main`:

- Ensure all tests pass
- Follow conventional commit format
- Update documentation if needed

### 3. Merge to Main

Once approved, merge the PR to `main`. This triggers Release Please.

### 4. Release Please Creates Release PR

Release Please automatically:

- Analyzes commits since last release
- Determines version bump based on commit types
- Generates changelog entries
- Creates a release PR

The release PR will:
- Update `package.json` version
- Update `CHANGELOG.md`
- Update `.release-please-manifest.json`

### 5. Review Release PR

Review the automatically created release PR:

- Check version bump is correct
- Review changelog entries
- Verify all changes are included

### 6. Merge Release PR

When you merge the release PR:

- A GitHub release is created
- Package is automatically published to NPM
- Git tag is created

## Version Bumping Rules

Release Please determines version bumps based on commit types:

### Patch Release (0.1.0 → 0.1.1)

Triggered by:
- `fix:` commits
- `perf:` commits

Example:
```bash
git commit -m "fix(migration): resolve timestamp conflict issue"
```

### Minor Release (0.1.0 → 0.2.0)

Triggered by:
- `feat:` commits

Example:
```bash
git commit -m "feat(cli): add status command for migration preview"
```

### Major Release (0.1.0 → 1.0.0)

Triggered by:
- `feat!:` or `fix!:` commits
- Commits with `BREAKING CHANGE:` in footer

Example:
```bash
git commit -m "feat(api)!: redesign migration generator API

BREAKING CHANGE: The MigrationGenerator class now requires a config object in the constructor."
```

## Changelog Generation

Release Please automatically generates changelog entries from commits:

### Included in Changelog

- `feat:` → Features section
- `fix:` → Bug Fixes section
- `docs:` → Documentation section
- `perf:` → Performance Improvements section
- `refactor:` → Code Refactoring section
- `test:` → Tests section
- `build:` → Build System section
- `ci:` → Continuous Integration section

### Excluded from Changelog

- `chore:` commits (hidden by default)
- `style:` commits (unless configured otherwise)

## NPM Publishing

Publishing to NPM is fully automated:

1. Release PR is merged to `main`
2. GitHub Actions workflow runs
3. Tests are executed
4. Package is built
5. Package is published to NPM with `--access public`

### NPM Token Setup

For maintainers, ensure `NPM_TOKEN` secret is configured in GitHub:

1. Generate NPM token: https://www.npmjs.com/settings/tokens
2. Add to GitHub secrets: Settings → Secrets → Actions → New repository secret
3. Name: `NPM_TOKEN`
4. Value: Your NPM token

## Manual Release (Emergency)

If automated release fails, you can manually release:

```bash
# Ensure you're on main and up to date
git checkout main
git pull origin main

# Run tests
yarn test

# Build package
yarn build

# Publish to NPM
yarn npm publish --access public
```

## Troubleshooting

### Release PR Not Created

**Issue:** Release Please didn't create a release PR after merging to main.

**Solutions:**
- Ensure commits follow conventional commit format
- Check that commits include version-bumping types (`feat`, `fix`, etc.)
- Verify GitHub Actions workflow ran successfully
- Check Release Please logs in GitHub Actions

### Wrong Version Bump

**Issue:** Release Please chose wrong version bump.

**Solutions:**
- Review commit messages for correct types
- Use `!` suffix for breaking changes: `feat!:` or `fix!:`
- Add `BREAKING CHANGE:` footer for major bumps
- Manually edit release PR if needed

### NPM Publish Failed

**Issue:** Package failed to publish to NPM.

**Solutions:**
- Verify `NPM_TOKEN` secret is configured correctly
- Check NPM token has publish permissions
- Ensure package name is available on NPM
- Review GitHub Actions logs for specific error

### Changelog Missing Commits

**Issue:** Some commits are missing from changelog.

**Solutions:**
- Ensure commits follow conventional commit format
- Check commit type is included in changelog configuration
- Verify commits are on main branch
- Review `.release-please-manifest.json` for last release

## Best Practices

### Commit Messages

- Use clear, descriptive commit messages
- Include scope when relevant: `feat(cli):`, `fix(migration):`
- Write in imperative mood: "add feature" not "added feature"
- Keep first line under 72 characters
- Add body for complex changes

### Pull Requests

- Squash commits when merging to keep history clean
- Ensure PR title follows conventional commit format
- Include breaking changes in PR description
- Link related issues in PR description

### Releases

- Review release PR carefully before merging
- Test release candidates when possible
- Document breaking changes clearly
- Update migration guides for major versions

## Resources

- [Release Please Documentation](https://github.com/googleapis/release-please)
- [Conventional Commits Specification](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [NPM Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)