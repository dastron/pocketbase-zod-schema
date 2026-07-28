/**
 * Lint command implementation
 *
 * Checks migration files for constructs that work in the simulation engine
 * (and in Node) but not in the goja runtime PocketBase actually uses. A file
 * that replays cleanly here can still fail `pocketbase migrate up`; this is
 * the pass that says so before it happens.
 */

import chalk from "chalk";
import { Command } from "commander";
import * as path from "path";
import { ConfigurationError } from "../../migration/errors.js";
import {
  CollectionStore,
  discoverMigrations,
  executeMigrationFile,
  formatGojaLintFinding,
  lintMigrationFile,
  type EngineWarning,
  type GojaLintResult,
} from "../../migration/index.js";
import { getMigrationsDirectory, loadConfig } from "../utils/config.js";
import { logDebug, logError, logInfo, logSection, logSuccess, logWarning, setVerbosity } from "../utils/logger.js";

/**
 * Executes each file so the APIs that resolve to inert stubs are recorded,
 * and folds those warnings into the lint findings.
 *
 * Failures are swallowed: a migration the engine cannot run is a separate
 * problem, reported by generate/status, and it must not stop the lint from
 * reporting what it did find.
 *
 * @param files - Migration files, in the order they would be applied
 * @returns Warnings per file path
 */
function collectExecutionWarnings(files: string[]): Map<string, EngineWarning[]> {
  const byFile = new Map<string, EngineWarning[]>();
  const store = new CollectionStore();

  for (const file of files) {
    try {
      const result = executeMigrationFile(file, store);
      byFile.set(file, result.warnings);
    } catch (error) {
      logDebug(`Skipping execution of ${path.basename(file)}: ${error}`);
      byFile.set(file, []);
    }
  }

  return byFile;
}

/**
 * Prints one file's findings
 *
 * @returns True if the file has no error-severity findings
 */
function reportResult(result: GojaLintResult): boolean {
  const name = path.basename(result.file);

  if (result.findings.length === 0) {
    logDebug(`✓ ${name}`);
    return true;
  }

  const errors = result.findings.filter((finding) => finding.severity === "error");
  const warnings = result.findings.filter((finding) => finding.severity === "warning");

  console.log(errors.length > 0 ? chalk.red(`  ✗ ${name}`) : chalk.yellow(`  ! ${name}`));
  for (const finding of errors) {
    console.log(chalk.red(`      ${formatGojaLintFinding({ ...finding, file: name })}`));
  }
  for (const finding of warnings) {
    console.log(chalk.yellow(`      ${formatGojaLintFinding({ ...finding, file: name })}`));
  }

  return errors.length === 0;
}

/**
 * Executes the lint command
 *
 * @param files - Explicit files to lint; defaults to the migrations directory
 * @param options - Command options
 */
export async function executeLint(files: string[], options: any): Promise<void> {
  try {
    const parentOpts = options.parent?.opts?.() || {};
    if (parentOpts.verbose) {
      setVerbosity("verbose");
    } else if (parentOpts.quiet) {
      setVerbosity("quiet");
    }

    const config = await loadConfig(options);
    const migrationsDir = getMigrationsDirectory(config);

    const targets =
      files.length > 0
        ? files.map((file) => path.resolve(process.cwd(), file))
        : discoverMigrations(migrationsDir).map((migration) => migration.path);

    logSection("🔎 Checking goja Compatibility");
    console.log();

    if (targets.length === 0) {
      logInfo(`No migration files found in ${migrationsDir}`);
      return;
    }

    // Stubbed-API warnings only exist once a file has run
    const warningsByFile =
      options.execute === false ? new Map<string, EngineWarning[]>() : collectExecutionWarnings(targets);

    const results = targets.map((file) => lintMigrationFile(file, { warnings: warningsByFile.get(file) }));
    const failed = results.filter((result) => !reportResult(result));
    const warned = results.filter(
      (result) => result.ok && result.findings.some((finding) => finding.severity === "warning")
    );

    console.log();

    if (failed.length > 0) {
      logError(
        `${failed.length} of ${results.length} migration(s) use JavaScript PocketBase's runtime does not support`
      );
      console.log();
      logInfo("Suggestions:");
      console.log("  • Replace Node-only globals with PocketBase JSVM bindings ($os, $http, $filesystem)");
      console.log("  • Rewrite async/await as synchronous code — goja migrations run to completion inline");
      console.log("  • Avoid class fields and private members; assign in the constructor instead");
      console.log();
      process.exit(1);
    }

    if (warned.length > 0) {
      logWarning(`${warned.length} migration(s) call APIs the simulation does not model (listed above)`);
      console.log();
    }

    logSuccess(`${results.length} migration(s) are goja-compatible`);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      logError("Configuration Error");
      console.error();
      console.error(error.getDetailedMessage());
    } else {
      logError(`Failed to lint migrations: ${error}`);
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
    }
    process.exit(1);
  }
}

/**
 * Creates the lint command
 *
 * @returns Commander command instance
 */
export function createLintCommand(): Command {
  return new Command("lint")
    .description("Check migration files for JavaScript PocketBase's goja runtime cannot run")
    .argument("[files...]", "Migration files to lint (defaults to every file in the migrations directory)")
    .option("-o, --output <directory>", "Directory containing migration files")
    .option("--no-execute", "Skip executing the migrations, reporting only what static analysis finds")
    .addHelpText(
      "after",
      `
Examples:
  $ pocketbase-migrate lint                              Lint every migration
  $ pocketbase-migrate lint pb_migrations/1712_seed.js   Lint one file
  $ pocketbase-migrate lint --no-execute                 Static checks only
`
    )
    .action(executeLint);
}
