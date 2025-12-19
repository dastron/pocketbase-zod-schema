#!/usr/bin/env node

/**
 * CLI entry point for the migration tool
 * Schema-driven PocketBase migration generator
 */

import { Command } from "commander";
import chalk from "chalk";
import { createGenerateCommand } from "./commands/generate.js";
import { createStatusCommand } from "./commands/status.js";

// Package version - will be replaced during build
const VERSION = "0.1.0";

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
  .description("Schema-driven PocketBase migration tool\n\nGenerate type-safe migrations from Zod schemas for PocketBase applications.")
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
program.addCommand(createStatusCommand());

// Add examples to help output
program.addHelpText("after", `
${chalk.bold("Examples:")}
  $ pocketbase-migrate status              Check for pending schema changes
  $ pocketbase-migrate generate            Generate migration from schema changes
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
`);

// Custom error handling
program.exitOverride((err) => {
  if (err.code === "commander.help") {
    process.exit(0);
  }
  if (err.code === "commander.version") {
    process.exit(0);
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
