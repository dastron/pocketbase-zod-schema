/**
 * Generate command implementation
 * Generates migrations from schema changes
 */

import { Command } from "commander";
import * as path from "path";
import { parseSchemaFiles } from "../../migration/analyzer.js";
import { compare } from "../../migration/diff.js";
import {
  ConfigurationError,
  FileSystemError,
  MigrationGenerationError,
  SchemaParsingError,
  SnapshotError,
} from "../../migration/errors.js";
import { generate } from "../../migration/generator.js";
import { loadSnapshotIfExists } from "../../migration/snapshot.js";
import {
  detectDestructiveChanges,
  formatDestructiveChanges,
  requiresForceFlag,
  summarizeDestructiveChanges,
} from "../../migration/validation.js";
import { getMigrationsDirectory, getSchemaDirectory, loadConfig, type MigrationConfig } from "../utils/config.js";
import {
  formatChangeSummary,
  logDebug,
  logError,
  logInfo,
  logSection,
  logSuccess,
  logWarning,
  setVerbosity,
  withProgress,
} from "../utils/logger.js";

/**
 * Checks if there are any changes in the diff
 *
 * @param diff - Schema diff to check
 * @returns True if there are changes
 */
function hasChanges(diff: any): boolean {
  return (
    diff.collectionsToCreate.length > 0 || diff.collectionsToDelete.length > 0 || diff.collectionsToModify.length > 0
  );
}

/**
 * Handles destructive changes with warnings and force flag
 *
 * @param diff - Schema diff containing changes
 * @param config - Migration configuration
 * @param force - Force flag from CLI
 * @returns True if should proceed, false otherwise
 */
function handleDestructiveChanges(diff: any, config: MigrationConfig, force: boolean): boolean {
  // Detect destructive changes
  const destructiveChanges = detectDestructiveChanges(diff);

  if (destructiveChanges.length === 0) {
    return true; // No destructive changes, proceed
  }

  // Display destructive changes warning
  logSection("⚠️  Destructive Changes Detected");
  console.log();

  // Format and display destructive changes
  console.log(formatDestructiveChanges(destructiveChanges));

  // Display summary
  const summary = summarizeDestructiveChanges(destructiveChanges);
  console.log("Summary:");
  console.log(`  Total: ${summary.total} destructive change(s)`);
  if (summary.high > 0) {
    console.log(`  High Severity: ${summary.high}`);
  }
  if (summary.medium > 0) {
    console.log(`  Medium Severity: ${summary.medium}`);
  }
  if (summary.low > 0) {
    console.log(`  Low Severity: ${summary.low}`);
  }
  console.log();

  // Check if force flag is required
  const forceRequired = config.diff.requireForceForDestructive && requiresForceFlag(destructiveChanges);

  if (forceRequired && !force) {
    logError("Destructive changes require the --force flag to proceed.");
    console.log();
    logInfo("To proceed with these changes, run the command again with --force:");
    console.log("  yarn migrate:generate --force");
    console.log();
    logWarning("⚠️  WARNING: Using --force will apply these changes and may result in data loss!");
    return false;
  }

  if (force) {
    logWarning("Proceeding with destructive changes (--force flag provided)");
    console.log();
  }

  return true;
}

/**
 * Executes the generate command
 *
 * @param options - Command options
 */
export async function executeGenerate(options: any): Promise<void> {
  try {
    // Set verbosity based on global options
    const parentOpts = options.parent?.opts?.() || {};
    if (parentOpts.verbose) {
      setVerbosity("verbose");
    } else if (parentOpts.quiet) {
      setVerbosity("quiet");
    }

    logDebug("Starting migration generation...");
    logDebug(`Options: ${JSON.stringify(options, null, 2)}`);

    // Load configuration
    const config = await loadConfig(options);

    // Get paths
    const schemaDir = getSchemaDirectory(config);
    const migrationsDir = getMigrationsDirectory(config);

    logSection("🔍 Analyzing Schema");

    // Parse schema files
    const currentSchema = await withProgress("Parsing Zod schemas...", () => parseSchemaFiles(schemaDir));

    logSuccess(`Found ${currentSchema.collections.size} collection(s)`);

    // Load previous snapshot from migrations directory
    logInfo("Loading previous snapshot...");
    const previousSnapshot = loadSnapshotIfExists({
      migrationsPath: migrationsDir,
      workspaceRoot: process.cwd(),
    });

    if (!previousSnapshot) {
      logInfo("No previous snapshot found - treating as empty database (first-time generation)");
    } else {
      logSuccess("Loaded previous snapshot as base reference");
    }

    // Compare schemas
    logSection("📊 Comparing Schemas");
    const diff = compare(currentSchema, previousSnapshot);

    // Check if there are any changes
    if (!hasChanges(diff)) {
      logInfo("No changes detected");
      console.log();
      logSuccess("Schema is up to date!");
      return;
    }

    // Display change summary
    console.log();
    console.log(formatChangeSummary(diff));

    // Handle destructive changes
    if (!handleDestructiveChanges(diff, config, options.force)) {
      process.exit(1);
    }

    // Generate migration
    logSection("📝 Generating Migration");

    const migrationPath = await withProgress("Creating migration file...", () =>
      Promise.resolve(generate(diff, migrationsDir))
    );

    logSuccess(`Migration file created: ${path.basename(migrationPath)}`);

    // Note: Snapshot is embedded in the generated migration file
    // No separate snapshot file needed

    // Display next steps
    logSection("✅ Next Steps");
    console.log();
    console.log("  1. Review the generated migration file:");
    console.log(`     ${migrationPath}`);
    console.log();
    console.log("  2. Apply the migration by running PocketBase:");
    console.log("     yarn pb");
    console.log();
    console.log("  Or apply migrations manually:");
    console.log("     cd pb && ./pocketbase migrate up");
    console.log();
  } catch (error) {
    // Handle specific error types with helpful messages
    if (error instanceof SchemaParsingError) {
      logError("Schema Parsing Error");
      console.error();
      console.error(error.getDetailedMessage());
      console.error();
      logInfo("Suggestions:");
      console.log("  • Make sure your schema files are valid Zod schemas");
      console.log('  • Run "yarn build" in the shared workspace to compile TypeScript files');
      console.log('  • Check that schema files export schemas ending with "Schema" or "InputSchema"');
    } else if (error instanceof SnapshotError) {
      logError("Snapshot Error");
      console.error();
      console.error(error.getDetailedMessage());
      console.error();
      logInfo("Suggestions:");
      console.log("  • Check that the snapshot file is not corrupted");
      console.log("  • Verify file permissions for the snapshot file");
      console.log("  • If this is the first run, this error should not occur");
    } else if (error instanceof MigrationGenerationError) {
      logError("Migration Generation Error");
      console.error();
      console.error(error.getDetailedMessage());
      console.error();
      logInfo("Suggestions:");
      console.log("  • Check that the migration directory exists and is writable");
      console.log("  • Verify you have sufficient disk space");
      console.log("  • Check file permissions for the migration directory");
    } else if (error instanceof FileSystemError) {
      logError("File System Error");
      console.error();
      console.error(error.getDetailedMessage());
      console.error();
      logInfo("Suggestions:");
      console.log("  • Check file and directory permissions");
      console.log("  • Verify you have sufficient disk space");
      console.log("  • Ensure the paths are correct and accessible");
    } else if (error instanceof ConfigurationError) {
      logError("Configuration Error");
      console.error();
      console.error(error.getDetailedMessage());
      console.error();
      logInfo("Suggestions:");
      console.log("  • Check your configuration file syntax");
      console.log("  • Verify all paths are correct and accessible");
      console.log("  • Run with --verbose flag for more details");
    } else {
      // Generic error handling
      logError(`Failed to generate migration: ${error}`);
      if (error instanceof Error && error.stack) {
        console.error();
        console.error(error.stack);
      }
    }

    console.error();
    process.exit(1);
  }
}

/**
 * Creates the generate command
 *
 * @returns Commander command instance
 */
export function createGenerateCommand(): Command {
  return new Command("generate")
    .description("Generate a migration from schema changes")
    .option("-o, --output <directory>", "Output directory for migration files")
    .option("-f, --force", "Force generation even with destructive changes", false)
    .option("--dry-run", "Show what would be generated without creating files", false)
    .option("--schema-dir <directory>", "Directory containing Zod schema files")
    .addHelpText(
      "after",
      `
Examples:
  $ pocketbase-migrate generate                    Generate migration from schema changes
  $ pocketbase-migrate generate --force            Force generation with destructive changes
  $ pocketbase-migrate generate --dry-run          Preview changes without generating files
  $ pocketbase-migrate generate -o ./migrations    Specify output directory
`
    )
    .action(executeGenerate);
}
