/**
 * Generate command implementation
 * Generates migrations from schema changes
 */

import { Command } from "commander";
import * as path from "path";
import {
  ConfigurationError,
  FileSystemError,
  MigrationExecutionError,
  MigrationGenerationError,
  SchemaParsingError,
  SnapshotError,
} from "../../migration/errors.js";
import {
  CollectionStore,
  compare,
  detectDestructiveChanges,
  filterDiff,
  formatDestructiveChanges,
  formatGojaLintFinding,
  lintMigrationSource,
  parseSchemaFiles,
  planMigrations,
  replayMigrationsDirectory,
  requiresForceFlag,
  summarizeDestructiveChanges,
  verifyMigrationSources,
  writePlannedMigrations,
  type GojaLintResult,
  type MigrationRoundTripResult,
  type PlannedMigration,
} from "../../migration/index.js";
import { loadSnapshotWithMigrations } from "../../migration/snapshot.js";
import type { SchemaDefinition } from "../../migration/types.js";
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
    // This path should technically be unreachable if we filtered destructive changes when !force
    // But keeping it as a safety net
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
 * Outcome of the pre-write verification pass
 */
type VerificationOutcome =
  | { status: "verified"; count: number }
  /** The existing migrations could not be executed, so there is no baseline */
  | { status: "baseline-unexecutable"; error: MigrationExecutionError }
  | { status: "failed"; failures: MigrationRoundTripResult[] }
  /** The migration would not run in PocketBase's goja runtime */
  | { status: "incompatible"; results: GojaLintResult[] };

/**
 * Executes each planned migration's up() and down() in the simulated
 * PocketBase JSVM, starting from the state the existing migrations
 * reconstruct, and reports anything that does not roll back cleanly.
 *
 * @param planned - Migrations generated but not yet written
 * @param migrationsDir - Directory holding the existing migrations
 * @returns What the verification found (rendered by reportVerification)
 */
function verifyPlannedMigrations(planned: PlannedMigration[], migrationsDir: string): VerificationOutcome {
  // Executing in the engine proves nothing about goja, which is what will
  // actually run the file — so check compatibility before round-tripping
  const lintResults = planned.map((migration) => lintMigrationSource(migration.content, { file: migration.filename }));
  const incompatible = lintResults.filter((result) => !result.ok);
  if (incompatible.length > 0) {
    return { status: "incompatible", results: incompatible };
  }

  let baseline: CollectionStore;
  try {
    baseline = replayMigrationsDirectory(migrationsDir)?.store ?? new CollectionStore();
  } catch (error) {
    if (error instanceof MigrationExecutionError) {
      return { status: "baseline-unexecutable", error };
    }
    throw error;
  }

  const report = verifyMigrationSources(
    planned.map((migration) => ({ file: migration.filename, source: migration.content })),
    { initialStore: baseline }
  );

  return report.ok
    ? { status: "verified", count: report.results.length }
    : { status: "failed", failures: report.failures };
}

/**
 * Prints a verification outcome
 *
 * @returns True if generation should proceed
 */
function reportVerification(outcome: VerificationOutcome): boolean {
  if (outcome.status === "verified") {
    logSuccess(`Verified ${outcome.count} migration(s): up and down both apply and the state round-trips`);
    return true;
  }

  if (outcome.status === "incompatible") {
    logError("Generated migration uses JavaScript PocketBase cannot run - no files were written.");
    console.log();
    for (const result of outcome.results) {
      for (const finding of result.findings.filter((entry) => entry.severity === "error")) {
        console.log(`  ${formatGojaLintFinding(finding)}`);
      }
    }
    console.log();
    logInfo("This is a bug in the generator - please report it with the schema that produced it.");
    return false;
  }

  if (outcome.status === "baseline-unexecutable") {
    logError("Cannot verify: an existing migration could not be executed.");
    console.error();
    console.error(outcome.error.getDetailedMessage());
    console.error();
    logInfo("Fix the migration above, or run without --verify.");
    return false;
  }

  logError("Migration verification failed - no files were written.");
  console.log();

  for (const failure of outcome.failures) {
    if (failure.error) {
      console.log(`  ${failure.file}: ${failure.error.phase}() failed`);
      console.log(`    ${failure.error.message}`);
      continue;
    }

    const reason = failure.missingDown ? "no down() to undo it" : "down() did not restore the previous state";
    console.log(`  ${failure.file}: ${reason}`);
    for (const difference of failure.differences) {
      console.log(`    ${difference.message}`);
    }
  }

  console.log();
  logInfo("Suggestions:");
  console.log("  • Re-run with --no-verify to write the migration(s) anyway");
  console.log("  • Report the differences above if the migration was generated from a Zod schema");
  return false;
}

/**
 * Executes the generate command
 *
 * @param filters - Optional filters for collection/field names
 * @param options - Command options
 */
export async function executeGenerate(filters: string[], options: any): Promise<void> {
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
    if (filters && filters.length > 0) {
      logDebug(`Filters: ${JSON.stringify(filters)}`);
    }

    // Load configuration
    const config = await loadConfig(options);

    // Get paths
    const schemaDir = getSchemaDirectory(config);
    const migrationsDir = getMigrationsDirectory(config);

    logSection("🔍 Analyzing Schema");

    // Parse schema files with full config (including exclude patterns)
    const analyzerConfig = {
      schemaDir,
      excludePatterns: config.schema.exclude,
      useCompiledFiles: false, // Use source files since we're in development/testing
    };
    const currentSchema: SchemaDefinition = await withProgress("Parsing Zod schemas...", () =>
      parseSchemaFiles(analyzerConfig)
    );

    logSuccess(`Found ${currentSchema.collections.size} collection(s)`);

    // Load previous snapshot from migrations directory and apply subsequent migrations
    logInfo("Loading previous snapshot...");
    const previousSnapshot = loadSnapshotWithMigrations({
      migrationsPath: migrationsDir,
    });

    if (!previousSnapshot) {
      logInfo("No previous snapshot found - treating as empty database (first-time generation)");
    } else {
      logSuccess("Loaded previous snapshot as base reference");
    }

    // Compare schemas
    logSection("📊 Comparing Schemas");
    let diff = compare(currentSchema, previousSnapshot);

    // Apply filtering (patterns and destructive skipping)
    const skipDestructive = !options.force;

    // Check for destructive changes BEFORE filtering if we are going to skip them (for logging)
    // Only if we are NOT forcing.
    if (skipDestructive) {
      const destructive = detectDestructiveChanges(diff);
      if (destructive.length > 0) {
        logInfo(`ℹ️  Omitting ${destructive.length} destructive change(s) because --force is not set.`);
      }
    }

    // Apply filter
    diff = filterDiff(diff, {
      patterns: filters,
      skipDestructive: skipDestructive,
    });

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
    // If skipDestructive was true, diff shouldn't have any destructive changes, so this will pass.
    // If force was true, skipDestructive was false, diff might have destructive changes, this will warn and proceed.
    if (!handleDestructiveChanges(diff, config, options.force)) {
      process.exit(1);
    }

    // Generate migration
    logSection("📝 Generating Migration");

    const planned = await withProgress("Creating migration file...", () =>
      Promise.resolve(planMigrations(diff, { migrationDir: migrationsDir, force: options.force }))
    );

    if (planned.length === 0) {
      logWarning("No migration files were generated (no changes detected or duplicate migration).");
      return;
    }

    // Self-verify before writing: execute up() and down() in the simulated
    // PocketBase JSVM and confirm the state round-trips
    if (config.migrations.verify) {
      logSection("🔁 Verifying Migration");

      const outcome = await withProgress("Executing up() and down()...", () =>
        Promise.resolve(verifyPlannedMigrations(planned, migrationsDir))
      );

      if (!reportVerification(outcome)) {
        console.error();
        process.exit(1);
      }
    }

    const migrationPaths = writePlannedMigrations(planned, migrationsDir);

    if (migrationPaths.length === 1) {
      logSuccess(`Migration file created: ${path.basename(migrationPaths[0])}`);
    } else {
      logSuccess(`Created ${migrationPaths.length} migration files`);
    }

    // Note: Snapshot is embedded in the generated migration file
    // No separate snapshot file needed

    // Display next steps
    logSection("✅ Next Steps");
    console.log();
    console.log("  1. Review the generated migration file(s):");
    migrationPaths.forEach((migrationPath: string) => {
      console.log(`     ${migrationPath}`);
    });
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
      console.log('  • Check that each schema file exports a defineCollection()/defineView() result (default export preferred)');
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
    .argument("[filters...]", "Filter migrations by collection or field name (regex supported)")
    .option("-o, --output <directory>", "Output directory for migration files")
    .option("-f, --force", "Force generation even with destructive changes or duplicates", false)
    .option("--dry-run", "Show what would be generated without creating files", false)
    .option("--schema-dir <directory>", "Directory containing Zod schema files")
    .option("--verify", "Execute up() and down() before writing, and refuse migrations that do not roll back")
    .option("--no-verify", "Skip round-trip verification even when it is enabled in the configuration")
    .addHelpText(
      "after",
      `
Examples:
  $ pocketbase-migrate generate                    Generate migration from schema changes
  $ pocketbase-migrate generate User               Generate migration only for User collection
  $ pocketbase-migrate generate User.name          Generate migration only for User.name field
  $ pocketbase-migrate generate --force            Force generation with destructive changes
  $ pocketbase-migrate generate --dry-run          Preview changes without generating files
  $ pocketbase-migrate generate --verify           Verify up() and down() round-trip before writing
  $ pocketbase-migrate generate -o ./migrations    Specify output directory
`
    )
    .action(executeGenerate);
}
