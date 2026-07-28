import { z } from "zod";
import { extractRelationMetadata } from "../../schema/base";
import { extractFieldMetadata } from "../../schema/fields";
import type { PermissionSchema } from "../../utils/permissions";
import { PermissionAnalyzer } from "../permission-analyzer";
import type { CollectionSchema, FieldDefinition } from "../types";
import { getMaxSelect, getMinSelect, isRelationField, resolveTargetCollection } from "../utils/relation-detector";
import {
  extractFieldOptions,
  filterSupportedFieldOptions,
  isFieldRequired,
  mapZodTypeToPocketBase,
  unwrapZodType,
} from "../utils/type-mapper";
import { validateViewQuery } from "../../schema/view";
import {
  extractCollectionTypeFromSchema,
  extractFieldDefinitions,
  extractIndexes,
  extractViewQueryFromSchema,
} from "./extractors";
import { generateFieldId } from "../utils/collection-id-generator.js";
import { getAuthSystemFields } from "../generator/utils";

/**
 * Detects if a collection is an auth collection
 * Auth collections have email and password fields
 *
 * @param fields - Array of field definitions
 * @returns True if the collection is an auth collection
 */
export function isAuthCollection(fields: Array<{ name: string; zodType: z.ZodTypeAny }>): boolean {
  const fieldNames = fields.map((f) => f.name.toLowerCase());

  // Auth collections must have both email and password fields
  const hasEmail = fieldNames.includes("email");
  const hasPassword = fieldNames.includes("password");

  return hasEmail && hasPassword;
}

/**
 * Extracts validation constraints from Zod type
 * Includes min, max, required, unique, and other options
 *
 * @param fieldName - The field name
 * @param zodType - The Zod type
 * @returns Field definition with constraints
 */
export function buildFieldDefinition(fieldName: string, zodType: z.ZodTypeAny): FieldDefinition {
  // Check for explicit field metadata first (from field helper functions)
  const unwrappedType = unwrapZodType(zodType);
  const fieldMetadata = extractFieldMetadata(unwrappedType.description ?? zodType.description);

  if (fieldMetadata) {
    // Use explicit metadata from field helpers
    // For number fields, default to required: false unless explicitly set
    // (because required: true in PocketBase means non-zero, which is often not desired)
    let required: boolean;
    if (fieldMetadata.type === "number") {
      // Check if required is explicitly set in options
      if (fieldMetadata.options?.required !== undefined) {
        required = fieldMetadata.options.required;
      } else {
        // Default to false for number fields to allow zero values
        // This allows zero values (e.g., progress: 0-100) unless explicitly set to required: true
        required = false;
      }
    } else {
      // For other field types, use standard logic
      required = isFieldRequired(zodType);
    }

    // Remove 'required' from options if present (it's a top-level property, not an option)
    const { required: _required, ...metadataOptions } = fieldMetadata.options || {};

    // A validator chained onto a field helper (`TextField().max(60)`, or a
    // shared rule reused with `.regex(...)`) states the same constraint as the
    // helper's own options, so both are read. The helper wins where they
    // overlap: its options are what the caller wrote for PocketBase.
    const options = { ...extractChainedFieldOptions(fieldMetadata.type, unwrappedType), ...metadataOptions };

    const fieldDef: FieldDefinition = {
      name: fieldName,
      id: generateFieldId(fieldMetadata.type, fieldName),
      type: fieldMetadata.type,
      required,
      options: filterSupportedFieldOptions(fieldMetadata.type, Object.keys(options).length > 0 ? options : undefined),
      zodType: zodType,
    };

    // If it's a relation type from metadata, we still need to extract relation config
    if (fieldMetadata.type === "relation") {
      const relationMetadata = extractRelationMetadata(unwrappedType.description ?? zodType.description);
      if (relationMetadata) {
        fieldDef.relation = {
          collection: relationMetadata.collection,
          maxSelect: relationMetadata.maxSelect,
          minSelect: relationMetadata.minSelect,
          cascadeDelete: relationMetadata.cascadeDelete,
          displayFields: relationMetadata.displayFields,
        };
      }
    }

    return fieldDef;
  }

  // Fall back to existing type inference logic
  const fieldType = mapZodTypeToPocketBase(zodType, fieldName);
  const required = isFieldRequired(zodType);
  const options = extractFieldOptions(zodType);

  const fieldDef: FieldDefinition = {
    name: fieldName,
    id: generateFieldId(fieldType, fieldName),
    type: fieldType,
    required,
    options,
    zodType: zodType,
  };

  // Check for explicit relation metadata first (from relation() or relations() helpers)
  const relationMetadata = extractRelationMetadata(unwrappedType.description ?? zodType.description);

  if (relationMetadata) {
    // Explicit relation definition found
    fieldDef.type = "relation";
    fieldDef.relation = {
      collection: relationMetadata.collection,
      maxSelect: relationMetadata.maxSelect,
      minSelect: relationMetadata.minSelect,
      cascadeDelete: relationMetadata.cascadeDelete,
      displayFields: relationMetadata.displayFields,
    };

    // Clear out string-specific options that don't apply to relation fields
    fieldDef.options = undefined;
  }
  // Fall back to naming convention detection for backward compatibility
  else if (isRelationField(fieldName, zodType)) {
    // Override type to 'relation' for relation fields
    fieldDef.type = "relation";

    const targetCollection = resolveTargetCollection(fieldName);
    const maxSelect = getMaxSelect(fieldName, zodType);
    const minSelect = getMinSelect(fieldName, zodType);

    fieldDef.relation = {
      collection: targetCollection,
      maxSelect,
      minSelect,
      cascadeDelete: false, // Default to false, can be configured later
      displayFields: null,
    };

    // Clear out string-specific options that don't apply to relation fields
    // Options like 'min', 'max', 'pattern' are from string validation and don't apply to relations
    if (fieldDef.options) {
      const { min: _min, max: _max, pattern: _pattern, ...relationSafeOptions } = fieldDef.options;
      fieldDef.options = Object.keys(relationSafeOptions).length ? relationSafeOptions : undefined;
    }
  }

  // Special handling for autodate fields
  if (fieldDef.type === "autodate") {
    // Autodate fields shouldn't have pattern or other string options
    // and should have onCreate/onUpdate set by default
    fieldDef.options = {
      onCreate: true,
      onUpdate: true,
      ...(fieldDef.options || {}),
    };
    // Remove options that don't apply to autodate
    delete fieldDef.options.pattern;
    delete fieldDef.options.min;
    delete fieldDef.options.max;
  }

  // Zod validators are richer than PocketBase's option set, and the type is
  // only settled here (relation detection above can still change it), so the
  // unsupported leftovers are dropped last
  fieldDef.options = filterSupportedFieldOptions(fieldDef.type, fieldDef.options);

  return fieldDef;
}

/**
 * Field types whose PocketBase options mean the same thing as the Zod
 * validators they are read from.
 *
 * The rest are excluded because the same validator says something else there: a
 * `date` field is spelled as a Zod string, so `.min()` on it is a *length*, not
 * an earliest date, and `autodate`/`editor`/`json` carry no constraint
 * PocketBase would store. Reading those would invent options the schema never
 * declared.
 */
const TYPES_READING_CHAINED_VALIDATORS = new Set(["text", "password", "number", "select", "file"]);

/**
 * Reads the options a field helper's Zod validators declare, for the field
 * types where the two line up.
 *
 * `TextField()` records what was passed to it, which leaves anything chained
 * afterwards (`TextField().max(60).regex(...)`, or a reusable rule the helper
 * wraps) visible only in the Zod schema.
 *
 * @param fieldType - The PocketBase field type from the helper's metadata
 * @param unwrappedType - The Zod type with optional/default/nullable removed
 * @returns The options the validators declare, empty when the type opts out
 */
function extractChainedFieldOptions(fieldType: string, unwrappedType: z.ZodTypeAny): Record<string, any> {
  if (!TYPES_READING_CHAINED_VALIDATORS.has(fieldType)) {
    return {};
  }

  return extractFieldOptions(unwrappedType);
}

/**
 * Converts a Zod schema to a CollectionSchema interface
 *
 * @param collectionName - The name of the collection
 * @param zodSchema - The Zod object schema
 * @returns CollectionSchema definition
 */
export function convertZodSchemaToCollectionSchema(
  collectionName: string,
  zodSchema: z.ZodObject<any>
): CollectionSchema {
  // Extract field definitions from Zod schema
  const rawFields = extractFieldDefinitions(zodSchema);

  // Determine collection type (auth, view or base)
  // Prefer explicit type from metadata, fall back to field detection
  const explicitType = extractCollectionTypeFromSchema(zodSchema);
  const collectionType = explicitType ?? (isAuthCollection(rawFields) ? "auth" : "base");
  const isView = collectionType === "view";

  // View collections are backed by SQL - the query is required
  const viewQuery = extractViewQueryFromSchema(zodSchema);
  if (isView) {
    validateViewQuery(collectionName, viewQuery);
  } else if (viewQuery !== null) {
    console.warn(
      `[${collectionName}] viewQuery is only used by view collections and will be ignored. ` +
        `Use defineView() or set type: "view" to define a view collection.`
    );
  }

  // Build field definitions with constraints
  const fields: FieldDefinition[] = rawFields
    // Explicitly filter out system fields that might have slipped through
    // This can happen if the schema was constructed manually without base schema
    .filter((f) => !["created", "updated"].includes(f.name))
    .map(({ name, zodType }) => buildFieldDefinition(name, zodType));

  // Ensure auth system fields exist for auth collections
  if (collectionType === "auth") {
    // These fields are required for auth collections and should match the
    // native CLI output. The generator writes its own definitions for them
    // (getAuthSystemFields), so taking the options from the same place keeps
    // the analyzed schema equal to what replaying the generated migration
    // reads back — otherwise every run re-emits the same field modifications
    const authSystemFields = getAuthSystemFields();

    // Add or update auth fields
    for (const authField of authSystemFields) {
      const existingFieldIndex = fields.findIndex((f) => f.name === authField.name);

      if (existingFieldIndex !== -1) {
        // Update existing field to ensure correct type and required status
        const existingField = fields[existingFieldIndex];

        // Merge options: defaults -> existing -> forced overrides (none currently)
        // We want to ensure specific options like min/max match defaults if not set
        const mergedOptions = { ...authField.options, ...existingField.options };

        fields[existingFieldIndex] = {
          ...existingField,
          type: authField.type, // Force correct type (e.g. 'text' -> 'password')
          required: authField.required, // Force correct required status
          options: mergedOptions,
        };
      } else {
        // Add missing field
        fields.push({
          name: authField.name,
          id: generateFieldId(authField.type, authField.name),
          type: authField.type,
          required: authField.required,
          options: authField.options,
        });
      }
    }
  }

  // Extract indexes from schema
  // View collections cannot have indexes - PocketBase rejects them
  const indexes = extractIndexes(zodSchema) || [];
  if (isView && indexes.length > 0) {
    throw new Error(
      `View collection "${collectionName}" cannot declare indexes. ` +
        `PocketBase view collections are backed by a SQL query and do not support indexes.`
    );
  }

  // Extract and validate permissions from schema
  const permissionAnalyzer = new PermissionAnalyzer();
  let permissions: PermissionSchema | undefined = undefined;

  // Try to extract permissions from schema description
  const schemaDescription = zodSchema.description;
  const extractedPermissions = permissionAnalyzer.extractPermissions(schemaDescription);

  if (extractedPermissions) {
    // Resolve template configurations to concrete rules
    const resolvedPermissions = permissionAnalyzer.resolvePermissions(extractedPermissions);

    // View collections are read-only - warn and drop any write rules
    if (isView) {
      for (const ruleType of ["createRule", "updateRule", "deleteRule", "manageRule"] as const) {
        if (resolvedPermissions[ruleType]) {
          console.warn(
            `[${collectionName}] ${ruleType} is not supported on view collections and will be set to null.`
          );
        }
        resolvedPermissions[ruleType] = null;
      }
    }

    // Validate permissions against collection fields
    // Skipped for views: their real fields come from the SQL query, so field
    // references in the rules can't be checked against the Zod shape
    if (!isView) {
      const validationResults = permissionAnalyzer.validatePermissions(
        collectionName,
        resolvedPermissions,
        fields,
        collectionType === "auth"
      );

      // Log validation errors and warnings
      for (const [ruleType, result] of validationResults) {
        if (!result.valid) {
          console.error(`[${collectionName}] Permission validation failed for ${ruleType}:`);
          result.errors.forEach((error) => console.error(`  - ${error}`));
        }

        if (result.warnings.length > 0) {
          console.warn(`[${collectionName}] Permission warnings for ${ruleType}:`);
          result.warnings.forEach((warning) => console.warn(`  - ${warning}`));
        }
      }
    }

    // Merge with defaults to ensure all rules are defined
    permissions = permissionAnalyzer.mergeWithDefaults(resolvedPermissions);
  }

  // Build collection schema
  // Use extracted permissions for rules, falling back to nulls
  const collectionSchema: CollectionSchema = {
    name: collectionName,
    type: collectionType,
    fields,
    indexes,
    rules: {
      listRule: permissions?.listRule ?? null,
      viewRule: permissions?.viewRule ?? null,
      createRule: permissions?.createRule ?? null,
      updateRule: permissions?.updateRule ?? null,
      deleteRule: permissions?.deleteRule ?? null,
      // Omit manageRule for base collections to match native CLI behavior
      manageRule: collectionType === "auth" ? (permissions?.manageRule ?? null) : undefined,
    },
    permissions,
  };

  if (isView) {
    collectionSchema.viewQuery = viewQuery as string;
  }

  return collectionSchema;
}
