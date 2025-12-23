/**
 * Test scenario definitions for E2E tests
 */

export interface TestScenario {
  name: string;
  description: string;
  category: 'basic' | 'field-types' | 'indexes' | 'rules' | 'auth' | 'updates' | 'relations';
  collectionDefinition: CollectionDefinition;
  expectedFeatures: string[];
  minimumScore: number;
  skipReason?: string;
  enabled?: boolean;
  tags?: string[];
  dependencies?: string[];
}

export interface CollectionDefinition {
  name: string;
  type: 'base' | 'auth' | 'view';
  fields: FieldDefinition[];
  indexes?: string[];
  rules?: CollectionRules;
  updateOperations?: UpdateOperation[];
}

export interface UpdateOperation {
  type: 'add_field' | 'add_index' | 'modify_field' | 'remove_field';
  target: string;
  definition?: FieldDefinition | string;
  description: string;
}

export interface FieldDefinition {
  name: string;
  type: 'text' | 'editor' | 'number' | 'bool' | 'email' | 'url' | 'date' | 'select' | 'file' | 'relation' | 'json' | 'geoPoint' | 'autodate';
  required?: boolean;
  unique?: boolean;
  options?: Record<string, any>;
  relationConfig?: RelationConfig;
}

export interface RelationConfig {
  collectionId: string;
  cascadeDelete?: boolean;
  minSelect?: number;
  maxSelect?: number;
  displayFields?: string[];
}

export interface CollectionRules {
  listRule?: string | null;
  viewRule?: string | null;
  createRule?: string | null;
  updateRule?: string | null;
  deleteRule?: string | null;
  manageRule?: string | null;
}

/**
 * Basic collection test scenarios
 */
export const basicScenarios: TestScenario[] = [
  {
    name: 'basic-collection',
    description: 'Basic collection with standard field types',
    category: 'basic',
    collectionDefinition: {
      name: 'basic_test',
      type: 'base',
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
          options: { min: 1, max: 100 }
        },
        {
          name: 'description',
          type: 'text',
          required: false,
          options: { max: 500 }
        }
      ]
    },
    expectedFeatures: ['text_fields', 'required_validation', 'length_constraints'],
    minimumScore: 90,
    enabled: true,
    tags: ['basic', 'text-fields']
  },
  
  {
    name: 'blank-collection',
    description: 'Blank collection with only system fields',
    category: 'basic',
    collectionDefinition: {
      name: 'blank_test',
      type: 'base',
      fields: []
    },
    expectedFeatures: ['system_fields'],
    minimumScore: 95,
    enabled: true,
    tags: ['basic', 'minimal']
  }
];

/**
 * Field type test scenarios
 */
export const fieldTypeScenarios: TestScenario[] = [
  {
    name: 'all-field-types',
    description: 'Collection with all supported field types',
    category: 'field-types',
    collectionDefinition: {
      name: 'field_types_test',
      type: 'base',
      fields: [
        { name: 'text_field', type: 'text', required: true, options: { min: 1, max: 100 } },
        { name: 'editor_field', type: 'editor', required: false, options: { convertUrls: false } },
        { name: 'number_field', type: 'number', required: true, options: { min: 0, max: 100, onlyInt: true } },
        { name: 'bool_field', type: 'bool', required: false },
        { name: 'email_field', type: 'email', required: false, options: { exceptDomains: [], onlyDomains: [] } },
        { name: 'url_field', type: 'url', required: false, options: { exceptDomains: [], onlyDomains: [] } },
        { name: 'date_field', type: 'date', required: false, options: { min: '', max: '' } },
        { name: 'select_field', type: 'select', required: false, options: { maxSelect: 1, values: ['option1', 'option2', 'option3'] } },
        { name: 'json_field', type: 'json', required: false, options: { maxSize: 2000000 } },
        { name: 'autodate_field', type: 'autodate', required: false, options: { onCreate: true, onUpdate: false } }
      ]
    },
    expectedFeatures: [
      'text_field', 'editor_field', 'number_field', 'bool_field',
      'email_field', 'url_field', 'date_field', 'select_field',
      'json_field', 'autodate_field'
    ],
    minimumScore: 85,
    enabled: true,
    tags: ['comprehensive', 'field-types']
  },

  {
    name: 'file-field-types',
    description: 'Collection with file field configurations',
    category: 'field-types',
    collectionDefinition: {
      name: 'file_test',
      type: 'base',
      fields: [
        { 
          name: 'single_file', 
          type: 'file', 
          required: false, 
          options: { 
            maxSelect: 1, 
            maxSize: 5242880, 
            mimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
            thumbs: ['100x100']
          } 
        },
        { 
          name: 'multiple_files', 
          type: 'file', 
          required: false, 
          options: { 
            maxSelect: 5, 
            maxSize: 10485760, 
            mimeTypes: ['application/pdf', 'text/plain'],
            protected: false
          } 
        }
      ]
    },
    expectedFeatures: ['file_upload', 'file_validation', 'mime_types', 'file_size_limits'],
    minimumScore: 80,
    enabled: true,
    tags: ['file-handling', 'field-types']
  },

  {
    name: 'geopoint-field-types',
    description: 'Collection with geoPoint field',
    category: 'field-types',
    collectionDefinition: {
      name: 'geo_test',
      type: 'base',
      fields: [
        { 
          name: 'location', 
          type: 'geoPoint', 
          required: false,
          options: {}
        },
        { 
          name: 'address', 
          type: 'text', 
          required: false 
        }
      ]
    },
    expectedFeatures: ['geopoint_field', 'location_data'],
    minimumScore: 75,
    enabled: true,
    tags: ['geospatial', 'field-types']
  },

  {
    name: 'select-field-variations',
    description: 'Collection with different select field configurations',
    category: 'field-types',
    collectionDefinition: {
      name: 'select_variations_test',
      type: 'base',
      fields: [
        { 
          name: 'single_select', 
          type: 'select', 
          required: true, 
          options: { 
            maxSelect: 1, 
            values: ['small', 'medium', 'large'] 
          } 
        },
        { 
          name: 'multi_select', 
          type: 'select', 
          required: false, 
          options: { 
            maxSelect: 3, 
            values: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'] 
          } 
        }
      ]
    },
    expectedFeatures: ['single_select', 'multi_select', 'select_validation'],
    minimumScore: 85,
    enabled: true,
    tags: ['select-fields', 'field-types']
  }
];

/**
 * Index and rule test scenarios
 */
export const indexRuleScenarios: TestScenario[] = [
  {
    name: 'unique-indexes',
    description: 'Collection with unique indexes',
    category: 'indexes',
    collectionDefinition: {
      name: 'unique_test',
      type: 'base',
      fields: [
        { name: 'email', type: 'email', required: true, unique: true },
        { name: 'username', type: 'text', required: true, unique: true, options: { min: 3, max: 30 } }
      ],
      indexes: ['CREATE UNIQUE INDEX idx_unique_email ON unique_test (email)']
    },
    expectedFeatures: ['unique_constraints', 'custom_indexes'],
    minimumScore: 80,
    enabled: true,
    tags: ['indexes', 'unique-constraints']
  },
  
  {
    name: 'api-rules-unrestricted',
    description: 'Collection with unrestricted API rules',
    category: 'rules',
    collectionDefinition: {
      name: 'public_test',
      type: 'base',
      fields: [
        { name: 'title', type: 'text', required: true, options: { min: 1, max: 200 } },
        { name: 'content', type: 'text', required: false, options: { max: 2000 } }
      ],
      rules: {
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: ''
      }
    },
    expectedFeatures: ['unrestricted_access', 'public_api'],
    minimumScore: 85,
    enabled: true,
    tags: ['rules', 'unrestricted']
  },
  
  {
    name: 'api-rules-restricted',
    description: 'Collection with restricted API rules',
    category: 'rules',
    collectionDefinition: {
      name: 'private_test',
      type: 'base',
      fields: [
        { name: 'title', type: 'text', required: true, options: { min: 1, max: 200 } },
        { name: 'author', type: 'text', required: true, options: { min: 1, max: 50 } },
        { name: 'status', type: 'select', required: true, options: { maxSelect: 1, values: ['draft', 'published', 'archived'] } }
      ],
      rules: {
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != "" && author = @request.auth.id',
        deleteRule: '@request.auth.id != "" && author = @request.auth.id'
      }
    },
    expectedFeatures: ['api_rules', 'auth_filtering', 'ownership_rules'],
    minimumScore: 75,
    enabled: true,
    tags: ['rules', 'restricted', 'auth-required']
  },

  {
    name: 'complex-api-rules',
    description: 'Collection with complex API rules and conditions',
    category: 'rules',
    collectionDefinition: {
      name: 'complex_rules_test',
      type: 'base',
      fields: [
        { name: 'title', type: 'text', required: true, options: { min: 1, max: 200 } },
        { name: 'author', type: 'text', required: true, options: { min: 1, max: 50 } },
        { name: 'status', type: 'select', required: true, options: { maxSelect: 1, values: ['draft', 'review', 'published', 'archived'] } },
        { name: 'visibility', type: 'select', required: true, options: { maxSelect: 1, values: ['public', 'private', 'restricted'] } }
      ],
      rules: {
        listRule: '@request.auth.id != "" && (visibility = "public" || author = @request.auth.id)',
        viewRule: '@request.auth.id != "" && (visibility = "public" || author = @request.auth.id)',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != "" && author = @request.auth.id && status != "published"',
        deleteRule: '@request.auth.id != "" && author = @request.auth.id && status = "draft"'
      }
    },
    expectedFeatures: ['complex_rules', 'conditional_access', 'status_based_rules', 'visibility_control'],
    minimumScore: 70,
    enabled: true,
    tags: ['rules', 'complex', 'conditional']
  }
];

/**
 * Auth collection test scenarios
 */
export const authScenarios: TestScenario[] = [
  {
    name: 'auth-collection',
    description: 'Auth collection with special system fields',
    category: 'auth',
    collectionDefinition: {
      name: 'users',
      type: 'auth',
      fields: [
        { name: 'name', type: 'text', required: true, options: { min: 2, max: 50 } },
        { name: 'avatar', type: 'file', required: false, options: { maxSelect: 1, maxSize: 5242880, mimeTypes: ['image/jpeg', 'image/png'] } },
        { name: 'bio', type: 'text', required: false, options: { max: 500 } }
      ],
      rules: {
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '',
        updateRule: '@request.auth.id = id',
        deleteRule: '@request.auth.id = id'
      }
    },
    expectedFeatures: ['auth_fields', 'system_fields', 'file_upload', 'auth_rules'],
    minimumScore: 70,
    enabled: true,
    tags: ['auth', 'system-fields']
  },

  {
    name: 'auth-with-manage-rule',
    description: 'Auth collection with manageRule for user management',
    category: 'auth',
    collectionDefinition: {
      name: 'admins',
      type: 'auth',
      fields: [
        { name: 'role', type: 'select', required: true, options: { maxSelect: 1, values: ['admin', 'moderator', 'user'] } },
        { name: 'permissions', type: 'select', required: false, options: { maxSelect: 5, values: ['read', 'write', 'delete', 'manage', 'admin'] } }
      ],
      rules: {
        listRule: '@request.auth.role = "admin"',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.role = "admin"',
        updateRule: '@request.auth.id = id || @request.auth.role = "admin"',
        deleteRule: '@request.auth.role = "admin"',
        manageRule: '@request.auth.role = "admin"'
      }
    },
    expectedFeatures: ['auth_fields', 'manage_rule', 'role_based_access', 'admin_permissions'],
    minimumScore: 65,
    enabled: true,
    tags: ['auth', 'admin', 'manage-rule']
  }
];

/**
 * Relation field test scenarios
 */
export const relationScenarios: TestScenario[] = [
  {
    name: 'single-relation',
    description: 'Collection with single relation field',
    category: 'relations',
    collectionDefinition: {
      name: 'posts',
      type: 'base',
      fields: [
        { name: 'title', type: 'text', required: true, options: { min: 1, max: 200 } },
        { 
          name: 'author', 
          type: 'relation', 
          required: true,
          relationConfig: {
            collectionId: 'users',
            cascadeDelete: false,
            maxSelect: 1,
            displayFields: ['name', 'email']
          }
        }
      ]
    },
    expectedFeatures: ['single_relation', 'relation_display_fields', 'cascade_delete_config'],
    minimumScore: 75,
    enabled: true,
    tags: ['relations', 'single-relation']
  },

  {
    name: 'multiple-relations',
    description: 'Collection with multiple relation field',
    category: 'relations',
    collectionDefinition: {
      name: 'articles',
      type: 'base',
      fields: [
        { name: 'title', type: 'text', required: true, options: { min: 1, max: 200 } },
        { 
          name: 'tags', 
          type: 'relation', 
          required: false,
          relationConfig: {
            collectionId: 'tags',
            cascadeDelete: false,
            minSelect: 0,
            maxSelect: 10,
            displayFields: ['name']
          }
        },
        { 
          name: 'categories', 
          type: 'relation', 
          required: true,
          relationConfig: {
            collectionId: 'categories',
            cascadeDelete: false,
            minSelect: 1,
            maxSelect: 3,
            displayFields: ['name', 'description']
          }
        }
      ]
    },
    expectedFeatures: ['multiple_relations', 'min_max_select', 'relation_validation'],
    minimumScore: 70,
    enabled: true,
    tags: ['relations', 'multiple-relations']
  },

  {
    name: 'cascade-delete-relations',
    description: 'Collection with cascade delete relation configuration',
    category: 'relations',
    collectionDefinition: {
      name: 'comments',
      type: 'base',
      fields: [
        { name: 'content', type: 'text', required: true, options: { min: 1, max: 1000 } },
        { 
          name: 'post', 
          type: 'relation', 
          required: true,
          relationConfig: {
            collectionId: 'posts',
            cascadeDelete: true,
            maxSelect: 1,
            displayFields: ['title']
          }
        },
        { 
          name: 'author', 
          type: 'relation', 
          required: true,
          relationConfig: {
            collectionId: 'users',
            cascadeDelete: false,
            maxSelect: 1,
            displayFields: ['name']
          }
        }
      ]
    },
    expectedFeatures: ['cascade_delete', 'mixed_cascade_config', 'relation_dependencies'],
    minimumScore: 70,
    enabled: true,
    tags: ['relations', 'cascade-delete']
  }
];

/**
 * Collection update test scenarios
 */
export const updateScenarios: TestScenario[] = [
  {
    name: 'add-field-update',
    description: 'Test adding fields to existing collection',
    category: 'updates',
    collectionDefinition: {
      name: 'evolving_collection',
      type: 'base',
      fields: [
        { name: 'title', type: 'text', required: true, options: { min: 1, max: 100 } }
      ],
      updateOperations: [
        {
          type: 'add_field',
          target: 'description',
          definition: { name: 'description', type: 'text', required: false, options: { max: 500 } },
          description: 'Add description field'
        },
        {
          type: 'add_field',
          target: 'status',
          definition: { name: 'status', type: 'select', required: true, options: { maxSelect: 1, values: ['draft', 'published', 'archived'] } },
          description: 'Add status field'
        }
      ]
    },
    expectedFeatures: ['field_addition', 'schema_evolution', 'backward_compatibility'],
    minimumScore: 75,
    enabled: true,
    tags: ['updates', 'field-addition']
  },

  {
    name: 'add-index-update',
    description: 'Test adding indexes to existing collection',
    category: 'updates',
    collectionDefinition: {
      name: 'indexed_collection',
      type: 'base',
      fields: [
        { name: 'email', type: 'email', required: true },
        { name: 'username', type: 'text', required: true, options: { min: 3, max: 30 } }
      ],
      updateOperations: [
        {
          type: 'add_index',
          target: 'email_unique',
          definition: 'CREATE UNIQUE INDEX idx_email_unique ON indexed_collection (email)',
          description: 'Add unique index on email'
        },
        {
          type: 'add_index',
          target: 'username_unique',
          definition: 'CREATE UNIQUE INDEX idx_username_unique ON indexed_collection (username)',
          description: 'Add unique index on username'
        }
      ]
    },
    expectedFeatures: ['index_addition', 'unique_constraints', 'performance_optimization'],
    minimumScore: 80,
    enabled: true,
    tags: ['updates', 'indexes']
  }
];

/**
 * All test scenarios combined
 */
export const allScenarios: TestScenario[] = [
  ...basicScenarios,
  ...fieldTypeScenarios,
  ...indexRuleScenarios,
  ...authScenarios,
  ...relationScenarios,
  ...updateScenarios
];

/**
 * Test scenario configuration interface
 */
export interface TestScenarioConfig {
  enabledCategories?: TestScenario['category'][];
  disabledCategories?: TestScenario['category'][];
  enabledScenarios?: string[];
  disabledScenarios?: string[];
  tags?: string[];
  excludeTags?: string[];
  minimumScore?: number;
  customScenarios?: TestScenario[];
}

/**
 * Default test configuration
 */
export const defaultConfig: TestScenarioConfig = {
  enabledCategories: ['basic', 'field-types', 'indexes', 'rules', 'auth', 'relations', 'updates'],
  minimumScore: 70
};

/**
 * Get scenarios by category
 */
export function getScenariosByCategory(category: TestScenario['category']): TestScenario[] {
  return allScenarios.filter(scenario => scenario.category === category);
}

/**
 * Get scenario by name
 */
export function getScenarioByName(name: string): TestScenario | undefined {
  return allScenarios.find(scenario => scenario.name === name);
}

/**
 * Filter scenarios based on configuration
 */
export function getFilteredScenarios(config: TestScenarioConfig = defaultConfig): TestScenario[] {
  let scenarios = [...allScenarios];

  // Add custom scenarios if provided
  if (config.customScenarios) {
    scenarios = [...scenarios, ...config.customScenarios];
  }

  // Filter by enabled categories
  if (config.enabledCategories && config.enabledCategories.length > 0) {
    scenarios = scenarios.filter(scenario => config.enabledCategories!.includes(scenario.category));
  }

  // Filter out disabled categories
  if (config.disabledCategories && config.disabledCategories.length > 0) {
    scenarios = scenarios.filter(scenario => !config.disabledCategories!.includes(scenario.category));
  }

  // Filter by enabled scenarios
  if (config.enabledScenarios && config.enabledScenarios.length > 0) {
    scenarios = scenarios.filter(scenario => config.enabledScenarios!.includes(scenario.name));
  }

  // Filter out disabled scenarios
  if (config.disabledScenarios && config.disabledScenarios.length > 0) {
    scenarios = scenarios.filter(scenario => !config.disabledScenarios!.includes(scenario.name));
  }

  // Filter by tags
  if (config.tags && config.tags.length > 0) {
    scenarios = scenarios.filter(scenario => 
      scenario.tags && scenario.tags.some(tag => config.tags!.includes(tag))
    );
  }

  // Filter out excluded tags
  if (config.excludeTags && config.excludeTags.length > 0) {
    scenarios = scenarios.filter(scenario => 
      !scenario.tags || !scenario.tags.some(tag => config.excludeTags!.includes(tag))
    );
  }

  // Filter by minimum score
  if (config.minimumScore !== undefined) {
    scenarios = scenarios.filter(scenario => scenario.minimumScore >= config.minimumScore!);
  }

  // Filter by enabled flag
  scenarios = scenarios.filter(scenario => scenario.enabled !== false);

  // Filter out scenarios with skip reasons
  scenarios = scenarios.filter(scenario => !scenario.skipReason);

  return scenarios;
}

/**
 * Get scenarios by tags
 */
export function getScenariosByTags(tags: string[]): TestScenario[] {
  return allScenarios.filter(scenario => 
    scenario.tags && scenario.tags.some(tag => tags.includes(tag))
  );
}

/**
 * Get all available categories
 */
export function getAvailableCategories(): TestScenario['category'][] {
  return Array.from(new Set(allScenarios.map(scenario => scenario.category)));
}

/**
 * Get all available tags
 */
export function getAvailableTags(): string[] {
  const tags = new Set<string>();
  allScenarios.forEach(scenario => {
    if (scenario.tags) {
      scenario.tags.forEach(tag => tags.add(tag));
    }
  });
  return Array.from(tags);
}

/**
 * Validate scenario configuration
 */
export function validateScenarioConfig(config: TestScenarioConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const availableCategories = getAvailableCategories();
  const availableTags = getAvailableTags();
  const availableScenarios = allScenarios.map(s => s.name);

  // Validate categories
  if (config.enabledCategories) {
    const invalidCategories = config.enabledCategories.filter(cat => !availableCategories.includes(cat));
    if (invalidCategories.length > 0) {
      errors.push(`Invalid enabled categories: ${invalidCategories.join(', ')}`);
    }
  }

  if (config.disabledCategories) {
    const invalidCategories = config.disabledCategories.filter(cat => !availableCategories.includes(cat));
    if (invalidCategories.length > 0) {
      errors.push(`Invalid disabled categories: ${invalidCategories.join(', ')}`);
    }
  }

  // Validate scenarios
  if (config.enabledScenarios) {
    const invalidScenarios = config.enabledScenarios.filter(name => !availableScenarios.includes(name));
    if (invalidScenarios.length > 0) {
      errors.push(`Invalid enabled scenarios: ${invalidScenarios.join(', ')}`);
    }
  }

  if (config.disabledScenarios) {
    const invalidScenarios = config.disabledScenarios.filter(name => !availableScenarios.includes(name));
    if (invalidScenarios.length > 0) {
      errors.push(`Invalid disabled scenarios: ${invalidScenarios.join(', ')}`);
    }
  }

  // Validate tags
  if (config.tags) {
    const invalidTags = config.tags.filter(tag => !availableTags.includes(tag));
    if (invalidTags.length > 0) {
      errors.push(`Invalid tags: ${invalidTags.join(', ')}`);
    }
  }

  if (config.excludeTags) {
    const invalidTags = config.excludeTags.filter(tag => !availableTags.includes(tag));
    if (invalidTags.length > 0) {
      errors.push(`Invalid exclude tags: ${invalidTags.join(', ')}`);
    }
  }

  // Validate minimum score
  if (config.minimumScore !== undefined && (config.minimumScore < 0 || config.minimumScore > 100)) {
    errors.push('Minimum score must be between 0 and 100');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Load configuration from environment variables
 */
export function loadConfigFromEnv(): TestScenarioConfig {
  const config: TestScenarioConfig = {};

  // Parse enabled categories
  if (process.env.E2E_ENABLED_CATEGORIES) {
    config.enabledCategories = process.env.E2E_ENABLED_CATEGORIES.split(',').map(s => s.trim()) as TestScenario['category'][];
  }

  // Parse disabled categories
  if (process.env.E2E_DISABLED_CATEGORIES) {
    config.disabledCategories = process.env.E2E_DISABLED_CATEGORIES.split(',').map(s => s.trim()) as TestScenario['category'][];
  }

  // Parse enabled scenarios
  if (process.env.E2E_ENABLED_SCENARIOS) {
    config.enabledScenarios = process.env.E2E_ENABLED_SCENARIOS.split(',').map(s => s.trim());
  }

  // Parse disabled scenarios
  if (process.env.E2E_DISABLED_SCENARIOS) {
    config.disabledScenarios = process.env.E2E_DISABLED_SCENARIOS.split(',').map(s => s.trim());
  }

  // Parse tags
  if (process.env.E2E_TAGS) {
    config.tags = process.env.E2E_TAGS.split(',').map(s => s.trim());
  }

  // Parse exclude tags
  if (process.env.E2E_EXCLUDE_TAGS) {
    config.excludeTags = process.env.E2E_EXCLUDE_TAGS.split(',').map(s => s.trim());
  }

  // Parse minimum score
  if (process.env.E2E_MINIMUM_SCORE) {
    const score = parseInt(process.env.E2E_MINIMUM_SCORE, 10);
    if (!isNaN(score)) {
      config.minimumScore = score;
    }
  }

  return config;
}

/**
 * Create a scenario configuration for quick testing
 */
export function createQuickTestConfig(scenarioNames: string[]): TestScenarioConfig {
  return {
    enabledScenarios: scenarioNames,
    minimumScore: 0
  };
}

/**
 * Create a scenario configuration for comprehensive testing
 */
export function createComprehensiveTestConfig(): TestScenarioConfig {
  return {
    enabledCategories: ['basic', 'field-types', 'indexes', 'rules', 'auth', 'relations', 'updates'],
    minimumScore: 70
  };
}

/**
 * Create a scenario configuration for basic testing
 */
export function createBasicTestConfig(): TestScenarioConfig {
  return {
    enabledCategories: ['basic', 'field-types'],
    minimumScore: 80
  };
}