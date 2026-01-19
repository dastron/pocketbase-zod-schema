#!/usr/bin/env node

/**
 * CLI entry point for the migration tool
 * Schema-driven PocketBase migration generator
 */

// Register tsx loader for TypeScript file support
// This must be imported first to enable TypeScript file loading via dynamic imports
// tsx/esm registers hooks that allow Node.js to handle .ts files in dynamic imports
import "tsx/esm";

import chalk from "chalk";
import { Command } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createGenerateCommand } from "./commands/generate.js";
import { createGenerateTypesCommand } from "./commands/generate-types.js";
import { createStatusCommand } from "./commands/status.js";

// Get package version from package.json
function getVersion(): string {
  try {
    // Get the directory of the current file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Resolve path to package.json (works from both src and dist)
    // From dist/cli/migrate.js -> ../../package.json
    // From src/cli/migrate.ts -> ../../package.json
    const packageJsonPath = join(__dirname, "../../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    return packageJson.version || "0.0.0";
  } catch {
    // Fallback version if package.json cannot be read
    console.warn("Warning: Could not read version from package.json");
    return "0.0.0";
  }
}

const VERSION = getVersion();

/**
 * Display banner with tool name and version
 */
function displayBanner(): void {
  console.log();
  console.log(chalk.cyan.bold("  PocketBase Zod Migration Tool"));
  console.log(chalk.gray(`  Version ${VERSION}`));
  console.log();
}

/**
 * Main CLI program
 */
const program = new Command();

// Configure main program
program
  .name("pocketbase-migrate")
  .description(
    "Schema-driven PocketBase migration tool\n\nGenerate type-safe migrations from Zod schemas for PocketBase applications."
  )
  .version(VERSION, "-v, --version", "Output the current version")
  .option("-c, --config <path>", "Path to configuration file")
  .option("--verbose", "Enable verbose output")
  .option("--quiet", "Suppress non-essential output")
  .option("--no-color", "Disable colored output")
  .hook("preAction", (thisCommand) => {
    // Handle global options before any command runs
    const opts = thisCommand.opts();

    // Handle no-color option
    if (opts.color === false) {
      chalk.level = 0;
    }

    // Display banner unless quiet mode
    if (!opts.quiet) {
      displayBanner();
    }
  });

// Add commands
program.addCommand(createGenerateCommand());
program.addCommand(createGenerateTypesCommand());
program.addCommand(createStatusCommand());

// Add examples to help output
program.addHelpText(
  "after",
  `
${chalk.bold("Examples:")}
  $ pocketbase-migrate status              Check for pending schema changes
  $ pocketbase-migrate generate            Generate migration from schema changes
  $ pocketbase-migrate generate-types      Generate TypeScript definitions
  $ pocketbase-migrate generate --force    Generate migration with destructive changes
  $ pocketbase-migrate --help              Show this help message

${chalk.bold("Configuration:")}
  The tool looks for configuration in the following order:
  1. CLI arguments (highest priority)
  2. Environment variables (MIGRATION_SCHEMA_DIR, MIGRATION_OUTPUT_DIR, etc.)
  3. Configuration file (migrate.config.js)
  4. Default values

${chalk.bold("Documentation:")}
  For more information, visit: https://github.com/dastron/pocketbase-zod-schema
`
);

// Custom error handling
program.exitOverride((err) => {
  /**
   * Commander throws on help/version when exitOverride is enabled.
   * The error codes differ by commander version (e.g. "commander.helpDisplayed").
   * Respect the exitCode whenever it is provided.
   */
  const anyErr = err as any;

  // Common help/version codes across commander versions
  if (anyErr?.code === "commander.help" || anyErr?.code === "commander.helpDisplayed") {
    process.exit(0);
  }
  if (anyErr?.code === "commander.version") {
    process.exit(0);
  }

  // Prefer commander-provided exitCode if present
  if (typeof anyErr?.exitCode === "number") {
    process.exit(anyErr.exitCode);
  }

  process.exit(1);
});

// Display help if no command provided
if (process.argv.length === 2) {
  displayBanner();
  program.help();
}

// Parse command line arguments
program.parse(process.argv);
