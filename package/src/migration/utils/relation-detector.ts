/**
 * Relation field detection utilities
 */

import { z } from "zod";
import { pluralize } from "./pluralize";

/**
 * Detects if a field is a single relation based on naming convention
 * Single relation: field name matches a collection name (e.g., "User" -> "Users" collection)
 */
function unwrapType(zodType: z.ZodTypeAny): z.ZodTypeAny {
  let unwrappedType = zodType;

  if (unwrappedType instanceof z.ZodOptional) {
    unwrappedType = unwrappedType.unwrap() as z.ZodTypeAny;
  }
  if (unwrappedType instanceof z.ZodNullable) {
    unwrappedType = unwrappedType.unwrap() as z.ZodTypeAny;
  }
  if (unwrappedType instanceof z.ZodDefault) {
    unwrappedType = unwrappedType.unwrap() as z.ZodTypeAny;
  }

  return unwrappedType;
}

function getChecks(zodType: z.ZodTypeAny): any[] {
  const def = (zodType as any).def ?? (zodType as any)._def;
  return (def?.checks ?? []) as any[];
}

function getJsonSchema(zodType: z.ZodTypeAny): any | null {
  try {
    const toJSONSchema = (zodType as any).toJSONSchema;
    return typeof toJSONSchema === "function" ? toJSONSchema.call(zodType) : null;
  } catch {
    return null;
  }
}

export function isSingleRelationField(fieldName: string, zodType: z.ZodTypeAny): boolean {
  const unwrappedType = unwrapType(zodType);

  // Must be a string type
  if (!(unwrappedType instanceof z.ZodString)) {
    return false;
  }

  // Field name should start with uppercase (convention for entity references)
  // and not be a common string field name
  const startsWithUppercase = /^[A-Z]/.test(fieldName);

  // Exclude common string fields that start with uppercase
  const commonStringFields = ["Title", "Name", "Description", "Content", "Summary", "Status", "Type"];
  const isCommonField = commonStringFields.includes(fieldName);

  return startsWithUppercase && !isCommonField;
}

/**
 * Detects if a field is a multiple relation based on naming convention
 * Multiple relation: field name is an array of strings ending with entity name
 * (e.g., "SubscriberUsers" -> "Users" collection)
 */
export function isMultipleRelationField(fieldName: string, zodType: z.ZodTypeAny): boolean {
  const unwrappedType = unwrapType(zodType);

  // Must be an array type
  if (!(unwrappedType instanceof z.ZodArray)) {
    return false;
  }

  // Element type must be string
  const elementType = unwrappedType.element;
  if (!(elementType instanceof z.ZodString)) {
    return false;
  }

  // Field name should contain an uppercase letter (entity reference pattern)
  const hasUppercase = /[A-Z]/.test(fieldName);

  return hasUppercase;
}

/**
 * Resolves the target collection name from a relation field name
 * Examples:
 * - "User" -> "Users"
 * - "SubscriberUsers" -> "Users"
 * - "Author" -> "Authors"
 * - "Category" -> "Categories"
 */
export function resolveTargetCollection(fieldName: string): string {
  // For single relations, the field name is typically the entity name
  // For multiple relations, extract the entity name from the end

  // Check if field name ends with a known plural entity name
  // Common patterns: "SubscriberUsers", "RelatedPosts", "Tags"

  // Try to find the entity name by looking for uppercase letters
  const matches = fieldName.match(/[A-Z][a-z]+/g);

  if (!matches || matches.length === 0) {
    // Fallback: pluralize the entire field name
    return pluralize(fieldName);
  }

  // Take the last matched entity name (e.g., "Users" from "SubscriberUsers")
  const entityName = matches[matches.length - 1];

  // Pluralize the entity name to get collection name
  return pluralize(entityName);
}

/**
 * Detects if a field is any type of relation (single or multiple)
 */
export function isRelationField(fieldName: string, zodType: z.ZodTypeAny): boolean {
  return isSingleRelationField(fieldName, zodType) || isMultipleRelationField(fieldName, zodType);
}

/**
 * Gets the maximum number of relations allowed for a relation field
 * Returns 1 for single relations, or the max constraint for multiple relations
 */
export function getMaxSelect(fieldName: string, zodType: z.ZodTypeAny): number {
  if (isSingleRelationField(fieldName, zodType)) {
    return 1;
  }

  if (isMultipleRelationField(fieldName, zodType)) {
    const unwrappedType = unwrapType(zodType);
    if (unwrappedType instanceof z.ZodArray) {
      const checks = getChecks(unwrappedType);
      const maxCheck = checks.find((check) => check.kind === "max");
      if (maxCheck) {
        return maxCheck.value;
      }
      const schema = getJsonSchema(unwrappedType);
      if (schema && typeof schema.maxItems === "number") {
        return schema.maxItems;
      }
      // Default to 999 for multiple relations without explicit max
      return 999;
    }
  }

  return 1;
}

/**
 * Gets the minimum number of relations required for a relation field
 * Returns 0 as default for all relation fields (single or multiple)
 * PocketBase always expects minSelect to be defined for relation fields
 */
export function getMinSelect(fieldName: string, zodType: z.ZodTypeAny): number {
  // For single relations, always return 0
  if (isSingleRelationField(fieldName, zodType)) {
    return 0;
  }

  // For multiple relations, check for explicit min constraint
  if (isMultipleRelationField(fieldName, zodType)) {
    const unwrappedType = unwrapType(zodType);
    if (unwrappedType instanceof z.ZodArray) {
      const checks = getChecks(unwrappedType);
      const minCheck = checks.find((check) => check.kind === "min");
      if (minCheck) {
        return minCheck.value;
      }
      const schema = getJsonSchema(unwrappedType);
      if (schema && typeof schema.minItems === "number") {
        return schema.minItems;
      }
    }
  }

  // Default to 0 for all relation fields
  return 0;
}
