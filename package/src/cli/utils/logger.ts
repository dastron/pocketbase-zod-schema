/**
 * Logging utilities for CLI output
 * Provides colored console output and formatting helpers
 */

import chalk from "chalk";
import ora, { type Ora } from "ora";
import type { FieldChange, SchemaDiff } from "../../migration/types.js";

/**
 * Verbosity levels for logging
 */
export type VerbosityLevel = "quiet" | "normal" | "verbose";

/**
 * Current verbosity level
 */
let currentVerbosity: VerbosityLevel = "normal";

/**
 * Sets the verbosity level for logging
 *
 * @param level - Verbosity level to set
 */
export function setVerbosity(level: VerbosityLevel): void {
  currentVerbosity = level;
}

/**
 * Gets the current verbosity level
 *
 * @returns Current verbosity level
 */
export function getVerbosity(): VerbosityLevel {
  return currentVerbosity;
}

/**
 * Checks if output should be shown based on verbosity
 *
 * @param requiredLevel - Minimum verbosity level required
 * @returns True if output should be shown
 */
function shouldLog(requiredLevel: VerbosityLevel): boolean {
  const levels: VerbosityLevel[] = ["quiet", "normal", "verbose"];
  const currentIndex = levels.indexOf(currentVerbosity);
  const requiredIndex = levels.indexOf(requiredLevel);
  return currentIndex >= requiredIndex;
}

/**
 * Creates a spinner for long-running operations
 *
 * @param text - Initial spinner text
 * @returns Ora spinner instance
 */
export function createSpinner(text: string): Ora {
  // In quiet mode, create a silent spinner
  if (currentVerbosity === "quiet") {
    return ora({ text, isSilent: true });
  }
  return ora(text);
}

/**
 * Logs a success message in green
 *
 * @param message - Message to log
 */
export function logSuccess(message: string): void {
  if (shouldLog("normal")) {
    console.log(chalk.green("✓"), message);
  }
}

/**
 * Logs an error message in red
 * Always shown regardless of verbosity level
 *
 * @param message - Message to log
 */
export function logError(message: string): void {
  console.error(chalk.red("✗"), message);
}

/**
 * Logs a warning message in yellow
 *
 * @param message - Message to log
 */
export function logWarning(message: string): void {
  if (shouldLog("normal")) {
    console.warn(chalk.yellow("⚠"), message);
  }
}

/**
 * Logs an info message in blue
 *
 * @param message - Message to log
 */
export function logInfo(message: string): void {
  if (shouldLog("normal")) {
    console.log(chalk.blue("ℹ"), message);
  }
}

/**
 * Logs a debug message in gray
 * Only shown in verbose mode
 *
 * @param message - Message to log
 */
export function logDebug(message: string): void {
  if (shouldLog("verbose")) {
    console.log(chalk.gray("⚙"), chalk.gray(message));
  }
}

/**
 * Logs a section header
 *
 * @param title - Section title
 */
export function logSection(title: string): void {
  if (shouldLog("normal")) {
    console.log();
    console.log(chalk.bold.cyan(title));
    console.log(chalk.cyan("─".repeat(title.length)));
  }
}

/**
 * Formats a field change for display
 *
 * @param change - Field change object
 * @returns Formatted string
 */
function formatFieldChange(change: FieldChange): string {
  const oldValue = change.oldValue === null ? "null" : JSON.stringify(change.oldValue);
  const newValue = change.newValue === null ? "null" : JSON.stringify(change.newValue);

  return `${change.property}: ${chalk.red(oldValue)} → ${chalk.green(newValue)}`;
}

/**
 * Formats a change summary for display
 * Creates a formatted, colored summary of detected changes
 *
 * @param diff - Schema diff containing all changes
 * @returns Formatted summary string
 */
export function formatChangeSummary(diff: SchemaDiff): string {
  const lines: string[] = [];

  // Count total changes
  const totalCollectionsToCreate = diff.collectionsToCreate.length;
  const totalCollectionsToDelete = diff.collectionsToDelete.length;
  const totalCollectionsToModify = diff.collectionsToModify.length;

  const totalChanges = totalCollectionsToCreate + totalCollectionsToDelete + totalCollectionsToModify;

  if (totalChanges === 0) {
    return chalk.gray("No changes detected");
  }

  lines.push(chalk.bold(`Found ${totalChanges} collection change(s):`));
  lines.push("");

  // New collections
  if (totalCollectionsToCreate > 0) {
    lines.push(chalk.green.bold(`✓ ${totalCollectionsToCreate} collection(s) to create:`));
    for (const collection of diff.collectionsToCreate) {
      lines.push(chalk.green(`  + ${collection.name} (${collection.type})`));
      lines.push(chalk.gray(`    ${collection.fields.length} field(s)`));
    }
    lines.push("");
  }

  // Deleted collections
  if (totalCollectionsToDelete > 0) {
    lines.push(chalk.red.bold(`✗ ${totalCollectionsToDelete} collection(s) to delete:`));
    for (const collection of diff.collectionsToDelete) {
      lines.push(chalk.red(`  - ${collection.name}`));
    }
    lines.push("");
  }

  // Modified collections
  if (totalCollectionsToModify > 0) {
    lines.push(chalk.yellow.bold(`⚡ ${totalCollectionsToModify} collection(s) to modify:`));

    for (const modification of diff.collectionsToModify) {
      lines.push(chalk.yellow(`  ~ ${modification.collection}`));

      // Fields to add
      if (modification.fieldsToAdd.length > 0) {
        lines.push(chalk.green(`    + ${modification.fieldsToAdd.length} field(s) to add:`));
        for (const field of modification.fieldsToAdd) {
          lines.push(chalk.green(`      + ${field.name} (${field.type})`));
        }
      }

      // Fields to remove
      if (modification.fieldsToRemove.length > 0) {
        lines.push(chalk.red(`    - ${modification.fieldsToRemove.length} field(s) to remove:`));
        for (const field of modification.fieldsToRemove) {
          lines.push(chalk.red(`      - ${field.name}`));
        }
      }

      // Fields to modify
      if (modification.fieldsToModify.length > 0) {
        lines.push(chalk.yellow(`    ~ ${modification.fieldsToModify.length} field(s) to modify:`));
        for (const fieldMod of modification.fieldsToModify) {
          lines.push(chalk.yellow(`      ~ ${fieldMod.fieldName}`));
          for (const change of fieldMod.changes) {
            lines.push(chalk.gray(`        ${formatFieldChange(change)}`));
          }
        }
      }

      // Indexes
      if (modification.indexesToAdd.length > 0) {
        lines.push(chalk.green(`    + ${modification.indexesToAdd.length} index(es) to add`));
      }

      if (modification.indexesToRemove.length > 0) {
        lines.push(chalk.red(`    - ${modification.indexesToRemove.length} index(es) to remove`));
      }

      // Rules
      if (modification.rulesToUpdate.length > 0) {
        lines.push(chalk.yellow(`    ~ ${modification.rulesToUpdate.length} rule(s) to update`));
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Displays a progress indicator for a long operation
 *
 * @param message - Progress message
 * @param operation - Async operation to perform
 * @returns Result of the operation
 */
export async function withProgress<T>(message: string, operation: () => Promise<T>): Promise<T> {
  const spinner = createSpinner(message).start();

  try {
    const result = await operation();
    spinner.succeed();
    return result;
  } catch (error) {
    spinner.fail();
    throw error;
  }
}

/**
 * Logs a step in a multi-step process
 *
 * @param step - Current step number
 * @param total - Total number of steps
 * @param message - Step description
 */
export function logStep(step: number, total: number, message: string): void {
  if (shouldLog("normal")) {
    const progress = chalk.gray(`[${step}/${total}]`);
    console.log(progress, message);
  }
}

/**
 * Logs a list of items with bullet points
 *
 * @param items - Items to list
 * @param indent - Indentation level (default: 2)
 */
export function logList(items: string[], indent: number = 2): void {
  if (shouldLog("normal")) {
    const padding = " ".repeat(indent);
    for (const item of items) {
      console.log(`${padding}• ${item}`);
    }
  }
}

/**
 * Logs a key-value pair
 *
 * @param key - Key name
 * @param value - Value to display
 * @param indent - Indentation level (default: 2)
 */
export function logKeyValue(key: string, value: string, indent: number = 2): void {
  if (shouldLog("normal")) {
    const padding = " ".repeat(indent);
    console.log(`${padding}${chalk.gray(key + ":")} ${value}`);
  }
}

/**
 * Logs a table of data
 *
 * @param headers - Column headers
 * @param rows - Data rows
 */
export function logTable(headers: string[], rows: string[][]): void {
  if (!shouldLog("normal")) return;

  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxRowWidth = Math.max(...rows.map((r) => (r[i] || "").length));
    return Math.max(h.length, maxRowWidth);
  });

  // Print header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join("  ");
  console.log(chalk.bold(headerLine));
  console.log(chalk.gray("─".repeat(headerLine.length)));

  // Print rows
  for (const row of rows) {
    const rowLine = row.map((cell, i) => (cell || "").padEnd(widths[i])).join("  ");
    console.log(rowLine);
  }
}

/**
 * Logs a box with a title and content
 *
 * @param title - Box title
 * @param content - Box content (array of lines)
 */
export function logBox(title: string, content: string[]): void {
  if (!shouldLog("normal")) return;

  const maxWidth = Math.max(title.length, ...content.map((c) => c.length));
  const border = "─".repeat(maxWidth + 2);

  console.log();
  console.log(chalk.cyan(`┌${border}┐`));
  console.log(chalk.cyan("│ ") + chalk.bold(title.padEnd(maxWidth)) + chalk.cyan(" │"));
  console.log(chalk.cyan(`├${border}┤`));
  for (const line of content) {
    console.log(chalk.cyan("│ ") + line.padEnd(maxWidth) + chalk.cyan(" │"));
  }
  console.log(chalk.cyan(`└${border}┘`));
}

/**
 * Creates a progress bar string
 *
 * @param current - Current progress value
 * @param total - Total value
 * @param width - Bar width in characters (default: 20)
 * @returns Formatted progress bar string
 */
export function createProgressBar(current: number, total: number, width: number = 20): string {
  const percentage = Math.min(100, Math.round((current / total) * 100));
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;

  const bar = chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(empty));
  return `${bar} ${percentage}%`;
}

/**
 * Logs a timestamp with a message
 *
 * @param message - Message to log
 */
export function logTimestamp(message: string): void {
  if (shouldLog("verbose")) {
    const timestamp = new Date().toISOString();
    console.log(chalk.gray(`[${timestamp}]`), message);
  }
}

/**
 * Formats a duration in milliseconds to a human-readable string
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Logs a timed operation result
 *
 * @param message - Operation description
 * @param startTime - Start time from Date.now()
 */
export function logTimed(message: string, startTime: number): void {
  if (shouldLog("normal")) {
    const duration = Date.now() - startTime;
    console.log(chalk.green("✓"), message, chalk.gray(`(${formatDuration(duration)})`));
  }
}

/**
 * Status output interface for JSON output mode
 */
export interface StatusOutput {
  status: "up-to-date" | "changes-pending" | "first-time-setup";
  collections: {
    current: number;
    snapshot: number;
  };
  changes: {
    create: number;
    delete: number;
    modify: number;
  };
  destructive: boolean;
}

/**
 * Formats status output as JSON
 *
 * @param output - Status output object
 * @returns JSON string
 */
export function formatStatusJson(output: StatusOutput): string {
  return JSON.stringify(output, null, 2);
}
