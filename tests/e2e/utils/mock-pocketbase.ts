/**
 * Mock PocketBase utilities for testing components in isolation
 */

/**
 * Mock PocketBase CLI responses for testing
 */
export const mockPocketBaseResponses = {
  health: {
    status: 200,
    body: { code: 200, message: "API is healthy", data: {} }
  },
  
  createCollection: {
    success: {
      status: 200,
      body: {
        id: "test_collection_id",
        name: "test_collection",
        type: "base",
        system: false,
        schema: [],
        indexes: [],
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null
      }
    },
    
    error: {
      status: 400,
      body: {
        code: 400,
        message: "Failed to create collection",
        data: {}
      }
    }
  },
  
  migrationGenerated: `/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "test_collection_id",
    "created": "2024-01-01 00:00:00.000Z",
    "updated": "2024-01-01 00:00:00.000Z",
    "name": "test_collection",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "field_id",
        "name": "title",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      }
    ],
    "indexes": [],
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  })

  return Dao(db).saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("test_collection")

  return dao.deleteCollection(collection)
})`
};

/**
 * Mock CLI execution results
 */
export const mockCliResults = {
  success: {
    stdout: "Collection created successfully",
    stderr: "",
    exitCode: 0
  },
  
  error: {
    stdout: "",
    stderr: "Error: Failed to create collection",
    exitCode: 1
  },
  
  timeout: {
    stdout: "",
    stderr: "Error: Operation timed out",
    exitCode: 124
  }
};

/**
 * Mock file system operations for testing
 */
export class MockFileSystem {
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();
  
  writeFile(path: string, content: string): void {
    this.files.set(path, content);
    // Add parent directories
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      this.directories.add(parts.slice(0, i).join('/'));
    }
  }
  
  readFile(path: string): string {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }
  
  exists(path: string): boolean {
    return this.files.has(path) || this.directories.has(path);
  }
  
  readdir(path: string): string[] {
    const entries: string[] = [];
    
    // Add files in this directory
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(path + '/')) {
        const relativePath = filePath.substring(path.length + 1);
        if (!relativePath.includes('/')) {
          entries.push(relativePath);
        }
      }
    }
    
    // Add subdirectories
    for (const dirPath of this.directories) {
      if (dirPath.startsWith(path + '/')) {
        const relativePath = dirPath.substring(path.length + 1);
        if (!relativePath.includes('/')) {
          entries.push(relativePath);
        }
      }
    }
    
    return entries;
  }
  
  clear(): void {
    this.files.clear();
    this.directories.clear();
  }
}

/**
 * Mock workspace for testing
 */
export interface MockWorkspace {
  workspaceId: string;
  workspaceDir: string;
  pocketbasePort: number;
  pocketbasePath: string;
  migrationDir: string;
  dataDir: string;
}

export function createMockWorkspace(overrides: Partial<MockWorkspace> = {}): MockWorkspace {
  return {
    workspaceId: 'mock_workspace_123',
    workspaceDir: '/tmp/mock-workspace',
    pocketbasePort: 60536,
    pocketbasePath: '/tmp/mock-workspace/pocketbase',
    migrationDir: '/tmp/mock-workspace/pb_migrations',
    dataDir: '/tmp/mock-workspace/pb_data',
    ...overrides
  };
}

/**
 * Mock collection definitions for testing
 */
export const mockCollectionDefinitions = {
  basic: {
    name: 'test_collection',
    type: 'base' as const,
    fields: [
      {
        name: 'title',
        type: 'text' as const,
        required: true,
        options: { min: 1, max: 100 }
      }
    ]
  },
  
  withRelation: {
    name: 'posts',
    type: 'base' as const,
    fields: [
      {
        name: 'title',
        type: 'text' as const,
        required: true
      },
      {
        name: 'author',
        type: 'relation' as const,
        required: true,
        options: {
          collectionId: 'users',
          cascadeDelete: false,
          minSelect: null,
          maxSelect: 1
        }
      }
    ]
  },
  
  auth: {
    name: 'users',
    type: 'auth' as const,
    fields: [
      {
        name: 'name',
        type: 'text' as const,
        required: true
      }
    ],
    rules: {
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '',
      updateRule: '@request.auth.id = id',
      deleteRule: '@request.auth.id = id'
    }
  }
};

/**
 * Mock parsed migration for testing
 */
export const mockParsedMigration = {
  filename: '1234567890_created_test_collection.js',
  upFunction: 'migrate((db) => { /* migration code */ })',
  downFunction: 'revert((db) => { /* revert code */ })',
  collections: [
    {
      id: 'test_collection_id',
      name: 'test_collection',
      type: 'base',
      system: false,
      fields: [
        {
          id: 'field_id',
          name: 'title',
          type: 'text',
          required: true,
          options: { min: 1, max: 100 }
        }
      ],
      indexes: [],
      rules: {
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null
      }
    }
  ]
};