import type { PermissionSchema, PermissionTemplateConfig, RuleExpression } from "./permissions";

/**
 * Predefined permission templates for common access control patterns
 */
export const PermissionTemplates = {
  /**
   * Public access - anyone can perform all operations
   */
  public: (): PermissionSchema => ({
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
  }),

  /**
   * Authenticated users only - requires valid authentication for all operations
   */
  authenticated: (): PermissionSchema => ({
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
  }),

  /**
   * Owner-only access - users can only manage their own records
   * @param ownerField - Name of the relation field pointing to user (default: 'User')
   */
  ownerOnly: (ownerField: string = "User"): PermissionSchema => ({
    listRule: `@request.auth.id != "" && ${ownerField} = @request.auth.id`,
    viewRule: `@request.auth.id != "" && ${ownerField} = @request.auth.id`,
    createRule: '@request.auth.id != ""',
    updateRule: `@request.auth.id != "" && ${ownerField} = @request.auth.id`,
    deleteRule: `@request.auth.id != "" && ${ownerField} = @request.auth.id`,
  }),

  /**
   * Admin/superuser only access
   * Assumes a 'role' field exists with 'admin' value
   * @param roleField - Name of the role field (default: 'role')
   */
  adminOnly: (roleField: string = "role"): PermissionSchema => ({
    listRule: `@request.auth.id != "" && @request.auth.${roleField} = "admin"`,
    viewRule: `@request.auth.id != "" && @request.auth.${roleField} = "admin"`,
    createRule: `@request.auth.id != "" && @request.auth.${roleField} = "admin"`,
    updateRule: `@request.auth.id != "" && @request.auth.${roleField} = "admin"`,
    deleteRule: `@request.auth.id != "" && @request.auth.${roleField} = "admin"`,
  }),

  /**
   * Public read, authenticated write
   * Anyone can list/view, but only authenticated users can create/update/delete
   */
  readPublic: (): PermissionSchema => ({
    listRule: "",
    viewRule: "",
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
  }),

  /**
   * Locked access - only superusers can perform operations
   * All rules are set to null (locked)
   */
  locked: (): PermissionSchema => ({
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  }),

  /**
   * Read-only authenticated - authenticated users can read, no write access
   */
  readOnlyAuthenticated: (): PermissionSchema => ({
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: null,
    updateRule: null,
    deleteRule: null,
  }),
};

/**
 * Resolve template configuration to concrete permission schema
 * @param config - Template configuration or direct permission schema
 * @returns Resolved permission schema with all rules defined
 */
export function resolveTemplate(config: PermissionTemplateConfig): PermissionSchema {
  let baseRules: PermissionSchema;

  switch (config.template) {
    case "public":
      baseRules = PermissionTemplates.public();
      break;
    case "authenticated":
      baseRules = PermissionTemplates.authenticated();
      break;
    case "owner-only":
      baseRules = PermissionTemplates.ownerOnly(config.ownerField);
      break;
    case "admin-only":
      baseRules = PermissionTemplates.adminOnly(config.roleField);
      break;
    case "read-public":
      baseRules = PermissionTemplates.readPublic();
      break;
    case "custom":
      baseRules = {};
      break;
    default: {
      // Exhaustive check - TypeScript will error if we miss a template type
      const _exhaustive: never = config.template;
      throw new Error(`Unknown template type: ${_exhaustive}`);
    }
  }

  // Merge with custom rules if provided (custom rules override template rules)
  return {
    ...baseRules,
    ...config.customRules,
  };
}

/**
 * Check if a configuration is a template config or direct permission schema
 * @param config - Configuration to check
 * @returns True if it's a template configuration
 */
export function isTemplateConfig(
  config: PermissionTemplateConfig | PermissionSchema
): config is PermissionTemplateConfig {
  return "template" in config;
}

/**
 * Check if a configuration is a direct permission schema
 * @param config - Configuration to check
 * @returns True if it's a direct permission schema
 */
export function isPermissionSchema(config: PermissionTemplateConfig | PermissionSchema): config is PermissionSchema {
  return (
    "listRule" in config ||
    "viewRule" in config ||
    "createRule" in config ||
    "updateRule" in config ||
    "deleteRule" in config ||
    "manageRule" in config
  );
}

/**
 * Validation result for permission configuration
 */
export interface PermissionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a permission configuration
 * @param config - Permission configuration to validate
 * @param isAuthCollection - Whether this is for an auth collection
 * @returns Validation result
 */
export function validatePermissionConfig(
  config: PermissionTemplateConfig | PermissionSchema,
  isAuthCollection: boolean = false
): PermissionValidationResult {
  const result: PermissionValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // Resolve to permission schema
  let permissions: PermissionSchema;
  if (isTemplateConfig(config)) {
    // Validate template config
    if (config.template === "owner-only" && !config.ownerField) {
      result.warnings.push("owner-only template without ownerField specified - using default 'User'");
    }
    if (config.template === "admin-only" && !config.roleField) {
      result.warnings.push("admin-only template without roleField specified - using default 'role'");
    }
    permissions = resolveTemplate(config);
  } else {
    permissions = config;
  }

  // Validate manageRule usage
  if (permissions.manageRule !== undefined && !isAuthCollection) {
    result.errors.push("manageRule is only valid for auth collections");
    result.valid = false;
  }

  // Validate rule expressions
  const ruleTypes: (keyof PermissionSchema)[] = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"];
  if (isAuthCollection) {
    ruleTypes.push("manageRule");
  }

  for (const ruleType of ruleTypes) {
    const rule = permissions[ruleType];
    if (rule !== undefined && rule !== null && rule !== "") {
      const ruleValidation = validateRuleExpression(rule);
      if (!ruleValidation.valid) {
        result.errors.push(`${ruleType}: ${ruleValidation.errors.join(", ")}`);
        result.valid = false;
      }
      result.warnings.push(...ruleValidation.warnings.map((w) => `${ruleType}: ${w}`));
    }
  }

  return result;
}

/**
 * Validate a single rule expression for basic syntax
 * @param expression - Rule expression to validate
 * @returns Validation result
 */
export function validateRuleExpression(expression: RuleExpression): PermissionValidationResult {
  const result: PermissionValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // Null and empty string are always valid
  if (expression === null || expression === "") {
    return result;
  }

  // Check for balanced parentheses
  let parenCount = 0;
  for (const char of expression) {
    if (char === "(") parenCount++;
    if (char === ")") parenCount--;
    if (parenCount < 0) {
      result.errors.push("Unbalanced parentheses");
      result.valid = false;
      return result;
    }
  }
  if (parenCount !== 0) {
    result.errors.push("Unbalanced parentheses");
    result.valid = false;
  }

  // Check for common mistakes
  if (expression.includes("==")) {
    result.warnings.push("Use '=' instead of '==' for equality comparison");
  }

  // Check for valid @request references
  const requestRefs = expression.match(/@request\.[a-zA-Z_][a-zA-Z0-9_.]*/g) || [];
  for (const ref of requestRefs) {
    const isValid =
      ref.startsWith("@request.auth.") ||
      ref === "@request.method" ||
      ref === "@request.context" ||
      ref.startsWith("@request.body.") ||
      ref.startsWith("@request.query.") ||
      ref.startsWith("@request.headers.");

    if (!isValid) {
      result.errors.push(`Invalid @request reference: '${ref}'`);
      result.valid = false;
    }
  }

  return result;
}

/**
 * Create a custom permission schema with type safety
 * @param permissions - Partial permission schema
 * @returns Complete permission schema with null defaults
 */
export function createPermissions(permissions: Partial<PermissionSchema>): PermissionSchema {
  return {
    listRule: permissions.listRule ?? null,
    viewRule: permissions.viewRule ?? null,
    createRule: permissions.createRule ?? null,
    updateRule: permissions.updateRule ?? null,
    deleteRule: permissions.deleteRule ?? null,
    manageRule: permissions.manageRule ?? null,
  };
}

/**
 * Merge multiple permission schemas, with later schemas taking precedence
 * @param schemas - Permission schemas to merge
 * @returns Merged permission schema
 */
export function mergePermissions(...schemas: Partial<PermissionSchema>[]): PermissionSchema {
  const merged: PermissionSchema = {
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    manageRule: null,
  };

  for (const schema of schemas) {
    if (schema.listRule !== undefined) merged.listRule = schema.listRule;
    if (schema.viewRule !== undefined) merged.viewRule = schema.viewRule;
    if (schema.createRule !== undefined) merged.createRule = schema.createRule;
    if (schema.updateRule !== undefined) merged.updateRule = schema.updateRule;
    if (schema.deleteRule !== undefined) merged.deleteRule = schema.deleteRule;
    if (schema.manageRule !== undefined) merged.manageRule = schema.manageRule;
  }

  return merged;
}
