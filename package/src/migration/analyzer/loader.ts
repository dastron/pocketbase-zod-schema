import * as fs from "fs";
import * as path from "path";
import { FileSystemError, SchemaParsingError } from "../errors";
import { mergeConfig, resolveSchemaDir, type SchemaAnalyzerConfig } from "./config";

// Register tsx loader for TypeScript file support
// This allows dynamic imports of .ts files to work
let tsxLoaderRegistered = false;
async function ensureTsxLoader(): Promise<void> {
  if (tsxLoaderRegistered) return;

  try {
    // Import tsx/esm to register the TypeScript loader hooks
    // This enables dynamic imports of .ts files in Node.js ESM
    await import("tsx/esm");
    tsxLoaderRegistered = true;
  } catch {
    // tsx is not available - will handle in importSchemaModule
    tsxLoaderRegistered = false;
  }
}

/**
 * Discovers schema files in the specified directory
 * Filters based on configuration patterns
 *
 * @param config - Schema analyzer configuration
 * @returns Array of schema file paths (without extension)
 */
export function discoverSchemaFiles(config: SchemaAnalyzerConfig | string): string[] {
  // Support legacy string-only parameter
  const normalizedConfig: SchemaAnalyzerConfig = typeof config === "string" ? { schemaDir: config } : config;

  const mergedConfig = mergeConfig(normalizedConfig);
  const schemaDir = resolveSchemaDir(normalizedConfig);

  try {
    if (!fs.existsSync(schemaDir)) {
      throw new FileSystemError(`Schema directory not found: ${schemaDir}`, schemaDir, "access", "ENOENT");
    }

    const files = fs.readdirSync(schemaDir);

    // Filter files based on configuration
    const schemaFiles = files.filter((file) => {
      // Check extension
      const hasValidExtension = mergedConfig.includeExtensions.some((ext) => file.endsWith(ext));
      if (!hasValidExtension) return false;

      // Check exclusion patterns
      const isExcluded = mergedConfig.excludePatterns.some((pattern) => {
        // Support both exact match and glob-like patterns
        if (pattern.includes("*")) {
          const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
          return regex.test(file);
        }
        return file === pattern;
      });
      if (isExcluded) return false;

      return true;
    });

    // Return full paths without extension (for dynamic import)
    return schemaFiles.map((file) => {
      const ext = mergedConfig.includeExtensions.find((ext) => file.endsWith(ext)) || ".ts";
      return path.join(schemaDir, file.replace(new RegExp(`\\${ext}$`), ""));
    });
  } catch (error) {
    if (error instanceof FileSystemError) {
      throw error;
    }

    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === "EACCES" || fsError.code === "EPERM") {
      throw new FileSystemError(
        `Permission denied reading schema directory: ${schemaDir}`,
        schemaDir,
        "read",
        fsError.code,
        error as Error
      );
    }

    throw new FileSystemError(
      `Failed to read schema directory: ${schemaDir}`,
      schemaDir,
      "read",
      fsError.code,
      error as Error
    );
  }
}

/**
 * Dynamically imports a schema module
 * Supports both JavaScript and TypeScript files using tsx
 *
 * @param filePath - Path to the schema file (without extension)
 * @param config - Optional configuration for path transformation
 * @returns The imported module
 */
export async function importSchemaModule(filePath: string, config?: SchemaAnalyzerConfig): Promise<any> {
  try {
    let importPath = filePath;

    // Apply path transformation if provided
    if (config?.pathTransformer) {
      importPath = config.pathTransformer(filePath);
    }

    // Determine the file extension to use
    // Try .js first (for compiled files), then .ts (for source files)
    let resolvedPath: string | null = null;
    const jsPath = `${importPath}.js`;
    const tsPath = `${importPath}.ts`;

    if (fs.existsSync(jsPath)) {
      resolvedPath = jsPath;
    } else if (fs.existsSync(tsPath)) {
      resolvedPath = tsPath;
    } else {
      // Default to .js extension for ESM import
      resolvedPath = jsPath;
    }

    // If it's a TypeScript file, ensure tsx loader is registered
    if (resolvedPath.endsWith(".ts")) {
      await ensureTsxLoader();

      // Check if tsx was successfully registered
      if (!tsxLoaderRegistered) {
        throw new SchemaParsingError(
          `Failed to import TypeScript schema file. The 'tsx' package is required to load TypeScript files.\n` +
            `Please install tsx: npm install tsx (or yarn add tsx, or pnpm add tsx)\n` +
            `Alternatively, compile your schema files to JavaScript first.`,
          filePath
        );
      }
    }

    // Convert to file URL for proper ESM import
    const fileUrl = new URL(`file://${path.resolve(resolvedPath)}`);

    // Use dynamic import to load the module
    // tsx/esm will handle TypeScript files automatically if registered
    const module = await import(fileUrl.href);
    return module;
  } catch (error) {
    // Check if we're trying to import a TypeScript file
    const tsPath = `${filePath}.ts`;
    const isTypeScriptFile = fs.existsSync(tsPath);

    if (isTypeScriptFile && error instanceof SchemaParsingError) {
      // Re-throw SchemaParsingError as-is (already has helpful message)
      throw error;
    }

    if (isTypeScriptFile) {
      throw new SchemaParsingError(
        `Failed to import TypeScript schema file. The 'tsx' package is required to load TypeScript files.\n` +
          `Please install tsx: npm install tsx (or yarn add tsx, or pnpm add tsx)\n` +
          `Alternatively, compile your schema files to JavaScript first.`,
        filePath,
        error as Error
      );
    }

    throw new SchemaParsingError(
      `Failed to import schema module. Make sure the schema files exist and are valid.`,
      filePath,
      error as Error
    );
  }
}
