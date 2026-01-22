/**
 * Status command implementation
 * Shows current migration status without generating files
 */

import chalk from "chalk";
import { Command } from "commander";
import { categorizeChangesBySeverity, compare, parseSchemaFiles } from "../../migration/index.js";
import { ConfigurationError, SchemaParsingError, SnapshotError } from "../../migration/errors.js";
import { loadSnapshotWithMigrations } from "../../migration/snapshot.js";
import type { SchemaDefinition, SchemaDiff } from "../../migration/types.js";
import { getMigrationsDirectory, getSchemaDirectory, loadConfig } from "../utils/config.js";
import {
  formatChangeSummary,
  formatStatusJson,
  logDebug,
  logError,
  logInfo,
  logKeyValue,
  logSection,
  logSuccess,
  logTable,
  setVerbosity,
  withProgress,
  type StatusOutput,
} from "../utils/logger.js";

/**
 * Checks if there are any changes in the diff
 *
 * @param diff - Schema diff to check
 * @returns True if there are changes
 */
function hasChanges(diff: SchemaDiff): boolean {
  return (
    diff.collectionsToCreate.length > 0 || diff.collectionsToDelete.length > 0 || diff.collectionsToModify.length > 0
  );
}

/**
 * Checks if there are any destructive changes
 *
 * @param diff - Schema diff to check
 * @returns True if there are destructive changes
 */
function hasDestructiveChanges(diff: SchemaDiff): boolean {
  const { destructive } = categorizeChangesBySeverity(diff);
  return destructive.length > 0;
}

/**
 * Creates a status output object for JSON mode
 *
 * @param status - Status type
 * @param currentCount - Current schema collection count
 * @param snapshotCount - Snapshot collection count
 * @param diff - Schema diff (optional)
 * @returns Status output object
 */
function createStatusOutput(
  status: StatusOutput["status"],
  currentCount: number,
  snapshotCount: number,
  diff?: SchemaDiff
): StatusOutput {
  return {
    status,
    collections: {
      current: currentCount,
      snapshot: snapshotCount,
    },
    changes: {
      create: diff?.collectionsToCreate.length ?? 0,
      delete: diff?.collectionsToDelete.length ?? 0,
      modify: diff?.collectionsToModify.length ?? 0,
    },
    destructive: diff ? hasDestructiveChanges(diff) : false,
  };
}

/**
 * Displays destructive changes summary
 *
 * @param diff - Schema diff containing changes
 */
function displayDestructiveChangesSummary(diff: SchemaDiff): void {
  const { destructive, nonDestructive } = categorizeChangesBySeverity(diff);

  if (destructive.length > 0) {
    logSection("⚠️  Destructive Changes");
    console.log();
    for (const change of destructive) {
      console.log(chalk.red(`  ${change}`));
    }
    console.log();
  }

  if (nonDestructive.length > 0) {
    logSection("✓ Non-Destructive Changes");
    console.log();
    for (const change of nonDestructive) {
      console.log(chalk.green(`  ${change}`));
    }
    console.log();
  }
}

/**
 * Displays a detailed change table
 *
 * @param diff - Schema diff containing changes
 */
function displayChangeTable(diff: SchemaDiff): void {
  const rows: string[][] = [];

  // Add collections to create
  for (const collection of diff.collectionsToCreate) {
    rows.push([
      chalk.green("+"),
      collection.name,
      collection.type,
      `${collection.fields.length} fields`,
      chalk.green("Create"),
    ]);
  }

  // Add collections to delete
  for (const collection of diff.collectionsToDelete) {
    rows.push([chalk.red("-"), collection.name, collection.type || "base", "-", chalk.red("Delete")]);
  }

  // Add collections to modify
  for (const mod of diff.collectionsToModify) {
    const changes: string[] = [];
    if (mod.fieldsToAdd.length > 0) changes.push(`+${mod.fieldsToAdd.length} fields`);
    if (mod.fieldsToRemove.length > 0) changes.push(`-${mod.fieldsToRemove.length} fields`);
    if (mod.fieldsToModify.length > 0) changes.push(`~${mod.fieldsToModify.length} fields`);
    if (mod.indexesToAdd.length > 0) changes.push(`+${mod.indexesToAdd.length} indexes`);
    if (mod.indexesToRemove.length > 0) changes.push(`-${mod.indexesToRemove.length} indexes`);
    if (mod.rulesToUpdate.length > 0) changes.push(`~${mod.rulesToUpdate.length} rules`);

    rows.push([chalk.yellow("~"), mod.collection, "-", changes.join(", ") || "No changes", chalk.yellow("Modify")]);
  }

  if (rows.length > 0) {
    logTable(["", "Collection", "Type", "Changes", "Action"], rows);
  }
}

/**
 * Executes the status command
 *
 * @param options - Command options
 */
export async function executeStatus(options: any): Promise<void> {
  const isJsonMode = options.json === true;

  try {
    // Set verbosity based on global options (quiet in JSON mode)
    if (isJsonMode) {
      setVerbosity("quiet");
    } else {
      const parentOpts = options.parent?.opts?.() || {};
      if (parentOpts.verbose) {
        setVerbosity("verbose");
      } else if (parentOpts.quiet) {
        setVerbosity("quiet");
      }
    }

    logDebug("Checking migration status...");
    logDebug(`Options: ${JSON.stringify(options, null, 2)}`);

    // Load configuration
    const config = await loadConfig(options);

    // Get paths
    const schemaDir = getSchemaDirectory(config);
    const migrationsDir = getMigrationsDirectory(config);

    logSection("🔍 Checking Migration Status");

    // Parse schema files with full config (including exclude patterns)
    const analyzerConfig = {
      schemaDir,
      excludePatterns: config.schema.exclude,
      useCompiledFiles: false, // Use source files since we're in development/testing
    };
    const currentSchema: SchemaDefinition = await withProgress("Parsing Zod schemas...", () => parseSchemaFiles(analyzerConfig));

    logSuccess(`Found ${currentSchema.collections.size} collection(s) in schema`);

    // Load previous snapshot from migrations directory and apply subsequent migrations
    logInfo("Loading previous snapshot...");
    const previousSnapshot = loadSnapshotWithMigrations({
      migrationsPath: migrationsDir,
      workspaceRoot: process.cwd(),
    });

    // Handle first-time setup
    if (!previousSnapshot) {
      if (isJsonMode) {
        const output = createStatusOutput("first-time-setup", currentSchema.collections.size, 0);
        console.log(formatStatusJson(output));
        return;
      }

      logSection("🆕 First-Time Setup Detected");
      console.log();
      logInfo("No previous snapshot found. This appears to be a first-time setup.");
      console.log();
      logKeyValue("Collections in schema", String(currentSchema.collections.size));
      console.log();
      logInfo('Run "pocketbase-migrate generate" to create the initial migration.');
      return;
    }

    logSuccess(`Loaded snapshot with ${previousSnapshot.collections.size} collection(s)`);

    // Compare schemas
    logSection("📊 Schema Comparison");
    const diff = compare(currentSchema, previousSnapshot);

    // Check if there are any changes
    if (!hasChanges(diff)) {
      if (isJsonMode) {
        const output = createStatusOutput(
          "up-to-date",
          currentSchema.collections.size,
          previousSnapshot.collections.size,
          diff
        );
        console.log(formatStatusJson(output));
        return;
      }

      console.log();
      logSuccess("✓ Schema is in sync with snapshot");
      logInfo("No pending changes detected");
      console.log();
      logKeyValue("Collections", String(currentSchema.collections.size));
      return;
    }

    // Handle JSON output mode
    if (isJsonMode) {
      const output = createStatusOutput(
        "changes-pending",
        currentSchema.collections.size,
        previousSnapshot.collections.size,
        diff
      );
      console.log(formatStatusJson(output));
      return;
    }

    // Display change summary
    console.log();
    console.log(formatChangeSummary(diff));

    // Display change table in verbose mode
    logDebug("Detailed change table:");
    displayChangeTable(diff);

    // Display categorized changes
    displayDestructiveChangesSummary(diff);

    // Display next steps
    logSection("📝 Next Steps");
    console.log();
    console.log("  To generate a migration for these changes, run:");
    console.log(chalk.cyan("     pocketbase-migrate generate"));
    console.log();

    const { destructive } = categorizeChangesBySeverity(diff);
    if (destructive.length > 0) {
      console.log(chalk.yellow("  ⚠️  Destructive changes detected. Use --force flag when generating:"));
      console.log(chalk.cyan("     pocketbase-migrate generate --force"));
      console.log();
    }
  } catch (error) {
    // Handle specific error types with helpful messages
    if (error instanceof SchemaParsingError) {
      logError("Schema Parsing Error");
      console.error();
      console.error(error.getDetailedMessage());
      console.error();
      logInfo("Suggestions:");
      console.log("  • Make sure your schema files are valid Zod schemas");
      console.log('  • Check that schema files export schemas ending with "Schema" or "InputSchema"');
    } else if (error instanceof SnapshotError) {
      logError("Snapshot Error");
      console.error();
      console.error(error.getDetailedMessage());
      console.error();
      logInfo("Suggestions:");
      console.log("  • Check that the snapshot file is not corrupted");
      console.log("  • Verify file permissions for the snapshot file");
    } else if (error instanceof ConfigurationError) {
      logError("Configuration Error");
      console.error();
      console.error(error.getDetailedMessage());
      console.error();
      logInfo("Suggestions:");
      console.log("  • Check your configuration file syntax");
      console.log("  • Verify all paths are correct and accessible");
    } else {
      logError(`Failed to check status: ${error}`);
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
    }
    process.exit(1);
  }
}

/**
 * Creates the status command
 *
 * @returns Commander command instance
 */
export function createStatusCommand(): Command {
  return new Command("status")
    .description("Show current migration status without generating files")
    .option("--schema-dir <directory>", "Directory containing Zod schema files")
    .option("--json", "Output status as JSON for programmatic use", false)
    .addHelpText(
      "after",
      `
Examples:
  $ pocketbase-migrate status              Check for pending schema changes
  $ pocketbase-migrate status --json       Output status as JSON
  $ pocketbase-migrate status --verbose    Show detailed status information
`
    )
    .action(executeStatus);
}
