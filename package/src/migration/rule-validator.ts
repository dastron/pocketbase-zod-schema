/**
 * Rule validator for PocketBase API rule expressions
 *
 * Validates permission rule expressions against PocketBase syntax rules,
 * including field references, @request references, and basic syntax validation.
 */

import type { APIRuleType, RuleExpression } from "../utils/permissions";
import type { FieldDefinition } from "./types";
import { generateFieldId } from "./utils/collection-id-generator.js";

/**
 * PocketBase's back-relation path segment: `<collection>_via_<field>`
 *
 * Means "the rows of `<collection>` whose `<field>` relation points at the
 * current record". The referenced collection deliberately has no field by
 * that name, so a back-relation segment can never be resolved against a
 * field list — see `isBackRelationSegment`.
 */
const BACK_RELATION_SEGMENT = /^[a-zA-Z_][a-zA-Z0-9_]*_via_[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validation result for rule expressions
 */
export interface RuleValidationResult {
  /** Whether the rule expression is valid */
  valid: boolean;

  /** List of validation errors */
  errors: string[];

  /** List of validation warnings */
  warnings: string[];

  /** List of field references found in the expression */
  fieldReferences: string[];
}

/**
 * Rule expression validator
 *
 * Validates PocketBase API rule expressions for:
 * - Field reference existence and validity
 * - @request reference syntax
 * - Basic expression syntax (parentheses, operators)
 * - Auth collection specific rules (manageRule)
 *
 * Only the *root* of a field path is checked, because the validator sees one
 * collection at a time. Everything past the first hop — relation chains like
 * `User.email` and back-relations like `Members_via_WorkspaceRef.UserRef` —
 * is accepted unresolved and reported neither as an error nor a warning.
 * `@collection.*` references are likewise out of reach and are skipped.
 */
export class RuleValidator {
  private fields: Map<string, FieldDefinition>;
  private collectionName: string;
  private isAuthCollection: boolean;

  constructor(collectionName: string, fields: FieldDefinition[], isAuthCollection: boolean = false) {
    this.collectionName = collectionName;
    this.fields = new Map(fields.map((f) => [f.name, f]));
    this.isAuthCollection = isAuthCollection;

    // Add system fields that are always available in PocketBase
    this.addSystemFields();
  }

  /**
   * Add system fields that are always available in PocketBase collections
   * These fields are automatically added by PocketBase and can be referenced in rules
   */
  private addSystemFields(): void {
    // Base system fields available in all collections
    const systemFields: FieldDefinition[] = [
      { name: "id", id: generateFieldId("text", "id"), type: "text", required: true, options: {} },
      { name: "created", id: generateFieldId("date", "created"), type: "date", required: true, options: {} },
      { name: "updated", id: generateFieldId("date", "updated"), type: "date", required: true, options: {} },
      { name: "collectionId", id: generateFieldId("text", "collectionId"), type: "text", required: true, options: {} },
      { name: "collectionName", id: generateFieldId("text", "collectionName"), type: "text", required: true, options: {} },
    ];

    // Auth collection specific system fields
    if (this.isAuthCollection) {
      systemFields.push(
        { name: "email", id: generateFieldId("email", "email"), type: "email", required: true, options: {} },
        { name: "emailVisibility", id: generateFieldId("bool", "emailVisibility"), type: "bool", required: false, options: {} },
        { name: "verified", id: generateFieldId("bool", "verified"), type: "bool", required: false, options: {} },
        { name: "tokenKey", id: generateFieldId("text", "tokenKey"), type: "text", required: true, options: {} },
        { name: "password", id: generateFieldId("text", "password"), type: "text", required: true, options: {} }
      );
    }

    // Add system fields to the fields map (don't overwrite user-defined fields)
    for (const field of systemFields) {
      if (!this.fields.has(field.name)) {
        this.fields.set(field.name, field);
      }
    }
  }

  /**
   * Validate a rule expression
   *
   * @param ruleType - The type of rule being validated
   * @param expression - The rule expression to validate
   * @returns Validation result with errors, warnings, and field references
   */
  validate(ruleType: APIRuleType, expression: RuleExpression): RuleValidationResult {
    const result: RuleValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      fieldReferences: [],
    };

    // Null means locked (superuser only) - always valid
    if (expression === null) {
      return result;
    }

    // Empty string means public - always valid but warn
    if (expression === "") {
      result.warnings.push(`${ruleType} is public - anyone can perform this operation`);
      return result;
    }

    // Validate manageRule only for auth collections
    if (ruleType === "manageRule" && !this.isAuthCollection) {
      result.valid = false;
      result.errors.push("manageRule is only valid for auth collections");
      return result;
    }

    // Extract and validate field references
    const fieldRefs = this.extractFieldReferences(expression);
    result.fieldReferences = fieldRefs;

    for (const fieldRef of fieldRefs) {
      this.validateFieldReference(fieldRef, result);
    }

    // Validate @request references
    this.validateRequestReferences(expression, result);

    // Validate syntax patterns
    this.validateSyntax(expression, result);

    return result;
  }

  /**
   * Extract field references from expression
   *
   * Matches field names that are not @request or @collection references.
   * Handles dot notation for relations: user.email, post.author.name
   *
   * @param expression - The rule expression
   * @returns Array of unique field references
   */
  private extractFieldReferences(expression: string): string[] {
    const refs: string[] = [];

    // First, remove string literals and @-references to avoid matching them.
    // @collection.<Name>.<path> addresses a *different* collection, so its
    // segments are not fields of this one and must not be validated as such.
    let cleaned = expression.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
    cleaned = cleaned.replace(/@request\.[a-zA-Z_][a-zA-Z0-9_.]*/g, "");
    cleaned = cleaned.replace(/@collection\.[a-zA-Z_][a-zA-Z0-9_.]*/g, "");

    // Match field names (not starting with @)
    // Handles dot notation for relations: user.email, post.author.name
    const fieldPattern = /(?:^|[^@\w])([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)(?=[^a-zA-Z0-9_.]|$)/g;

    let match;
    while ((match = fieldPattern.exec(cleaned)) !== null) {
      const ref = match[1];
      // Exclude PocketBase keywords and operators
      if (!this.isKeyword(ref)) {
        refs.push(ref);
      }
    }

    return [...new Set(refs)]; // Remove duplicates
  }

  /**
   * Check if a word is a PocketBase keyword
   *
   * @param word - The word to check
   * @returns True if the word is a keyword
   */
  private isKeyword(word: string): boolean {
    const keywords = ["true", "false", "null", "AND", "OR", "NOT", "LIKE", "IN"];
    return keywords.includes(word.toUpperCase());
  }

  /**
   * Check whether a path segment is a back-relation rather than a field
   *
   * A declared field wins: a collection may legitimately contain a field
   * literally named `foo_via_bar`, and it should be validated as one.
   *
   * @param segment - A single dot-separated path segment
   * @returns True if the segment should be treated as a back-relation
   */
  private isBackRelationSegment(segment: string): boolean {
    return !this.fields.has(segment) && BACK_RELATION_SEGMENT.test(segment);
  }

  /**
   * Validate a field reference exists in schema
   *
   * Only the root of the path is checked — the validator holds a single
   * collection's fields, so anything past the first hop belongs to another
   * collection and is accepted as-is. A root back-relation
   * (`Members_via_WorkspaceRef.UserRef`) has no local field to check against
   * either, so it is accepted too; PocketBase resolves it at runtime.
   *
   * @param fieldRef - The field reference to validate (e.g., "user" or "user.email")
   * @param result - The validation result to update
   */
  private validateFieldReference(fieldRef: string, result: RuleValidationResult): void {
    const parts = fieldRef.split(".");
    const rootField = parts[0];

    if (this.isBackRelationSegment(rootField)) {
      return;
    }

    if (!this.fields.has(rootField)) {
      result.errors.push(`Field '${rootField}' does not exist in collection '${this.collectionName}'`);
      result.valid = false;
      return;
    }

    // Traversing into a non-relation field is a local mistake we can catch.
    // A back-relation only ever hangs off a relation hop, so this holds for
    // `title.Foo_via_Bar` just as much as for `title.something`.
    if (parts.length > 1) {
      const field = this.fields.get(rootField)!;
      if (field.type !== "relation") {
        result.errors.push(`Field '${rootField}' is not a relation field, cannot access nested property '${parts[1]}'`);
        result.valid = false;
      }
    }
  }

  /**
   * Validate @request references
   *
   * Checks that @request references follow valid PocketBase patterns:
   * - @request.auth.* - authenticated user data
   * - @request.body.* - request body fields
   * - @request.query.* - query parameters
   * - @request.headers.* - request headers
   * - @request.method - HTTP method
   * - @request.context - execution context
   *
   * @param expression - The rule expression
   * @param result - The validation result to update
   */
  private validateRequestReferences(expression: string, result: RuleValidationResult): void {
    // Find all @request references
    const requestRefs = expression.match(/@request\.[a-zA-Z_][a-zA-Z0-9_.]*/g) || [];

    for (const ref of requestRefs) {
      // Check if the reference starts with a valid pattern
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
  }

  /**
   * Validate basic syntax patterns
   *
   * Checks for:
   * - Balanced parentheses
   * - Common operator mistakes (== instead of =)
   *
   * @param expression - The rule expression
   * @param result - The validation result to update
   */
  private validateSyntax(expression: string, result: RuleValidationResult): void {
    // Check for balanced parentheses
    let parenCount = 0;
    for (const char of expression) {
      if (char === "(") parenCount++;
      if (char === ")") parenCount--;
      if (parenCount < 0) {
        result.errors.push("Unbalanced parentheses in expression");
        result.valid = false;
        return;
      }
    }
    if (parenCount !== 0) {
      result.errors.push("Unbalanced parentheses in expression");
      result.valid = false;
    }

    // Warn about common mistakes
    if (expression.includes("==")) {
      result.warnings.push("Use '=' instead of '==' for equality comparison in PocketBase rules");
    }
  }
}
