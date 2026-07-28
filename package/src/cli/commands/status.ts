/**
 * Status command implementation
 * Shows current migration status without generating files
 */

import chalk from "chalk";
import { Command } from "commander";
import {
  AppliedMigrationsError,
  categorizeChangesBySeverity,
  compare,
  parseSchemaFiles,
  planMigrationReplay,
  readAppliedMigrationsIfPresent,
  type AppliedMigrationsSource,
  type MigrationPlan,
} from "../../migration/index.js";
import { ConfigurationError, SchemaParsingError, SnapshotError } from "../../migration/errors.js";
import { loadSnapshotWithMigrations } from "../../migration/snapshot.js";
import type { SchemaDefinition, SchemaDiff, SchemaSnapshot } from "../../migration/types.js";
import { getDataDirectory, getMigrationsDirectory, getSchemaDirectory, loadConfig } from "../utils/config.js";
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
  diff?: SchemaDiff,
  plan?: MigrationPlan | null,
  appliedDiff?: SchemaDiff | null
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
    ...(plan?.appliedKnown
      ? {
          migrations: {
            source: plan.appliedOrigin ?? "",
            applied: plan.appliedCount,
            pending: plan.pending,
            missing: plan.missing,
            outOfOrder: plan.outOfOrder,
            inSync: plan.inSync,
            ...(appliedDiff
              ? {
                  unapplied: {
                    create: appliedDiff.collectionsToCreate.length,
                    delete: appliedDiff.collectionsToDelete.length,
                    modify: appliedDiff.collectionsToModify.length,
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}

/**
 * What the applied-migrations lookup produced. `unavailable` is not an error
 * by itself — most checkouts have never run PocketBase — but it does mean
 * `--verify` has nothing to compare against.
 */
type AppliedLookup =
  | { status: "found"; applied: AppliedMigrationsSource; plan: MigrationPlan }
  | { status: "unavailable"; dataPath: string }
  | { status: "failed"; dataPath: string; message: string };

/**
 * Reads PocketBase's `_migrations` table and plans the replay against it.
 *
 * @param migrationsDir - Directory holding the migration files
 * @param dataPath - pb_data directory or data.db file
 */
function lookupAppliedMigrations(migrationsDir: string, dataPath: string): AppliedLookup {
  try {
    const applied = readAppliedMigrationsIfPresent(dataPath);
    if (!applied) {
      return { status: "unavailable", dataPath };
    }
    return { status: "found", applied, plan: planMigrationReplay(migrationsDir, { applied }) };
  } catch (error) {
    if (error instanceof AppliedMigrationsError) {
      return { status: "failed", dataPath, message: error.message };
    }
    throw error;
  }
}

/**
 * The two states `status` compares the schema against.
 */
export interface StatusBaselines {
  /** What every migration file on disk describes — the baseline `generate` uses */
  previousSnapshot: SchemaSnapshot | null;
  /**
   * The schema compared against the state PocketBase is actually in, i.e. the
   * changes the pending files still owe the database. Null when no database
   * was read or when disk and the database agree, in which case it would be
   * identical to the schema comparison.
   */
  appliedDiff: SchemaDiff | null;
}

/**
 * Reconstructs both baselines.
 *
 * Two baselines, two questions, and mixing them up is what makes `status
 * --verify` contradict `generate`:
 *
 * - every file on disk answers "does my schema still need a migration
 *   written?". Diffing against the applied-only state instead reports
 *   collections that already have a migration file waiting, and then tells the
 *   user to run `generate` — which correctly writes nothing.
 * - the applied-only state answers "is the database behind its files?", which
 *   is reported next to the drift, not as a schema change.
 *
 * @param currentSchema - Schema parsed from the Zod files
 * @param migrationsDir - Directory holding the migration files
 * @param workspaceRoot - Root used to resolve migration imports
 * @param applied - Result of the `_migrations` lookup, if one was made
 */
export function loadStatusBaselines(
  currentSchema: SchemaDefinition,
  migrationsDir: string,
  workspaceRoot: string,
  applied: AppliedLookup | null
): StatusBaselines {
  const previousSnapshot = loadSnapshotWithMigrations({
    migrationsPath: migrationsDir,
    workspaceRoot,
  });

  if (applied?.status !== "found" || applied.plan.inSync) {
    return { previousSnapshot, appliedDiff: null };
  }

  const appliedSnapshot = loadSnapshotWithMigrations({
    migrationsPath: migrationsDir,
    workspaceRoot,
    appliedMigrations: applied.applied,
  });

  return { previousSnapshot, appliedDiff: compare(currentSchema, appliedSnapshot) };
}

/**
 * Prints what the pending migration files will do to the database once
 * applied — the difference between the schema and the state PocketBase is
 * actually in.
 *
 * This is deliberately kept out of the Schema Comparison section: a collection
 * that already has a migration file waiting needs PocketBase to run, not
 * another `generate`.
 *
 * @param appliedDiff - Current schema compared against the applied-only state
 */
function reportUnappliedChanges(appliedDiff: SchemaDiff): void {
  if (!hasChanges(appliedDiff)) {
    return;
  }

  console.log(chalk.gray("  The database is behind those files. Applying them will:"));

  for (const collection of appliedDiff.collectionsToCreate) {
    console.log(chalk.gray(`    + create ${collection.name} (${collection.type})`));
  }
  for (const mod of appliedDiff.collectionsToModify) {
    console.log(chalk.gray(`    ~ modify ${mod.collection}`));
  }
  for (const collection of appliedDiff.collectionsToDelete) {
    console.log(chalk.gray(`    - delete ${collection.name}`));
  }

  console.log();
  console.log(chalk.gray("    Start PocketBase to apply them; no new migration is needed."));
  console.log();
}

/**
 * Prints the disk vs. `_migrations` comparison.
 *
 * @returns True when disk and database agree
 */
function reportAppliedMigrations(plan: MigrationPlan): boolean {
  logSection("🧾 Applied Migrations");
  console.log();
  logKeyValue("Database", plan.appliedOrigin ?? "unknown");
  logKeyValue("Applied", String(plan.appliedCount));
  logKeyValue("Replaying", String(plan.filesToReplay.length));
  console.log();

  if (plan.inSync) {
    logSuccess("✓ Every migration file on disk is applied");
    return true;
  }

  if (plan.pending.length > 0) {
    console.log(chalk.yellow(`  ${plan.pending.length} migration(s) on disk not applied to the database:`));
    for (const file of plan.pending) {
      console.log(chalk.yellow(`    + ${file}`));
    }
    console.log();
  }

  if (plan.missing.length > 0) {
    console.log(chalk.red(`  ${plan.missing.length} applied migration(s) missing from disk:`));
    for (const file of plan.missing) {
      console.log(chalk.red(`    - ${file}`));
    }
    console.log();
  }

  if (plan.outOfOrder.length > 0) {
    console.log(chalk.yellow("  Pending migrations authored before an already-applied one:"));
    for (const file of plan.outOfOrder) {
      console.log(chalk.yellow(`    ! ${file}`));
    }
    console.log(chalk.gray("    They will be applied after migrations with later timestamps."));
    console.log();
  }

  return false;
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

    // Reconstruct state from what PocketBase has actually applied, rather
    // than from every file on disk, when a database is available to ask
    const useAppliedMigrations = options.verify === true || typeof options.pbData === "string";
    const applied: AppliedLookup | null = useAppliedMigrations
      ? lookupAppliedMigrations(migrationsDir, getDataDirectory(config))
      : null;

    if (applied?.status === "failed") {
      logError(`Could not read applied migrations: ${applied.message}`);
      process.exit(1);
    }

    if (applied?.status === "unavailable") {
      logError(`No PocketBase database found at ${applied.dataPath}`);
      console.error();
      logInfo("Suggestions:");
      console.log("  • Start PocketBase once so it creates pb_data/data.db");
      console.log("  • Point at another location with --pb-data <path>");
      process.exit(1);
    }

    logInfo("Loading previous snapshot...");
    const { previousSnapshot, appliedDiff } = loadStatusBaselines(currentSchema, migrationsDir, process.cwd(), applied);

    // Drift is reported before the schema comparison, and fails the command
    // when it was explicitly asked for — but the rest of the status still
    // prints, because knowing what else changed is the point of running it
    if (applied?.status === "found" && !isJsonMode) {
      const inSync = reportAppliedMigrations(applied.plan);
      if (!inSync) {
        if (appliedDiff) {
          reportUnappliedChanges(appliedDiff);
        }
        if (options.verify === true) {
          process.exitCode = 1;
        }
      }
    } else if (applied?.status === "found" && !applied.plan.inSync && options.verify === true) {
      process.exitCode = 1;
    }

    // Handle first-time setup
    if (!previousSnapshot) {
      if (isJsonMode) {
        const output = createStatusOutput(
          "first-time-setup",
          currentSchema.collections.size,
          0,
          undefined,
          applied?.status === "found" ? applied.plan : null,
          appliedDiff
        );
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

    // Compare schemas against the migration files, not against the database:
    // this section answers "what still needs a migration written?"
    logSection("📊 Schema Comparison");
    if (appliedDiff && !isJsonMode) {
      console.log(chalk.gray("  Compared against the migration files on disk, the same baseline generate uses."));
    }
    const diff = compare(currentSchema, previousSnapshot);

    // Check if there are any changes
    if (!hasChanges(diff)) {
      if (isJsonMode) {
        const output = createStatusOutput(
          "up-to-date",
          currentSchema.collections.size,
          previousSnapshot.collections.size,
          diff,
          applied?.status === "found" ? applied.plan : null,
          appliedDiff
        );
        console.log(formatStatusJson(output));
        return;
      }

      console.log();
      logSuccess("✓ Schema is in sync with the migration files");
      logInfo("No pending changes detected");
      console.log();
      logKeyValue("Collections", String(currentSchema.collections.size));

      if (appliedDiff && hasChanges(appliedDiff)) {
        console.log();
        logInfo("The database is still behind those files — see Applied Migrations above.");
      }
      return;
    }

    // Handle JSON output mode
    if (isJsonMode) {
      const output = createStatusOutput(
        "changes-pending",
        currentSchema.collections.size,
        previousSnapshot.collections.size,
        diff,
        applied?.status === "found" ? applied.plan : null,
        appliedDiff
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
    .option(
      "--verify",
      "Compare the migration files on disk against PocketBase's _migrations table and fail on any drift"
    )
    .option("--pb-data <path>", "PocketBase data directory or data.db file (defaults to pb_data next to migrations)")
    .addHelpText(
      "after",
      `
Examples:
  $ pocketbase-migrate status              Check for pending schema changes
  $ pocketbase-migrate status --json       Output status as JSON
  $ pocketbase-migrate status --verbose    Show detailed status information
  $ pocketbase-migrate status --verify     Fail if disk and the database disagree on applied migrations
`
    )
    .action(executeStatus);
}
