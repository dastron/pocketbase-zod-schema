/**
 * Tests for RuleValidator
 */

import { describe, expect, it } from "vitest";
import { RuleValidator } from "../rule-validator";
import type { FieldDefinition } from "../types";

describe("RuleValidator", () => {
  const mockFields: FieldDefinition[] = [
    { name: "title", id: "title_id", type: "text", required: true },
    { name: "status", id: "status_id", type: "text", required: false },
    { name: "User", id: "User_id", type: "relation", required: true, relation: { collection: "users" } },
    { name: "tags", id: "tags_id", type: "relation", required: false, relation: { collection: "tags", maxSelect: 5 } },
  ];

  describe("validate - null and empty rules", () => {
    it("should accept null rules (locked)", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate("listRule", null);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("should accept empty string rules (public) with warning", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate("listRule", "");

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("public");
    });
  });

  describe("validate - field references", () => {
    it("should validate existing field references", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate("listRule", 'status = "active"');

      expect(result.valid).toBe(true);
      expect(result.fieldReferences).toContain("status");
    });

    it("should error on non-existent field references", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate("listRule", 'nonexistent = "value"');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("nonexistent");
      expect(result.errors[0]).toContain("does not exist");
    });

    it("should accept nested relation field references without warning", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate("listRule", 'User.email = "test@example.com"');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.fieldReferences).toContain("User.email");
    });

    it("should error on nested reference for non-relation field", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate("listRule", 'title.something = "value"');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("not a relation field");
    });
  });

  // PocketBase's `<collection>_via_<field>` syntax walks a relation backwards.
  // The referenced collection has no field by that name by design, so these
  // segments must never be validated against a field list.
  describe("validate - back-relation references", () => {
    it("should accept a root back-relation that is not a declared field", () => {
      const validator = new RuleValidator("Workspaces", mockFields);
      const result = validator.validate("listRule", "WorkspaceMembers_via_WorkspaceRef.UserRef ?= @request.auth.id");

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("should accept a back-relation hanging off a relation field", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate(
        "listRule",
        "User.WorkspaceMembers_via_WorkspaceRef.UserRef ?= @request.auth.id"
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("should still error when a back-relation hangs off a non-relation field", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate("listRule", 'title.Foo_via_Bar.id = "x"');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("not a relation field");
    });

    it("should treat a declared field named like a back-relation as a field", () => {
      const fields: FieldDefinition[] = [
        ...mockFields,
        { name: "foo_via_bar", id: "foo_via_bar_id", type: "text", required: false },
      ];
      const validator = new RuleValidator("posts", fields);

      expect(validator.validate("listRule", 'foo_via_bar = "x"').valid).toBe(true);

      // Declared and text-typed, so traversing into it is still a real mistake
      const nested = validator.validate("listRule", 'foo_via_bar.x = "y"');
      expect(nested.valid).toBe(false);
      expect(nested.errors[0]).toContain("not a relation field");
    });

    it("should report no errors or warnings for a workspace-scoped rule set", () => {
      // Verbatim from the reported Artifacts.listRule
      const fields: FieldDefinition[] = [
        {
          name: "WorkspaceRef",
          id: "workspace_ref_id",
          type: "relation",
          required: false,
          relation: { collection: "Workspaces" },
        },
      ];
      const validator = new RuleValidator("Artifacts", fields);
      const result = validator.validate(
        "listRule",
        '@request.auth.id != "" && (WorkspaceRef = "" || WorkspaceRef.WorkspaceMembers_via_WorkspaceRef.UserRef ?= @request.auth.id)'
      );

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  describe("validate - @collection references", () => {
    it("should not validate @collection paths as local fields", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate("listRule", "@collection.Admins.user ?= @request.auth.id");

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.fieldReferences).not.toContain("Admins.user");
    });
  });

  describe("validate - @request references", () => {
    it("should validate @request.auth.id", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate("listRule", '@request.auth.id != ""');

      expect(result.valid).toBe(true);
    });

    it("should validate @request.auth.* references", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate("listRule", '@request.auth.role = "admin"');

      expect(result.valid).toBe(true);
    });

    it("should validate @request.body.* references", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate("createRule", '@request.body.title != ""');

      expect(result.valid).toBe(true);
    });

    it("should error on invalid @request references", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate("listRule", '@request.invalid.field = "value"');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Invalid @request reference");
    });
  });

  describe("validate - syntax", () => {
    it("should validate balanced parentheses", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate("listRule", '(status = "active" || status = "pending")');

      expect(result.valid).toBe(true);
    });

    it("should error on unbalanced parentheses", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate("listRule", '(status = "active"');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Unbalanced parentheses");
    });

    it("should warn on == operator usage", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate("listRule", 'status == "active"');

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("Use '=' instead of '=='");
    });
  });

  describe("validate - manageRule", () => {
    it("should error on manageRule for base collection", () => {
      const validator = new RuleValidator("posts", mockFields, false);
      const result = validator.validate("manageRule", '@request.auth.id != ""');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("only valid for auth collections");
    });

    it("should accept manageRule for auth collection", () => {
      const validator = new RuleValidator("users", mockFields, true);
      const result = validator.validate("manageRule", '@request.auth.id != ""');

      expect(result.valid).toBe(true);
    });
  });

  describe("validate - complex expressions", () => {
    it("should validate complex rule with multiple conditions", () => {
      const validator = new RuleValidator("posts", mockFields);
      const result = validator.validate(
        "listRule",
        '@request.auth.id != "" && (status = "active" || User = @request.auth.id)'
      );

      expect(result.valid).toBe(true);
      expect(result.fieldReferences).toContain("status");
      expect(result.fieldReferences).toContain("User");
    });
  });
});
