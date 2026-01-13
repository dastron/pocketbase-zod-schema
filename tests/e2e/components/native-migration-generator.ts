/**
 * Native Migration Generator Component
 * 
 * Creates collections using PocketBase's native CLI and admin API, then captures
 * the generated migration files for comparison with library-generated migrations.
 */

import { readdir, readFile } from 'fs/promises';
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
      const collectionData = this.buildCollectionData(definition);

      // Authenticate as admin
      const authResponse = await this.authenticateAdmin(adminUrl);
      const authToken = authResponse.token;

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
      
      logger.info(`Successfully created collection '${definition.name}' and captured migration: ${migrationFile}`);
      return migrationFile;

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
      const updatedCollection = this.applyCollectionChanges(existingCollection, changes);

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
  private buildCollectionData(definition: CollectionDefinition): any {
    const collectionData: any = {
      name: definition.name,
      type: definition.type,
      fields: definition.fields.map(field => this.buildFieldData(field)),
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
  private buildFieldData(field: FieldDefinition): any {
    const fieldData: any = {
      name: field.name,
      type: field.type,
      required: field.required || false,
      unique: field.unique || false,
    };

    // Add field-specific options
    if (field.options) {
      fieldData.options = field.options;
    }

    return fieldData;
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
    const maxAttempts = 20; // 10 seconds with 500ms intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      await sleep(500);
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
   * Apply changes to an existing collection
   */
  private applyCollectionChanges(existingCollection: any, changes: CollectionChanges): any {
    const updated = { ...existingCollection };

    // Helper to get fields array (handle both old schema and new fields format)
    const getFields = (col: any) => col.fields || col.schema || [];

    // Apply field changes
    let fields = [...getFields(updated)];

    if (changes.addFields) {
      fields = [...fields, ...changes.addFields.map(field => this.buildFieldData(field))];
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