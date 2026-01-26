import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { parseSchemaFiles } from "../../migration/index.js";
import type { SchemaDefinition } from "../../migration/types.js";
import { TypeGenerator } from "../../type-gen/generator.js";
import { getSchemaDirectory, loadConfig } from "../utils/config.js";
import { logDebug, logError, logSection, logSuccess, setVerbosity, withProgress } from "../utils/logger.js";

export async function executeGenerateTypes(options: any): Promise<void> {
  try {
    // Set verbosity based on global options
    const parentOpts = options.parent?.opts?.() || {};
    if (parentOpts.verbose) {
      setVerbosity("verbose");
    } else if (parentOpts.quiet) {
      setVerbosity("quiet");
    }

    logDebug("Starting type generation...");
    logDebug(`Options: ${JSON.stringify(options, null, 2)}`);

    // Load configuration
    const config = await loadConfig(options);
    const schemaDir = getSchemaDirectory(config);

    logSection("🔍 Analyzing Schema");

    // Parse schema files
    const analyzerConfig = {
      schemaDir,
      excludePatterns: config.schema.exclude,
      useCompiledFiles: false,
    };
    const currentSchema: SchemaDefinition = await withProgress("Parsing Zod schemas...", () => parseSchemaFiles(analyzerConfig));

    logSuccess(`Found ${currentSchema.collections.size} collection(s)`);

    // Generate types
    logSection("📝 Generating Types");
    const generator = new TypeGenerator(currentSchema);
    const output = await withProgress("Generating TypeScript definitions...", () => Promise.resolve(generator.generate()));

    // Write output file
    const outputPath = options.output || config.typeGen.outPath;
    const resolvedPath = path.resolve(process.cwd(), outputPath);

    fs.writeFileSync(resolvedPath, output);

    logSuccess(`Types generated successfully at: ${outputPath}`);

    // Display next steps
    logSection("✅ Next Steps");
    console.log();
    console.log("  1. Import types in your application:");
    console.log(`     import { TypedPocketBase } from "./${path.basename(outputPath).replace(/\.ts$/, '')}";`);
    console.log();

  } catch (error) {
    logError(`Failed to generate types: ${error}`);
    if (error instanceof Error && error.stack) {
      console.error();
      console.error(error.stack);
    }
    process.exit(1);
  }
}

export function createGenerateTypesCommand(): Command {
  return new Command("generate-types")
    .description("Generate TypeScript definitions from Zod schemas")
    .option("-o, --output <path>", "Output file path")
    .option("--schema-dir <directory>", "Directory containing Zod schema files")
    .action(executeGenerateTypes);
}
