# E2E Test Scenario Configuration

This directory contains configuration files for the E2E test scenario system. The configuration system allows you to customize which test scenarios are executed, providing flexibility for different testing needs.

## Configuration Files

### `scenarios.json`
Main configuration file that controls which scenarios are executed.

```json
{
  "enabledCategories": ["basic", "field-types", "indexes", "rules", "auth", "relations"],
  "disabledScenarios": [],
  "tags": [],
  "excludeTags": [],
  "minimumScore": 70
}
```

### `custom-scenarios.json`
Custom scenario definitions that extend the built-in scenarios.

```json
[
  {
    "name": "custom-blog-post",
    "description": "Custom blog post collection with rich content",
    "category": "basic",
    "collectionDefinition": {
      "name": "blog_posts",
      "type": "base",
      "fields": [
        {
          "name": "title",
          "type": "text",
          "required": true,
          "options": { "min": 5, "max": 200 }
        }
      ]
    },
    "expectedFeatures": ["text_fields"],
    "minimumScore": 75,
    "enabled": true,
    "tags": ["custom", "blog"]
  }
]
```

## Configuration Options

### Category Filtering
- `enabledCategories`: Array of categories to include
- `disabledCategories`: Array of categories to exclude

Available categories:
- `basic`: Basic collection creation scenarios
- `field-types`: All supported field type scenarios
- `indexes`: Index and constraint scenarios
- `rules`: API rule scenarios
- `auth`: Authentication collection scenarios
- `relations`: Relation field scenarios
- `updates`: Collection update scenarios

### Scenario Filtering
- `enabledScenarios`: Array of specific scenario names to include
- `disabledScenarios`: Array of specific scenario names to exclude

### Tag Filtering
- `tags`: Array of tags that scenarios must have (OR logic)
- `excludeTags`: Array of tags to exclude

### Score Filtering
- `minimumScore`: Minimum compatibility score threshold (0-100)

## Environment Variables

You can also configure scenarios using environment variables:

```bash
# Categories
export E2E_ENABLED_CATEGORIES="basic,field-types"
export E2E_DISABLED_CATEGORIES="auth"

# Scenarios
export E2E_ENABLED_SCENARIOS="basic-collection,all-field-types"
export E2E_DISABLED_SCENARIOS="complex-api-rules"

# Tags
export E2E_TAGS="basic,text-fields"
export E2E_EXCLUDE_TAGS="complex"

# Score
export E2E_MINIMUM_SCORE="80"
```

## Configuration Priority

Configuration is loaded in this order (later overrides earlier):
1. Default configuration
2. Configuration file (`scenarios.json`)
3. Environment variables
4. CLI arguments (when using the CLI tool)

## CLI Tool

Use the scenario CLI tool to manage configurations:

```bash
# List all scenarios
npx tsx tests/e2e/cli/scenario-cli.ts list

# List scenarios by category
npx tsx tests/e2e/cli/scenario-cli.ts list --category field-types

# Show available categories
npx tsx tests/e2e/cli/scenario-cli.ts categories

# Show available tags
npx tsx tests/e2e/cli/scenario-cli.ts tags

# Initialize configuration files
npx tsx tests/e2e/cli/scenario-cli.ts config --init

# Validate configuration
npx tsx tests/e2e/cli/scenario-cli.ts config --validate tests/e2e/config/scenarios.json

# Show current configuration
npx tsx tests/e2e/cli/scenario-cli.ts config --show

# Test configuration (dry run)
npx tsx tests/e2e/cli/scenario-cli.ts test --dry-run

# Filter scenarios
npx tsx tests/e2e/cli/scenario-cli.ts filter --categories "basic,field-types" --min-score 80

# Get scenario details
npx tsx tests/e2e/cli/scenario-cli.ts info basic-collection
```

## Built-in Scenarios

### Basic Scenarios
- `basic-collection`: Basic collection with text fields
- `blank-collection`: Empty collection with only system fields

### Field Type Scenarios
- `all-field-types`: Collection with all supported field types
- `file-field-types`: File field configurations
- `geopoint-field-types`: GeoPoint field scenarios
- `select-field-variations`: Different select field configurations

### Index and Rule Scenarios
- `unique-indexes`: Collections with unique constraints
- `api-rules-unrestricted`: Public API access
- `api-rules-restricted`: Auth-required access
- `complex-api-rules`: Complex conditional rules

### Auth Scenarios
- `auth-collection`: Basic auth collection
- `auth-with-manage-rule`: Auth collection with management rules

### Relation Scenarios
- `single-relation`: Single relation field
- `multiple-relations`: Multiple relation fields
- `cascade-delete-relations`: Cascade delete configurations

### Update Scenarios
- `add-field-update`: Adding fields to existing collections
- `add-index-update`: Adding indexes to existing collections

## Custom Scenarios

You can define custom scenarios in `custom-scenarios.json`. Each scenario must include:

- `name`: Unique scenario identifier
- `description`: Human-readable description
- `category`: One of the available categories
- `collectionDefinition`: PocketBase collection structure
- `expectedFeatures`: Array of features this scenario tests
- `minimumScore`: Expected compatibility score (0-100)
- `enabled`: Whether the scenario is enabled (optional, defaults to true)
- `tags`: Array of tags for filtering (optional)

### Collection Definition Structure

```typescript
interface CollectionDefinition {
  name: string;
  type: 'base' | 'auth' | 'view';
  fields: FieldDefinition[];
  indexes?: string[];
  rules?: CollectionRules;
  updateOperations?: UpdateOperation[];
}

interface FieldDefinition {
  name: string;
  type: 'text' | 'editor' | 'number' | 'bool' | 'email' | 'url' | 'date' | 'select' | 'file' | 'relation' | 'json' | 'geoPoint' | 'autodate';
  required?: boolean;
  unique?: boolean;
  options?: Record<string, any>;
  relationConfig?: RelationConfig;
}
```

## Usage in Tests

```typescript
import { ScenarioRunner } from '../utils/scenario-runner.js';

// Use default configuration
const runner = new ScenarioRunner();

// Use custom configuration file
const runner = new ScenarioRunner({
  configPath: 'path/to/config.json'
});

// Use programmatic configuration
const runner = new ScenarioRunner({
  config: {
    enabledCategories: ['basic', 'field-types'],
    minimumScore: 80
  }
});

// Run scenarios
const results = await runner.runScenarios(async (scenario) => {
  // Execute scenario and return result
  return {
    scenario,
    success: true,
    score: 95,
    duration: 1000
  };
});
```

## Best Practices

1. **Start Small**: Begin with basic scenarios and gradually add more complex ones
2. **Use Tags**: Tag scenarios for easy filtering and organization
3. **Set Appropriate Scores**: Set realistic minimum scores based on your requirements
4. **Custom Scenarios**: Create custom scenarios for your specific use cases
5. **Environment Variables**: Use environment variables for CI/CD configuration
6. **Validation**: Always validate configuration files before use

## Troubleshooting

### Configuration Not Loading
- Check file paths are correct
- Ensure JSON syntax is valid
- Verify environment variables are set correctly

### Scenarios Not Running
- Check if scenarios are enabled
- Verify category/tag filters
- Check minimum score requirements
- Look for skip reasons in scenario definitions

### Custom Scenarios Invalid
- Validate JSON structure
- Check required fields are present
- Ensure field types are valid
- Verify collection definition structure