/**
 * Native Migration Generator Component
 * 
 * Creates collections using PocketBase's native CLI and admin API, then captures
 * the generated migration files for comparison with library-generated migrations.
 */

import { readdir, readFile, stat, copyFile, unlink } from 'fs/promises';
import { join } from 'path';
import { TestWorkspace } from './workspace-manager.js';
import { CollectionDefinition, FieldDefinition, CollectionRules } from '../fixtures/test-scenarios.js';
import { logger, sleep } from '../utils/test-helpers.js';

export interface CollectionChanges {
  addFields?: FieldDefinition[];
  removeFields?: string[];
  updateFields?: { name: string; changes: Partial<FieldDefinition> }[];
  addIndexes?: string[];
  removeIndexes?: string[];
  updateRules?: Partial<CollectionRules>;
}

export interface ParsedCollection {
  id: string;
  name: string;
  type: 'base' | 'auth' | 'view';
  system: boolean;
  fields: ParsedField[];
  indexes: string[];
  rules: CollectionRules;
}

export interface ParsedField {
  id: string;
  name: string;
  type: string;
  required: boolean;
  unique: boolean;
  options: Record<string, any>;
}

export interface ParsedMigration {
  filename: string;
  upFunction: string;
  downFunction: string;
  collections: ParsedCollection[];
}

export interface NativeMigrationGenerator {
  createCollection(workspace: TestWorkspace, definition: CollectionDefinition): Promise<string>;
  updateCollection(workspace: TestWorkspace, collectionName: string, changes: CollectionChanges): Promise<string>;
  getMigrationFiles(workspace: TestWorkspace): Promise<string[]>;
  parseMigrationFile(filePath: string): Promise<ParsedMigration>;
}

export class NativeMigrationGeneratorImpl implements NativeMigrationGenerator {
  private readonly adminApiTimeout: number = 30000;

  /**
   * Create a collection using PocketBase admin API
   */
  async createCollection(workspace: TestWorkspace, definition: CollectionDefinition): Promise<string> {
    logger.debug(`Creating collection '${definition.name}' in workspace ${workspace.workspaceId}`);

    try {
      // Get initial migration files count
      const initialFiles = await this.getMigrationFiles(workspace);
      const initialCount = initialFiles.length;

      // Create collection via admin API
      const adminUrl = `http://127.0.0.1:${workspace.pocketbasePort}`;

      // Authenticate as admin
      const authResponse = await this.authenticateAdmin(adminUrl);
      const authToken = authResponse.token;

      // Build collection data with resolved relation collection IDs
      const collectionData = await this.buildCollectionData(definition, adminUrl, authToken);

      // Check if collection exists (e.g. 'users' is created by default)
      try {
        const checkResponse = await fetch(`${adminUrl}/api/collections/${definition.name}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
          signal: AbortSignal.timeout(5000), // Short timeout for check
        });

        if (checkResponse.ok) {
          logger.debug(`Collection '${definition.name}' already exists. Deleting it...`);
          const existing = await checkResponse.json();

          const deleteResponse = await fetch(`${adminUrl}/api/collections/${existing.id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${authToken}`,
            },
            signal: AbortSignal.timeout(this.adminApiTimeout),
          });

          if (!deleteResponse.ok) {
            logger.warn(`Failed to delete existing collection '${definition.name}': ${deleteResponse.statusText}`);
          } else {
             // Wait a bit for deletion to propagate
             await sleep(500);
          }
        }
      } catch (error) {
        // Ignore check errors, proceed to create
      }

      // Create the collection
      const createResponse = await fetch(`${adminUrl}/api/collections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(collectionData),
        signal: AbortSignal.timeout(this.adminApiTimeout),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Failed to create collection: ${createResponse.status} ${createResponse.statusText} - ${errorText}`);
      }

      const createdCollection = await createResponse.json();
      logger.debug(`Collection created with ID: ${createdCollection.id}`);

      // Wait for migration file to be generated
      const migrationFile = await this.waitForNewMigrationFile(workspace, initialCount);
      
      // Copy the migration file to a safe location and remove it from the migration directory
      // This prevents PocketBase from trying to apply it again on restart
      const migrationFileName = migrationFile.split('/').pop() || `migration_${Date.now()}.js`;
      const safeMigrationPath = join(workspace.workspaceDir, `_captured_${migrationFileName}`);
      await copyFile(migrationFile, safeMigrationPath);
      
      // Remove the migration file from pb_migrations to prevent reapplication
      try {
        await unlink(migrationFile);
        logger.debug(`Removed migration file from pb_migrations to prevent reapplication: ${migrationFile}`);
      } catch (error) {
        logger.warn(`Failed to remove migration file ${migrationFile}:`, error);
        // Continue anyway - the file might have already been removed
      }
      
      logger.info(`Successfully created collection '${definition.name}' and captured migration: ${safeMigrationPath}`);
      return safeMigrationPath;

    } catch (error) {
      logger.error(`Failed to create collection '${definition.name}':`, error);
      throw error;
    }
  }

  /**
   * Update an existing collection using admin API
   */
  async updateCollection(workspace: TestWorkspace, collectionName: string, changes: CollectionChanges): Promise<string> {
    logger.debug(`Updating collection '${collectionName}' in workspace ${workspace.workspaceId}`);

    try {
      // Get initial migration files count
      const initialFiles = await this.getMigrationFiles(workspace);
      const initialCount = initialFiles.length;

      const adminUrl = `http://127.0.0.1:${workspace.pocketbasePort}`;
      
      // Authenticate as admin
      const authResponse = await this.authenticateAdmin(adminUrl);
      const authToken = authResponse.token;

      // Get existing collection
      const collectionsResponse = await fetch(`${adminUrl}/api/collections`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        signal: AbortSignal.timeout(this.adminApiTimeout),
      });

      if (!collectionsResponse.ok) {
        throw new Error(`Failed to fetch collections: ${collectionsResponse.status}`);
      }

      const collections = await collectionsResponse.json();
      const existingCollection = collections.items?.find((c: any) => c.name === collectionName);

      if (!existingCollection) {
        throw new Error(`Collection '${collectionName}' not found`);
      }

      // Apply changes to collection
      const updatedCollection = await this.applyCollectionChanges(existingCollection, changes, adminUrl, authToken);

      // Update the collection
      const updateResponse = await fetch(`${adminUrl}/api/collections/${existingCollection.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(updatedCollection),
        signal: AbortSignal.timeout(this.adminApiTimeout),
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        throw new Error(`Failed to update collection: ${updateResponse.status} ${updateResponse.statusText} - ${errorText}`);
      }

      // Wait for migration file to be generated
      const migrationFile = await this.waitForNewMigrationFile(workspace, initialCount);
      
      logger.info(`Successfully updated collection '${collectionName}' and captured migration: ${migrationFile}`);
      return migrationFile;

    } catch (error) {
      logger.error(`Failed to update collection '${collectionName}':`, error);
      throw error;
    }
  }

  /**
   * Get all migration files in the workspace
   */
  async getMigrationFiles(workspace: TestWorkspace): Promise<string[]> {
    try {
      const files = await readdir(workspace.migrationDir);
      return files
        .filter(file => file.endsWith('.js'))
        .map(file => join(workspace.migrationDir, file))
        .sort(); // Sort by filename (which includes timestamp)
    } catch (error) {
      logger.debug(`Error reading migration directory: ${error}`);
      return [];
    }
  }

  /**
   * Parse a migration file into structured data
   */
  async parseMigrationFile(filePath: string): Promise<ParsedMigration> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const filename = filePath.split('/').pop() || '';

      // Extract up and down functions using regex
      const upMatch = content.match(/migrate\s*\(\s*\(db\)\s*=>\s*\{([\s\S]*?)\}\s*,/);
      const downMatch = content.match(/,\s*\(db\)\s*=>\s*\{([\s\S]*?)\}\s*\)/);

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
   * Build collection data for PocketBase admin API
   */
  private async buildCollectionData(definition: CollectionDefinition, adminUrl: string, authToken: string): Promise<any> {
    const collectionData: any = {
      name: definition.name,
      type: definition.type,
      fields: await Promise.all(definition.fields.map(field => this.buildFieldData(field, adminUrl, authToken))),
    };

    // Add rules if specified
    if (definition.rules) {
      Object.assign(collectionData, definition.rules);
    }

    // Add indexes if specified
    if (definition.indexes && definition.indexes.length > 0) {
      collectionData.indexes = definition.indexes;
    }

    return collectionData;
  }

  /**
   * Build field data for PocketBase admin API
   */
  private async buildFieldData(field: FieldDefinition, adminUrl: string, authToken: string): Promise<any> {
    const fieldData: any = {
      name: field.name,
      type: field.type,
      required: field.required || false,
      unique: field.unique || false,
    };

    // Handle relation fields - need to resolve collection name to ID
    if (field.type === 'relation' && field.relationConfig) {
      const collectionName = field.relationConfig.collectionId; // Note: this is actually a collection name, not ID
      const collectionId = await this.resolveCollectionNameToId(
        collectionName,
        adminUrl,
        authToken
      );
      
      if (!collectionId) {
        throw new Error(
          `Failed to resolve collection ID for collection name: "${collectionName}". ` +
          `The referenced collection may need to be created first. ` +
          `Relation fields require the target collection to exist before they can be created.`
        );
      }

      fieldData.collectionId = collectionId;
      fieldData.cascadeDelete = field.relationConfig.cascadeDelete || false;
      fieldData.maxSelect = field.relationConfig.maxSelect ?? 1;
      fieldData.minSelect = field.relationConfig.minSelect ?? null;
      
      // Add displayFields if specified
      if (field.relationConfig.displayFields && field.relationConfig.displayFields.length > 0) {
        fieldData.displayFields = field.relationConfig.displayFields;
      }
    } else {
      // Add field-specific options (flattened for v0.23+)
      if (field.options) {
        Object.assign(fieldData, field.options);
      }
    }

    return fieldData;
  }

  /**
   * Resolve a collection name to its ID via PocketBase admin API
   */
  private async resolveCollectionNameToId(collectionName: string, adminUrl: string, authToken: string): Promise<string | null> {
    try {
      // Special case: users collection uses a constant ID
      if (collectionName.toLowerCase() === 'users') {
        return '_pb_users_auth_';
      }

      // Try to fetch the collection by name
      const response = await fetch(`${adminUrl}/api/collections/${collectionName}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const collection = await response.json();
        return collection.id;
      }

      // If collection doesn't exist, return null (caller should handle this)
      logger.warn(`Collection '${collectionName}' not found. It may need to be created first.`);
      return null;
    } catch (error) {
      logger.error(`Failed to resolve collection ID for '${collectionName}':`, error);
      return null;
    }
  }

  /**
   * Authenticate with PocketBase admin API
   */
  private async authenticateAdmin(adminUrl: string): Promise<{ token: string }> {
    // Try to authenticate as superuser (v0.23+)
    let authResponse = await fetch(`${adminUrl}/api/collections/_superusers/auth-with-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identity: 'test@example.com',
        password: 'testpassword123',
      }),
      signal: AbortSignal.timeout(this.adminApiTimeout),
    });

    // Fallback for older versions (pre v0.23)
    if (authResponse.status === 404) {
      authResponse = await fetch(`${adminUrl}/api/admins/auth-with-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identity: 'test@example.com',
          password: 'testpassword123',
        }),
        signal: AbortSignal.timeout(this.adminApiTimeout),
      });
    }

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      throw new Error(`Failed to authenticate admin: ${authResponse.status} - ${errorText}`);
    }

    const authData = await authResponse.json();
    logger.debug('Admin authentication successful');
    return authData;
  }

  /**
   * Wait for a new migration file to be generated
   */
  private async waitForNewMigrationFile(workspace: TestWorkspace, initialCount: number): Promise<string> {
    const maxAttempts = 40; // 20 seconds with 500ms intervals (increased for slower systems)
    let attempts = 0;
    const initialFiles = await this.getMigrationFiles(workspace);
    const initialFileNames = new Set(initialFiles.map(f => f.split('/').pop() || ''));

    while (attempts < maxAttempts) {
      await sleep(500);
      attempts++;

      const currentFiles = await this.getMigrationFiles(workspace);
      
      // Check for new files by comparing filenames
      const newFiles = currentFiles.filter(file => {
        const filename = file.split('/').pop() || '';
        return !initialFileNames.has(filename);
      });
      
      // Verify new files actually exist and have content
      for (const file of newFiles) {
        try {
          const stats = await stat(file);
          // Check if file has been written (size > 0 and modified recently)
          if (stats.size > 0) {
            // Verify file is readable and has content
            const content = await readFile(file, 'utf-8');
            if (content.length > 0 && content.includes('migrate')) {
              logger.debug(`Found new migration file: ${file.split('/').pop()}`);
              return file;
            }
          }
        } catch (error) {
          // File might not be fully written yet, continue waiting
          logger.debug(`File ${file} not ready yet: ${error}`);
        }
      }

      // Also check by count as fallback
      if (currentFiles.length > initialCount) {
        const newestFile = currentFiles[currentFiles.length - 1];
        try {
          const stats = await stat(newestFile);
          if (stats.size > 0) {
            const content = await readFile(newestFile, 'utf-8');
            if (content.length > 0 && content.includes('migrate')) {
              logger.debug(`Found new migration file by count: ${newestFile.split('/').pop()}`);
              return newestFile;
            }
          }
        } catch (error) {
          // Continue waiting
        }
      }
    }

    // Log current state for debugging
    const finalFiles = await this.getMigrationFiles(workspace);
    logger.error(`Migration file detection failed. Initial count: ${initialCount}, Final count: ${finalFiles.length}`);
    logger.error(`Initial files: ${initialFiles.map(f => f.split('/').pop()).join(', ')}`);
    logger.error(`Final files: ${finalFiles.map(f => f.split('/').pop()).join(', ')}`);
    
    throw new Error(`Migration file was not generated within timeout (${maxAttempts * 500}ms)`);
  }

  /**
   * Apply changes to an existing collection
   */
  private async applyCollectionChanges(existingCollection: any, changes: CollectionChanges, adminUrl: string, authToken: string): Promise<any> {
    const updated = { ...existingCollection };

    // Helper to get fields array (handle both old schema and new fields format)
    const getFields = (col: any) => col.fields || col.schema || [];

    // Apply field changes
    let fields = [...getFields(updated)];

    if (changes.addFields) {
      // Build field data with relation resolution support
      const newFields = await Promise.all(
        changes.addFields.map(field => this.buildFieldData(field, adminUrl, authToken))
      );
      fields = [...fields, ...newFields];
    }

    if (changes.removeFields) {
      fields = fields.filter((field: any) => !changes.removeFields!.includes(field.name));
    }

    if (changes.updateFields) {
      fields = fields.map((field: any) => {
        const update = changes.updateFields!.find(u => u.name === field.name);
        return update ? { ...field, ...update.changes } : field;
      });
    }

    // Set fields (using new format)
    updated.fields = fields;
    delete updated.schema; // Ensure we don't send both

    // Apply index changes
    if (changes.addIndexes) {
      updated.indexes = [...(updated.indexes || []), ...changes.addIndexes];
    }

    if (changes.removeIndexes) {
      updated.indexes = (updated.indexes || []).filter((index: string) => 
        !changes.removeIndexes!.includes(index)
      );
    }

    // Apply rule changes
    if (changes.updateRules) {
      Object.assign(updated, changes.updateRules);
    }

    return updated;
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
        
        // Extract basic collection properties
        const idMatch = collectionData.match(/"id":\s*"([^"]+)"/);
        const nameMatch = collectionData.match(/"name":\s*"([^"]+)"/);
        const typeMatch = collectionData.match(/"type":\s*"([^"]+)"/);
        const systemMatch = collectionData.match(/"system":\s*(true|false)/);

        if (!idMatch || !nameMatch || !typeMatch) {
          continue; // Skip invalid collection data
        }

        // Parse schema fields
        const schemaMatch = collectionData.match(/"schema":\s*\[([\s\S]*?)\]/);
        const fields: ParsedField[] = [];

        if (schemaMatch) {
          const schemaContent = schemaMatch[1];
          const fieldMatches = schemaContent.matchAll(/\{([\s\S]*?)\}/g);

          for (const fieldMatch of fieldMatches) {
            const fieldData = fieldMatch[1];
            
            const fieldIdMatch = fieldData.match(/"id":\s*"([^"]+)"/);
            const fieldNameMatch = fieldData.match(/"name":\s*"([^"]+)"/);
            const fieldTypeMatch = fieldData.match(/"type":\s*"([^"]+)"/);
            const fieldRequiredMatch = fieldData.match(/"required":\s*(true|false)/);
            const fieldUniqueMatch = fieldData.match(/"unique":\s*(true|false)/);

            if (fieldIdMatch && fieldNameMatch && fieldTypeMatch) {
              fields.push({
                id: fieldIdMatch[1],
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
        const rules: CollectionRules = {};
        const ruleNames = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule', 'manageRule'];
        
        for (const ruleName of ruleNames) {
          const ruleMatch = collectionData.match(new RegExp(`"${ruleName}":\\s*(null|"[^"]*")`));
          if (ruleMatch) {
            rules[ruleName as keyof CollectionRules] = ruleMatch[1] === 'null' ? null : ruleMatch[1].slice(1, -1);
          }
        }

        collections.push({
          id: idMatch[1],
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
}

// Export factory function for easier testing and dependency injection
export function createNativeMigrationGenerator(): NativeMigrationGenerator {
  return new NativeMigrationGeneratorImpl();
}