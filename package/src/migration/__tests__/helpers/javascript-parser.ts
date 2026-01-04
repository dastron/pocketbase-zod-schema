/**
 * JavaScript parser utility for validating generated migration syntax
 * Uses @babel/parser to verify JavaScript syntax validity
 */

import type { ParserOptions } from "@babel/parser";
import { parse } from "@babel/parser";

/**
 * Parser configuration for PocketBase migration files
 */
const MIGRATION_PARSER_OPTIONS: ParserOptions = {
  sourceType: "module",
  allowReturnOutsideFunction: false,
  allowImportExportEverywhere: false,
  allowAwaitOutsideFunction: false,
  allowSuperOutsideMethod: false,
  allowUndeclaredExports: false,
  strictMode: false,
};

/**
 * Parses JavaScript code and returns whether it's syntactically valid
 *
 * @param code - JavaScript code to parse
 * @returns Object with success flag and optional error message
 */
export function parseJavaScript(code: string): { success: boolean; error?: string } {
  try {
    parse(code, MIGRATION_PARSER_OPTIONS);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Validates that a migration file is syntactically valid JavaScript
 *
 * @param migrationContent - Full migration file content
 * @returns Object with success flag and optional error message
 */
export function validateMigrationSyntax(migrationContent: string): { success: boolean; error?: string } {
  return parseJavaScript(migrationContent);
}

/**
 * Extracts the up migration function body from a migration file
 *
 * @param migrationContent - Full migration file content
 * @returns The up migration function body or null if not found
 */
export function extractUpMigration(migrationContent: string): string | null {
  const upMatch = migrationContent.match(/migrate\s*:\s*\(db\)\s*=>\s*\{([\s\S]*?)\},?\s*down/);
  return upMatch ? upMatch[1].trim() : null;
}

/**
 * Extracts the down migration function body from a migration file
 *
 * @param migrationContent - Full migration file content
 * @returns The down migration function body or null if not found
 */
export function extractDownMigration(migrationContent: string): string | null {
  const downMatch = migrationContent.match(/down\s*:\s*\(db\)\s*=>\s*\{([\s\S]*?)\},?\s*\}/);
  return downMatch ? downMatch[1].trim() : null;
}
