import * as fs from "fs";
import * as path from "path";
import { FileSystemError, MigrationGenerationError } from "../errors";
import { DEFAULT_CONFIG, mergeConfig, type MigrationGeneratorConfig } from "./config";

/**
 * Resolves the migration directory path
 */
export function resolveMigrationDir(config: MigrationGeneratorConfig): string {
  const workspaceRoot = config.workspaceRoot || process.cwd();

  if (path.isAbsolute(config.migrationDir)) {
    return config.migrationDir;
  }

  return path.join(workspaceRoot, config.migrationDir);
}

/**
 * Creates the migration file structure with up and down functions
 *
 * @param upCode - Code for the up migration
 * @param downCode - Code for the down migration
 * @param config - Optional configuration with custom template
 * @returns Complete migration file content
 */
export function createMigrationFileStructure(
  upCode: string,
  downCode: string,
  config?: MigrationGeneratorConfig
): string {
  const mergedConfig = config ? mergeConfig(config) : DEFAULT_CONFIG;
  let template = mergedConfig.template;

  // Replace placeholders using functions to avoid special character expansion (like $')
  template = template.replace("{{TYPES_PATH}}", () => mergedConfig.typesPath);
  template = template.replace("{{UP_CODE}}", () => upCode);
  template = template.replace("{{DOWN_CODE}}", () => downCode);

  // Remove type reference if disabled
  if (!mergedConfig.includeTypeReference) {
    template = template.replace(/\/\/\/ <reference path="[^"]*" \/>\n?/, "");
  }

  return template;
}

/**
 * Writes migration file to the specified directory
 * Creates directory if it doesn't exist
 *
 * @param migrationDir - Directory to write migration file
 * @param filename - Migration filename
 * @param content - Migration file content
 * @returns Full path to the created migration file
 */
export function writeMigrationFile(migrationDir: string, filename: string, content: string): string {
  try {
    // Ensure migration directory exists
    if (!fs.existsSync(migrationDir)) {
      try {
        fs.mkdirSync(migrationDir, { recursive: true });
      } catch (error) {
        const fsError = error as NodeJS.ErrnoException;
        if (fsError.code === "EACCES" || fsError.code === "EPERM") {
          throw new FileSystemError(
            `Permission denied creating migration directory. Check directory permissions.`,
            migrationDir,
            "create",
            fsError.code,
            error as Error
          );
        }
        throw new FileSystemError(
          `Failed to create migration directory: ${fsError.message}`,
          migrationDir,
          "create",
          fsError.code,
          error as Error
        );
      }
    }

    // Full path to migration file
    const filePath = path.join(migrationDir, filename);

    // Write migration file
    fs.writeFileSync(filePath, content, "utf-8");

    return filePath;
  } catch (error) {
    // If it's already a FileSystemError, re-throw it
    if (error instanceof FileSystemError) {
      throw error;
    }

    const fsError = error as NodeJS.ErrnoException;
    const filePath = path.join(migrationDir, filename);

    if (fsError.code === "EACCES" || fsError.code === "EPERM") {
      throw new FileSystemError(
        `Permission denied writing migration file. Check file and directory permissions.`,
        filePath,
        "write",
        fsError.code,
        error as Error
      );
    } else if (fsError.code === "ENOSPC") {
      throw new FileSystemError(
        `No space left on device when writing migration file.`,
        filePath,
        "write",
        fsError.code,
        error as Error
      );
    }

    throw new MigrationGenerationError(`Failed to write migration file: ${fsError.message}`, filePath, error as Error);
  }
}
