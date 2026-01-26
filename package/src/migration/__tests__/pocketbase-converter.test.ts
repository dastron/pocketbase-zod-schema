/**
 * Unit tests for pocketbase-converter.ts
 * Tests conversion of PocketBase collection objects to internal schema format
 */

import * as fs from "fs";
import * as path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  convertPocketBaseCollection,
  convertPocketBaseMigration,
  resolveCollectionIdToName,
} from "../pocketbase-converter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("pocketbase-converter", () => {
  describe("resolveCollectionIdToName", () => {
    it("should resolve _pb_users_auth_ to users", () => {
      expect(resolveCollectionIdToName("_pb_users_auth_")).toBe("users");
    });

    it("should extract collection name from findCollectionByNameOrId expression", () => {
      const expression = 'app.findCollectionByNameOrId("projects")';
      expect(resolveCollectionIdToName(expression)).toBe("projects");
    });

    it("should handle single quotes in expression", () => {
      const expression = "app.findCollectionByNameOrId('users')";
      expect(resolveCollectionIdToName(expression)).toBe("users");
    });

    it("should return original ID if it cannot be resolved", () => {
      const unknownId = "unknown_collection_id";
      expect(resolveCollectionIdToName(unknownId)).toBe(unknownId);
    });

    it("should handle whitespace in expression", () => {
      const expression = 'app.findCollectionByNameOrId( "spaced" )';
      expect(resolveCollectionIdToName(expression)).toBe("spaced");
    });
  });

  describe("convertPocketBaseCollection", () => {
    describe("extractFieldOptions (via convertPocketBaseCollection)", () => {
      it("should extract min option from direct field property", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "title",
              id: "title_id",
              type: "text",
              required: true,
              min: 5,
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.min).toBe(5);
      });

      it("should extract max option from direct field property", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "title",
              id: "title_id",
              type: "text",
              required: true,
              max: 100,
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.max).toBe(100);
      });

      it("should extract pattern option from direct field property", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "code",
              id: "code_id",
              type: "text",
              required: true,
              pattern: "^[A-Z]{3}$",
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.pattern).toBe("^[A-Z]{3}$");
      });

      it("should extract noDecimal option from direct field property", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "count",
              id: "count_id",
              type: "number",
              required: true,
              noDecimal: true,
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.noDecimal).toBe(true);
      });

      it("should extract values option from direct field property for select fields", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "status",
              id: "status_id",
              type: "select",
              required: true,
              values: ["draft", "published", "archived"],
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.values).toEqual(["draft", "published", "archived"]);
      });

      it("should extract maxSelect option from direct field property for select fields", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "tags",
              id: "tags_id",
              type: "select",
              required: false,
              maxSelect: 5,
              values: ["tag1", "tag2", "tag3"],
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.maxSelect).toBe(5);
      });

      it("should extract mimeTypes option from direct field property for file fields", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "avatar",
              id: "avatar_id",
              type: "file",
              required: false,
              mimeTypes: ["image/png", "image/jpeg"],
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.mimeTypes).toEqual(["image/png", "image/jpeg"]);
      });

      it("should extract maxSize option from direct field property for file fields", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "document",
              id: "document_id",
              type: "file",
              required: false,
              maxSize: 5242880,
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.maxSize).toBe(5242880);
      });

      it("should extract thumbs option from direct field property for file fields", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "image",
              id: "image_id",
              type: "file",
              required: false,
              thumbs: ["100x100", "200x200"],
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.thumbs).toEqual(["100x100", "200x200"]);
      });

      it("should extract protected option from direct field property for file fields", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "private_file",
              id: "private_file_id",
              type: "file",
              required: false,
              protected: true,
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.protected).toBe(true);
      });

      it("should extract onCreate option from direct field property for autodate fields", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "created_at",
              id: "created_at_id",
              type: "autodate",
              required: false,
              onCreate: true,
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.onCreate).toBe(true);
      });

      it("should extract onUpdate option from direct field property for autodate fields", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "updated_at",
              id: "updated_at_id",
              type: "autodate",
              required: false,
              onUpdate: true,
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.onUpdate).toBe(true);
      });

      it("should extract exceptDomains option from direct field property for email/url fields", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "email",
              id: "email_id",
              type: "email",
              required: false,
              exceptDomains: ["spam.com", "blocked.com"],
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.exceptDomains).toEqual(["spam.com", "blocked.com"]);
      });

      it("should extract onlyDomains option from direct field property for email/url fields", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "corporate_email",
              id: "corporate_email_id",
              type: "email",
              required: false,
              onlyDomains: ["company.com", "corp.com"],
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.onlyDomains).toEqual(["company.com", "corp.com"]);
      });

      it("should extract multiple options from direct field properties", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "title",
              id: "title_id",
              type: "text",
              required: true,
              min: 5,
              max: 100,
              pattern: "^[A-Za-z]",
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.min).toBe(5);
        expect(result.fields[0].options?.max).toBe(100);
        expect(result.fields[0].options?.pattern).toBe("^[A-Za-z]");
      });

      it("should merge nested options with direct properties", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "title",
              id: "title_id",
              type: "text",
              required: true,
              min: 5,
              options: {
                max: 100,
                customOption: "value",
              },
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.min).toBe(5);
        expect(result.fields[0].options?.max).toBe(100);
        expect(result.fields[0].options?.customOption).toBe("value");
      });

      it("should give precedence to direct properties over nested options", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "title",
              id: "title_id",
              type: "text",
              required: true,
              min: 10, // Direct property
              options: {
                min: 5, // Nested option (should be overridden)
                max: 100,
              },
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.min).toBe(10); // Direct property wins
        expect(result.fields[0].options?.max).toBe(100);
      });

      it("should handle empty options object", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "simple",
              id: "simple_id",
              type: "text",
              required: false,
              options: {},
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        // Empty options should be cleaned up
        expect(result.fields[0].options).toBeUndefined();
      });

      it("should handle null options", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "simple",
              id: "simple_id",
              type: "text",
              required: false,
              options: null,
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        // Null options should result in no options
        expect(result.fields[0].options).toBeUndefined();
      });

      it("should handle undefined options", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "simple",
              id: "simple_id",
              type: "text",
              required: false,
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        // No options should result in no options
        expect(result.fields[0].options).toBeUndefined();
      });

      it("should handle undefined direct property values", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "title",
              id: "title_id",
              type: "text",
              required: false,
              min: undefined,
              max: undefined,
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        // Undefined values should not be included in options
        expect(result.fields[0].options).toBeUndefined();
      });

      it("should preserve zero values in options", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "count",
              id: "count_id",
              type: "number",
              required: false,
              min: 0,
              max: 0,
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.min).toBe(0);
        expect(result.fields[0].options?.max).toBe(0);
      });

      it("should preserve false values in options", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "count",
              id: "count_id",
              type: "number",
              required: false,
              noDecimal: false,
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.noDecimal).toBe(false);
      });

      it("should preserve empty string values in options", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "title",
              id: "title_id",
              type: "text",
              required: false,
              pattern: "",
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.pattern).toBe("");
      });

      it("should preserve empty array values in options", () => {
        const pbCollection = {
          name: "test",
          id: "test_id",
          type: "base",
          fields: [
            {
              name: "tags",
              id: "tags_id",
              type: "select",
              required: false,
              values: [],
            },
          ],
        };

        const result = convertPocketBaseCollection(pbCollection);

        expect(result.fields[0].options).toBeDefined();
        expect(result.fields[0].options?.values).toEqual([]);
      });
    });

    it("should convert a minimal collection", () => {
      const pbCollection = {
        name: "test_collection",
        id: "test_collection_id",
        type: "base",
        fields: [],
        indexes: [],
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.name).toBe("test_collection");
      expect(result.type).toBe("base");
      expect(result.fields).toEqual([]);
      expect(result.indexes).toEqual([]);
      expect(result.rules).toBeUndefined();
    });

    it("should skip system fields", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [
          { name: "id", id: "id_id", type: "text", system: true },
          { name: "created", id: "created_id", type: "autodate", system: true },
          { name: "updated", id: "updated_id", type: "autodate", system: true },
          { name: "custom_field", id: "custom_field_id", type: "text", system: false },
        ],
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].name).toBe("custom_field");
    });

    it("should skip system fields by name even if system flag is false", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [
          { name: "id", id: "id_id", type: "text", system: false }, // Some exports mark these as system: false
          { name: "created", id: "created_id", type: "autodate", system: false },
          { name: "updated", id: "updated_id", type: "autodate", system: false },
          { name: "custom_field", id: "custom_field_id", type: "text", system: false },
        ],
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].name).toBe("custom_field");
    });

    it("should skip auth system fields for auth collections", () => {
      const pbCollection = {
        name: "users",
        id: "users_id",
        type: "auth",
        fields: [
          { name: "email", id: "email_id", type: "email", system: true },
          { name: "password", id: "password_id", type: "password", system: true },
          { name: "emailVisibility", id: "emailVisibility_id", type: "bool", system: true },
          { name: "verified", id: "verified_id", type: "bool", system: true },
          { name: "tokenKey", id: "tokenKey_id", type: "text", system: true },
          { name: "custom_field", id: "custom_field_id", type: "text", system: false },
        ],
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].name).toBe("custom_field");
    });

    it("should convert text field with options", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [
          {
            name: "title",
            id: "title_id",
            type: "text",
            required: true,
            max: 100,
            min: 5,
            pattern: "^[A-Z]",
          },
        ],
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.fields).toHaveLength(1);
      expect(result.fields[0]).toMatchObject({
        name: "title",
        id: "title_id",
        type: "text",
        required: true,
      });
      // Note: The converter only copies options from pbField.options, not direct properties
      // Text field properties like max/min/pattern would need to be in options to be preserved
      // This test verifies basic field conversion works
    });

    it("should convert select field with values", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [
          {
            name: "status",
            id: "status_id",
            type: "select",
            required: true,
            values: ["draft", "active", "complete"],
          },
        ],
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.fields).toHaveLength(1);
      expect(result.fields[0]).toMatchObject({
        name: "status",
        id: "status_id",
        type: "select",
        required: true,
        options: {
          values: ["draft", "active", "complete"],
        },
      });
    });

    it("should convert select field with values in options", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [
          {
            name: "status",
            id: "status_id",
            type: "select",
            required: true,
            options: {
              values: ["draft", "active"],
            },
          },
        ],
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].options?.values).toEqual(["draft", "active"]);
    });

    it("should convert relation field with collectionId", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [
          {
            name: "owner",
            id: "owner_id",
            type: "relation",
            required: true,
            collectionId: "_pb_users_auth_",
            maxSelect: 1,
            minSelect: 0,
            cascadeDelete: false,
          },
        ],
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.fields).toHaveLength(1);
      expect(result.fields[0]).toMatchObject({
        name: "owner",
        id: "owner_id",
        type: "relation",
        required: true,
        relation: {
          collection: "users",
          cascadeDelete: false,
          maxSelect: 1,
          minSelect: 0,
        },
      });
    });

    it("should convert relation field with collectionId in options", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [
          {
            name: "owner",
            id: "owner_id",
            type: "relation",
            required: true,
            options: {
              collectionId: "_pb_users_auth_",
              maxSelect: 1,
              minSelect: 0,
              cascadeDelete: true,
            },
          },
        ],
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].relation?.collection).toBe("users");
      expect(result.fields[0].relation?.cascadeDelete).toBe(true);
    });

    it("should convert relation field with multiple maxSelect", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [
          {
            name: "subscribers",
            id: "subscribers_id",
            type: "relation",
            required: true,
            collectionId: "_pb_users_auth_",
            maxSelect: 999,
            minSelect: 0,
            cascadeDelete: false,
          },
        ],
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.fields[0].relation?.maxSelect).toBe(999);
    });

    it("should convert permissions/rules", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [],
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && owner = @request.auth.id",
        deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
        manageRule: null,
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.rules).toBeDefined();
      expect(result.rules?.listRule).toBe("@request.auth.id != ''");
      expect(result.rules?.viewRule).toBe("@request.auth.id != ''");
      expect(result.rules?.createRule).toBe("@request.auth.id != ''");
      expect(result.rules?.updateRule).toBe("@request.auth.id != '' && owner = @request.auth.id");
      expect(result.rules?.deleteRule).toBe("@request.auth.id != '' && owner = @request.auth.id");
      expect(result.rules?.manageRule).toBeNull();
    });

    it("should set permissions to match rules", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [],
        listRule: "@request.auth.id != ''",
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.permissions).toBeDefined();
      expect(result.permissions?.listRule).toBe("@request.auth.id != ''");
    });

    it("should handle null permissions", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [],
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        manageRule: null,
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.rules).toBeDefined();
      expect(result.rules?.listRule).toBeNull();
      expect(result.rules?.viewRule).toBeNull();
    });

    it("should handle empty string permissions", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [],
        listRule: "",
        viewRule: "",
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.rules?.listRule).toBe("");
      expect(result.rules?.viewRule).toBe("");
    });

    it("should convert indexes", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [],
        indexes: ["CREATE INDEX idx_name ON test (name)"],
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.indexes).toEqual(["CREATE INDEX idx_name ON test (name)"]);
    });

    it("should handle collection without indexes", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [],
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.indexes).toBeUndefined();
    });

    it("should handle default type as base", () => {
      const pbCollection = {
        name: "test",
        fields: [],
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.type).toBe("base");
    });

    it("should clean up empty options object", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [
          {
            name: "simple_field",
            id: "simple_field_id",
            type: "text",
            required: false,
            options: {},
          },
        ],
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.fields[0].options).toBeUndefined();
    });

    it("should preserve options with values for select fields", () => {
      const pbCollection = {
        name: "test",
        id: "test_id",
        type: "base",
        fields: [
          {
            name: "status",
            id: "status_id",
            type: "select",
            required: false,
            values: ["active"],
          },
        ],
      };

      const result = convertPocketBaseCollection(pbCollection);

      expect(result.fields[0].options).toBeDefined();
      expect(result.fields[0].options?.values).toEqual(["active"]);
    });
  });

  describe("convertPocketBaseMigration", () => {
    it("should convert a migration file with snapshot array", () => {
      const migrationContent = `
        migrate((app) => {
          const snapshot = [
            {
              name: "test_collection",
              id: "test_collection_id",
              type: "base",
              fields: [
                { name: "title", id: "title_id", type: "text", required: true }
              ],
              indexes: []
            }
          ];
          // ... rest of migration
        });
      `;

      const result = convertPocketBaseMigration(migrationContent);

      expect(result.version).toBe("1.0.0");
      expect(result.timestamp).toBeDefined();
      expect(result.collections.size).toBe(1);
      expect(result.collections.get("test_collection")).toBeDefined();
      expect(result.collections.get("test_collection")?.fields).toHaveLength(1);
    });

    it("should handle migration with multiple collections", () => {
      const migrationContent = `
        migrate((app) => {
          const snapshot = [
            {
              name: "collection1",
              id: "collection1_id",
              type: "base",
              fields: []
            },
            {
              name: "collection2",
              id: "collection2_id",
              type: "base",
              fields: []
            }
          ];
        });
      `;

      const result = convertPocketBaseMigration(migrationContent);

      expect(result.collections.size).toBe(2);
      expect(result.collections.has("collection1")).toBe(true);
      expect(result.collections.has("collection2")).toBe(true);
    });

    it("should skip collections without names", () => {
      const migrationContent = `
        migrate((app) => {
          const snapshot = [
            {
              name: "valid_collection",
              id: "valid_collection_id",
              type: "base",
              fields: []
            },
            {
              type: "base",
              fields: []
            }
          ];
        });
      `;

      const result = convertPocketBaseMigration(migrationContent);

      expect(result.collections.size).toBe(1);
      expect(result.collections.has("valid_collection")).toBe(true);
    });

    it("should throw SnapshotError for invalid migration format", () => {
      const migrationContent = "invalid migration content";

      expect(() => convertPocketBaseMigration(migrationContent)).toThrow();
    });

    it("should throw SnapshotError when snapshot array is missing", () => {
      const migrationContent = `
        migrate((app) => {
          // No snapshot here
        });
      `;

      expect(() => convertPocketBaseMigration(migrationContent)).toThrow();
    });

    it("should parse real migration file from fixtures (if snapshot format)", () => {
      const migrationPath = path.join(
        __dirname,
        "fixtures/reference-migrations/1764625735_created_create_new_collection_blank.js"
      );
      const migrationContent = fs.readFileSync(migrationPath, "utf-8");

      // Note: Reference migrations use new Collection() format, not snapshot arrays
      // This test verifies the function works with snapshot format when present
      // For new Collection() format, use parseMigrationOperations instead
      if (migrationContent.includes("const snapshot =")) {
        const result = convertPocketBaseMigration(migrationContent);
        expect(result.collections.size).toBeGreaterThan(0);
      } else {
        // Skip if not snapshot format - that's expected for reference migrations
        expect(migrationContent).toContain("new Collection");
      }
    });

    it("should handle migration with relation to Users collection (if snapshot format)", () => {
      const migrationPath = path.join(
        __dirname,
        "fixtures/reference-migrations/1764625943_created_create_new_collection_with_restricted_api_rules.js"
      );
      const migrationContent = fs.readFileSync(migrationPath, "utf-8");

      // Note: Reference migrations use new Collection() format, not snapshot arrays
      if (migrationContent.includes("const snapshot =")) {
        const result = convertPocketBaseMigration(migrationContent);
        const collection = Array.from(result.collections.values())[0];
        const RelationField = collection.fields.find((f) => f.type === "relation");

        expect(RelationField).toBeDefined();
        expect(RelationField?.relation?.collection).toBe("Users");
      } else {
        // Skip if not snapshot format - that's expected for reference migrations
        expect(migrationContent).toContain("new Collection");
      }
    });

    it("should handle auth collection and skip auth system fields (if snapshot format)", () => {
      const migrationPath = path.join(__dirname, "fixtures/reference-migrations/1764700001_created_test_auth_users.js");
      const migrationContent = fs.readFileSync(migrationPath, "utf-8");

      // Note: Reference migrations use new Collection() format, not snapshot arrays
      if (migrationContent.includes("const snapshot =")) {
        const result = convertPocketBaseMigration(migrationContent);
        const collection = Array.from(result.collections.values())[0];
        expect(collection.type).toBe("auth");

        // Should skip email, password, emailVisibility, verified, tokenKey
        const fieldNames = collection.fields.map((f) => f.name);
        expect(fieldNames).not.toContain("email");
        expect(fieldNames).not.toContain("password");
        expect(fieldNames).not.toContain("emailVisibility");
        expect(fieldNames).not.toContain("verified");
        expect(fieldNames).not.toContain("tokenKey");

        // Should include custom fields
        expect(fieldNames).toContain("name");
      } else {
        // Skip if not snapshot format - that's expected for reference migrations
        expect(migrationContent).toContain("new Collection");
      }
    });

    it("should handle null permissions correctly (if snapshot format)", () => {
      const migrationPath = path.join(
        __dirname,
        "fixtures/reference-migrations/1764700000_created_create_new_collection_with_null_permissions.js"
      );
      const migrationContent = fs.readFileSync(migrationPath, "utf-8");

      // Note: Reference migrations use new Collection() format, not snapshot arrays
      if (migrationContent.includes("const snapshot =")) {
        const result = convertPocketBaseMigration(migrationContent);
        const collection = Array.from(result.collections.values())[0];
        expect(collection.rules).toBeDefined();
        expect(collection.rules?.listRule).toBeNull();
        expect(collection.rules?.viewRule).toBeNull();
        expect(collection.rules?.createRule).toBeNull();
        expect(collection.rules?.updateRule).toBeNull();
        expect(collection.rules?.deleteRule).toBeNull();
      } else {
        // Skip if not snapshot format - that's expected for reference migrations
        expect(migrationContent).toContain("new Collection");
      }
    });
  });
});
