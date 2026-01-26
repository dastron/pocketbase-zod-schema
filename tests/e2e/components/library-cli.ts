/**
 * Library CLI Component
 * 
 * Simulates running pocketbase-zod-schema CLI in a separate project workspace,
 * executes library's migration generation commands, and captures CLI responses.
 */

import { mkdir, writeFile, readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { execSync, spawn } from 'child_process';
import { CollectionDefinition, FieldDefinition } from '../fixtures/test-scenarios.js';
import { ParsedMigration, ParsedCollection, ParsedField } from './native-migration-generator.js';
import { logger, createTempDir, cleanupTempDir } from '../utils/test-helpers.js';

export interface LibraryWorkspace {
  workspaceId: string;
  workspaceDir: string;
  schemaDir: string;
  migrationDir: string;
  packageJsonPath: string;
  configPath: string;
}

export interface LibraryCLI {
  createLibraryWorkspace(): Promise<LibraryWorkspace>;
  generateFromSchema(workspace: LibraryWorkspace, definition: CollectionDefinition): Promise<string>;
  generateFromDefinition(workspace: LibraryWorkspace, definition: CollectionDefinition): Promise<string>;
  getMigrationFiles(workspace: LibraryWorkspace): Promise<string[]>;
  parseMigrationFile(filePath: string): Promise<ParsedMigration>;
  cleanupLibraryWorkspace(workspace: LibraryWorkspace): Promise<void>;
}

export class LibraryCLIImpl implements LibraryCLI {
  private readonly cliTimeout: number = 60000; // 60 seconds for CLI operations
  private readonly packagePath: string;

  constructor() {
    // Path to the built package CLI
    this.packagePath = join(process.cwd(), 'package', 'dist', 'cli', 'migrate.js');
    
    // Verify the CLI exists
    if (!existsSync(this.packagePath)) {
      throw new Error(`Library CLI not found at ${this.packagePath}. Please build the package first.`);
    }
  }

  /**
   * Create a separate project workspace for library CLI testing
   */
  async createLibraryWorkspace(): Promise<LibraryWorkspace> {
    const workspaceId = `lib-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const workspaceDir = await createTempDir(`library-workspace-${workspaceId}-`);
    
    const schemaDir = join(workspaceDir, 'src', 'schema');
    const migrationDir = join(workspaceDir, 'pocketbase', 'pb_migrations');
    const packageJsonPath = join(workspaceDir, 'package.json');
    const configPath = join(workspaceDir, 'pocketbase-migrate.config.js');
    const nodeModulesDir = join(workspaceDir, 'node_modules');

    // Create directory structure
    await mkdir(schemaDir, { recursive: true });
    await mkdir(migrationDir, { recursive: true });
    await mkdir(nodeModulesDir, { recursive: true });

    // Create package.json for the test project
    const packageJson = {
      name: `test-project-${workspaceId}`,
      version: '1.0.0',
      type: 'module',
      dependencies: {
        'zod': '^3.24.3'
      }
    };

    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // Create a symlink to the main project's node_modules for zod
    try {
      const mainNodeModules = join(process.cwd(), 'node_modules');
      const zodPath = join(mainNodeModules, 'zod');
      const targetZodPath = join(nodeModulesDir, 'zod');
      
      if (existsSync(zodPath)) {
        // Create symlink to zod from main project
        execSync(`ln -sf "${zodPath}" "${targetZodPath}"`, { stdio: 'pipe' });
        logger.debug(`Created symlink to zod dependency in workspace ${workspaceId}`);
      } else {
        logger.warn(`Zod not found in main project node_modules: ${zodPath}`);
      }
    } catch (error) {
      logger.warn(`Failed to setup zod dependency in workspace ${workspaceId}:`, error);
    }

    // Create configuration file
    const config = `
export default {
  schema: {
    dir: './src/schema',
    exclude: ['**/*.test.ts', '**/*.spec.ts']
  },
  migration: {
    dir: './pocketbase/pb_migrations'
  }
};
`;

    await writeFile(configPath, config);

    const workspace: LibraryWorkspace = {
      workspaceId,
      workspaceDir,
      schemaDir,
      migrationDir,
      packageJsonPath,
      configPath,
    };

    logger.debug(`Created library workspace ${workspaceId} at ${workspaceDir}`);
    return workspace;
  }

  /**
   * Generate migration from Zod schema using the library CLI
   */
  async generateFromSchema(workspace: LibraryWorkspace, definition: CollectionDefinition): Promise<string> {
    logger.debug(`Generating migration from schema for collection '${definition.name}' in workspace ${workspace.workspaceId}`);

    try {
      // Create JavaScript schema file from collection definition (avoid TypeScript issues)
      const schemaContent = this.generateJavaScriptSchemaContent(definition);
      const schemaFilePath = join(workspace.schemaDir, `${definition.name}.js`);
      
      await writeFile(schemaFilePath, schemaContent);
      logger.debug(`Created schema file: ${schemaFilePath}`);

      // Get initial migration files count
      const initialFiles = await this.getMigrationFiles(workspace);
      const initialCount = initialFiles.length;

      // Execute library CLI generate command
      const cliResponse = await this.executeCLICommand(workspace, ['generate']);
      logger.debug(`CLI response: ${cliResponse}`);
      
      // Check if migration files were created in different locations
      const possibleDirs = [
        workspace.migrationDir,
        join(workspace.workspaceDir, 'pocketbase', 'pb_migrations'),
        join(workspace.workspaceDir, 'pb', 'pb_migrations'),
      ];
      
      for (const dir of possibleDirs) {
        logger.debug(`Checking for migration files in: ${dir}`);
        try {
          const files = await this.getMigrationFilesInDir(dir);
          logger.debug(`Found ${files.length} files in ${dir}: ${files.join(', ')}`);
        } catch (error) {
          logger.debug(`Error reading ${dir}: ${error}`);
        }
      }
      
      // Wait for migration file to be generated
      const migrationFile = await this.waitForNewMigrationFile(workspace, initialCount);
      
      logger.info(`Successfully generated migration from schema for '${definition.name}': ${migrationFile}`);
      return migrationFile;

    } catch (error) {
      logger.error(`Failed to generate migration from schema for '${definition.name}':`, error);
      throw error;
    }
  }

  /**
   * Generate migration from collection definition (alias for generateFromSchema)
   */
  async generateFromDefinition(workspace: LibraryWorkspace, definition: CollectionDefinition): Promise<string> {
    return this.generateFromSchema(workspace, definition);
  }

  /**
   * Get all migration files in a specific directory
   */
  private async getMigrationFilesInDir(migrationDir: string): Promise<string[]> {
    try {
      if (!existsSync(migrationDir)) {
        return [];
      }

      const files = await readdir(migrationDir);
      return files
        .filter(file => file.endsWith('.js'))
        .map(file => join(migrationDir, file))
        .sort(); // Sort by filename (which includes timestamp)
    } catch (error) {
      logger.debug(`Error reading migration directory ${migrationDir}: ${error}`);
      return [];
    }
  }

  /**
   * Get all migration files in the library workspace
   */
  async getMigrationFiles(workspace: LibraryWorkspace): Promise<string[]> {
    return this.getMigrationFilesInDir(workspace.migrationDir);
  }

  /**
   * Parse a migration file into structured data
   */
  async parseMigrationFile(filePath: string): Promise<ParsedMigration> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const filename = filePath.split('/').pop() || '';

      // Extract up and down functions using regex
      const upMatch = content.match(/migrate\s*\(\s*\((?:app|db)\)\s*=>\s*\{([\s\S]*?)\}\s*,/);
      const downMatch = content.match(/,\s*\((?:app|db)\)\s*=>\s*\{([\s\S]*?)\}\s*\)/);

      const upFunction = upMatch ? upMatch[0] : '';
      const downFunction = downMatch ? downMatch[0] : '';

      // Parse collections from the migration content
      const collections = this.parseCollectionsFromMigration(content);

      return {
        filename,
        upFunction,
        downFunction,
        collections,
      };
    } catch (error) {
      logger.error(`Failed to parse migration file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Clean up library workspace
   */
  async cleanupLibraryWorkspace(workspace: LibraryWorkspace): Promise<void> {
    logger.debug(`Cleaning up library workspace ${workspace.workspaceId}`);

    try {
      await cleanupTempDir(workspace.workspaceDir);
      logger.debug(`Library workspace ${workspace.workspaceId} cleaned up successfully`);
    } catch (error) {
      logger.warn(`Error cleaning up library workspace ${workspace.workspaceId}:`, error);
    }
  }

  /**
   * Generate JavaScript schema content from collection definition
   */
  private generateJavaScriptSchemaContent(definition: CollectionDefinition): string {
    const lines: string[] = [];

    // Add imports
    lines.push(`import { z } from 'zod';`);
    lines.push(``);

    // Generate field schemas
    const fieldSchemas: string[] = [];
    for (const field of definition.fields) {
      const zodType = this.mapFieldTypeToZod(field);
      fieldSchemas.push(`  ${field.name}: ${zodType}`);
    }

    // Generate input schema (for forms/API)
    const inputSchemaName = `${this.capitalize(definition.name)}InputSchema`;
    lines.push(`export const ${inputSchemaName} = z.object({`);
    lines.push(fieldSchemas.join(',\n'));
    lines.push(`});`);
    lines.push(``);

    // Generate database schema (with base fields)
    const schemaName = `${this.capitalize(definition.name)}Schema`;

    // Create the metadata object
    const metadata: any = {
      collectionName: definition.name,
      type: definition.type,
    };

    if (definition.rules) {
      metadata.rules = definition.rules;
    }

    if (definition.indexes && definition.indexes.length > 0) {
      metadata.indexes = definition.indexes;
    }

    lines.push(`export const ${schemaName} = ${inputSchemaName}.extend({`);
    lines.push(`  id: z.string(),`);
    lines.push(`  created: z.string(),`);
    lines.push(`  updated: z.string(),`);
    lines.push(`}).describe(${JSON.stringify(JSON.stringify(metadata))});`);
    lines.push(``);

    return lines.join('\n');
  }

  /**
   * Generate Zod schema content from collection definition (TypeScript version)
   */
  private generateZodSchemaContent(definition: CollectionDefinition): string {
    return this.generateJavaScriptSchemaContent(definition);
  }

  /**
   * Map PocketBase field type to Zod schema
   */
  private mapFieldTypeToZod(field: FieldDefinition): string {
    let zodType: string;

    switch (field.type) {
      case 'text':
        zodType = 'z.string()';
        if (field.options?.min) {
          zodType += `.min(${field.options.min})`;
        }
        if (field.options?.max) {
          zodType += `.max(${field.options.max})`;
        }
        break;

      case 'editor':
        zodType = 'z.string()';
        break;

      case 'number':
        zodType = 'z.number()';
        if (field.options?.onlyInt) {
          zodType += '.int()';
        }
        if (field.options?.min !== undefined) {
          zodType += `.min(${field.options.min})`;
        }
        if (field.options?.max !== undefined) {
          zodType += `.max(${field.options.max})`;
        }
        break;

      case 'bool':
        zodType = 'z.boolean()';
        break;

      case 'email':
        zodType = 'z.string().email()';
        break;

      case 'url':
        zodType = 'z.string().url()';
        break;

      case 'date':
        zodType = 'z.string().datetime()';
        break;

      case 'select':
        if (field.options?.values && Array.isArray(field.options.values)) {
          const values = field.options.values.map((v: string) => `'${v}'`).join(', ');
          zodType = `z.enum([${values}])`;
        } else {
          zodType = 'z.string()';
        }
        break;

      case 'file':
        // Attach metadata for file type
        const fileMetadata = {
          __pocketbase_field__: {
            type: 'file',
            options: field.options || {}
          }
        };
        zodType = `z.string().describe(${JSON.stringify(JSON.stringify(fileMetadata))})`;
        break;

      case 'geoPoint':
        // Attach metadata for geoPoint type
        const geoMetadata = {
          __pocketbase_field__: {
            type: 'geoPoint'
          }
        };
        zodType = `z.object({ lon: z.number(), lat: z.number() }).describe(${JSON.stringify(JSON.stringify(geoMetadata))})`;
        break;

      case 'relation':
        if (field.options?.maxSelect === 1) {
          zodType = 'z.string()';
        } else {
          zodType = 'z.array(z.string())';
        }
        break;

      case 'json':
        zodType = 'z.record(z.any())';
        break;

      case 'autodate':
        zodType = 'z.string().datetime()';
        break;

      default:
        zodType = 'z.string()';
        break;
    }

    // Handle required/optional
    if (!field.required) {
      zodType += '.optional()';
    }

    return zodType;
  }

  /**
   * Execute CLI command in the library workspace
   */
  private async executeCLICommand(workspace: LibraryWorkspace, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const command = 'node';
      const fullArgs = [this.packagePath, ...args];

      logger.debug(`Executing CLI command: ${command} ${fullArgs.join(' ')}`);
      logger.debug(`Working directory: ${workspace.workspaceDir}`);

      const process = spawn(command, fullArgs, {
        cwd: workspace.workspaceDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.cliTimeout,
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        logger.debug(`CLI stdout: ${chunk}`);
      });

      process.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        logger.debug(`CLI stderr: ${chunk}`);
      });

      process.on('close', (code) => {
        logger.debug(`CLI command exited with code ${code}`);
        logger.debug(`Final stdout: ${stdout}`);
        if (stderr) {
          logger.debug(`Final stderr: ${stderr}`);
        }

        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`CLI command failed with code ${code}. Stderr: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        logger.error(`CLI command error:`, error);
        reject(error);
      });

      // Add timeout handling
      setTimeout(() => {
        if (!process.killed) {
          logger.warn(`CLI command timed out after ${this.cliTimeout}ms, killing process`);
          process.kill('SIGKILL');
          reject(new Error(`CLI command timed out after ${this.cliTimeout}ms`));
        }
      }, this.cliTimeout);
    });
  }

  /**
   * Wait for a new migration file to be generated
   */
  private async waitForNewMigrationFile(workspace: LibraryWorkspace, initialCount: number): Promise<string> {
    const maxAttempts = 40; // 20 seconds with 500ms intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;

      const currentFiles = await this.getMigrationFiles(workspace);
      
      if (currentFiles.length > initialCount) {
        // Return the newest migration file
        return currentFiles[currentFiles.length - 1];
      }
    }

    throw new Error(`Migration file was not generated within timeout (${maxAttempts * 500}ms)`);
  }

  /**
   * Parse collections from migration content
   */
  private parseCollectionsFromMigration(content: string): ParsedCollection[] {
    const collections: ParsedCollection[] = [];

    try {
      // Look for Collection constructor calls in the migration
      const collectionMatches = content.matchAll(/new Collection\s*\(\s*\{([\s\S]*?)\}\s*\)/g);

      for (const match of collectionMatches) {
        const collectionData = match[1];
        
        // Extract basic collection properties (without quotes around property names)
        const nameMatch = collectionData.match(/name:\s*"([^"]+)"/);
        const typeMatch = collectionData.match(/type:\s*"([^"]+)"/);
        const systemMatch = collectionData.match(/system:\s*(true|false)/);

        if (!nameMatch || !typeMatch) {
          continue; // Skip invalid collection data
        }

        // Parse schema fields - look for fields: [...] pattern
        // robust parsing using bracket counting to handle nested arrays in options
        let fieldsContent = '';
        const fieldsStartMatch = collectionData.match(/fields:\s*\[/);

        if (fieldsStartMatch && fieldsStartMatch.index !== undefined) {
          const startIndex = fieldsStartMatch.index + fieldsStartMatch[0].length;
          let bracketDepth = 1;
          let currentIndex = startIndex;

          while (currentIndex < collectionData.length && bracketDepth > 0) {
            if (collectionData[currentIndex] === '[') {
              bracketDepth++;
            } else if (collectionData[currentIndex] === ']') {
              bracketDepth--;
            }
            currentIndex++;
          }

          if (bracketDepth === 0) {
            fieldsContent = collectionData.substring(startIndex, currentIndex - 1);
          }
        }

        const fields: ParsedField[] = [];

        if (fieldsContent) {
          
          // Parse field objects by finding balanced braces
          // Each field starts with { and we need to find its matching }
          let depth = 0;
          let fieldStart = -1;
          const fieldStrings: string[] = [];
          
          for (let i = 0; i < fieldsContent.length; i++) {
            const char = fieldsContent[i];
            
            if (char === '{') {
              if (depth === 0) {
                fieldStart = i;
              }
              depth++;
            } else if (char === '}') {
              depth--;
              if (depth === 0 && fieldStart !== -1) {
                // Found a complete field object
                fieldStrings.push(fieldsContent.substring(fieldStart, i + 1));
                fieldStart = -1;
              }
            }
          }
          
          // Parse each field string
          for (const fieldStr of fieldStrings) {
            const fieldNameMatch = fieldStr.match(/name:\s*"([^"]+)"/);
            const fieldTypeMatch = fieldStr.match(/type:\s*"([^"]+)"/);
            const fieldRequiredMatch = fieldStr.match(/required:\s*(true|false)/);
            const fieldUniqueMatch = fieldStr.match(/unique:\s*(true|false)/);

            if (fieldNameMatch && fieldTypeMatch) {
              fields.push({
                id: `field_${fieldNameMatch[1]}`, // Generate a simple ID
                name: fieldNameMatch[1],
                type: fieldTypeMatch[1],
                required: fieldRequiredMatch ? fieldRequiredMatch[1] === 'true' : false,
                unique: fieldUniqueMatch ? fieldUniqueMatch[1] === 'true' : false,
                options: {}, // TODO: Parse field options if needed
              });
            }
          }
        }

        // Parse rules
        const rules: any = {};
        const ruleNames = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule', 'manageRule'];
        
        for (const ruleName of ruleNames) {
          const ruleMatch = collectionData.match(new RegExp(`${ruleName}:\\s*(null|"[^"]*")`));
          if (ruleMatch) {
            rules[ruleName] = ruleMatch[1] === 'null' ? null : ruleMatch[1].slice(1, -1);
          }
        }

        collections.push({
          id: `collection_${nameMatch[1]}`, // Generate a simple ID
          name: nameMatch[1],
          type: typeMatch[1] as 'base' | 'auth' | 'view',
          system: systemMatch ? systemMatch[1] === 'true' : false,
          fields,
          indexes: [], // TODO: Parse indexes if needed
          rules,
        });
      }
    } catch (error) {
      logger.warn(`Error parsing collections from migration content:`, error);
    }

    return collections;
  }

  /**
   * Capitalize first letter of string
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// Export factory function for easier testing and dependency injection
export function createLibraryCLI(): LibraryCLI {
  return new LibraryCLIImpl();
}