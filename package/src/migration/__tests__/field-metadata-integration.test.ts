/**
 * Integration test for field metadata usage in migration generator
 * Validates that field helpers are correctly used by the migration generator
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AutodateField,
  BoolField,
  DateField,
  EditorField,
  EmailField,
  FileField,
  FilesField,
  GeoPointField,
  JSONField,
  NumberField,
  SelectField,
  TextField,
  URLField,
} from "../../schema/fields";
import { buildFieldDefinition } from "../analyzer";

describe("Field Metadata Integration", () => {
  describe("Field helpers should be used by migration generator", () => {
    it("should use BoolField metadata", () => {
      const field = BoolField();
      const definition = buildFieldDefinition("active", field);

      expect(definition.type).toBe("bool");
      expect(definition.required).toBe(true);
    });

    it("should use NumberField metadata with options", () => {
      const field = NumberField({ min: 0, max: 100 });
      const definition = buildFieldDefinition("quantity", field);

      expect(definition.type).toBe("number");
      expect(definition.options).toEqual({ min: 0, max: 100 });
    });

    it("should use TextField metadata with options", () => {
      const field = TextField({ min: 1, max: 200 });
      const definition = buildFieldDefinition("name", field);

      expect(definition.type).toBe("text");
      expect(definition.options).toEqual({ min: 1, max: 200 });
    });

    it("should use EmailField metadata", () => {
      const field = EmailField();
      const definition = buildFieldDefinition("email", field);

      expect(definition.type).toBe("email");
    });

    it("should use URLField metadata", () => {
      const field = URLField();
      const definition = buildFieldDefinition("website", field);

      expect(definition.type).toBe("url");
    });

    it("should use EditorField metadata", () => {
      const field = EditorField();
      const definition = buildFieldDefinition("content", field);

      expect(definition.type).toBe("editor");
    });

    it("should use DateField metadata", () => {
      const field = DateField();
      const definition = buildFieldDefinition("startDate", field);

      expect(definition.type).toBe("date");
    });

    it("should use AutodateField metadata", () => {
      const field = AutodateField({ onCreate: true });
      const definition = buildFieldDefinition("createdAt", field);

      expect(definition.type).toBe("autodate");
      expect(definition.options).toEqual({ onCreate: true });
    });

    it("should use SelectField metadata for single select", () => {
      const field = SelectField(["draft", "published", "archived"]);
      const definition = buildFieldDefinition("status", field);

      expect(definition.type).toBe("select");
      expect(definition.options?.values).toEqual(["draft", "published", "archived"]);
      expect(definition.options?.maxSelect).toBe(1);
    });

    it("should use SelectField metadata for multiple select", () => {
      const field = SelectField(["tag1", "tag2", "tag3"], { maxSelect: 3 });
      const definition = buildFieldDefinition("tags", field);

      expect(definition.type).toBe("select");
      expect(definition.options?.values).toEqual(["tag1", "tag2", "tag3"]);
      expect(definition.options?.maxSelect).toBe(3);
    });

    it("should use FileField metadata", () => {
      const field = FileField({ mimeTypes: ["image/*"], maxSize: 5242880 });
      const definition = buildFieldDefinition("avatar", field);

      expect(definition.type).toBe("file");
      expect(definition.options?.mimeTypes).toEqual(["image/*"]);
      expect(definition.options?.maxSize).toBe(5242880);
    });

    it("should use FilesField metadata", () => {
      const field = FilesField({ minSelect: 1, maxSelect: 5 });
      const definition = buildFieldDefinition("images", field);

      expect(definition.type).toBe("file");
      expect(definition.options?.minSelect).toBe(1);
      expect(definition.options?.maxSelect).toBe(5);
    });

    it("should use JSONField metadata", () => {
      const field = JSONField();
      const definition = buildFieldDefinition("metadata", field);

      expect(definition.type).toBe("json");
    });

    it("should use GeoPointField metadata", () => {
      const field = GeoPointField();
      const definition = buildFieldDefinition("location", field);

      expect(definition.type).toBe("geoPoint");
    });
  });

  describe("Optional field handling", () => {
    it("should handle optional BoolField", () => {
      const field = BoolField().optional();
      const definition = buildFieldDefinition("featured", field);

      expect(definition.type).toBe("bool");
      expect(definition.required).toBe(false);
    });

    it("should handle required BoolField (not optional)", () => {
      const field = BoolField();
      const definition = buildFieldDefinition("active", field);

      expect(definition.type).toBe("bool");
      expect(definition.required).toBe(true);
    });

    it("should handle optional NumberField", () => {
      const field = NumberField({ min: 0, max: 100 }).optional();
      const definition = buildFieldDefinition("rating", field);

      expect(definition.type).toBe("number");
      expect(definition.required).toBe(false);
      expect(definition.options).toEqual({ min: 0, max: 100 });
    });

    it("should handle required NumberField (not optional)", () => {
      const field = NumberField({ min: 0 });
      const definition = buildFieldDefinition("price", field);

      expect(definition.type).toBe("number");
      expect(definition.required).toBe(true);
      expect(definition.options).toEqual({ min: 0 });
    });

    it("should handle optional TextField", () => {
      const field = TextField({ max: 100 }).optional();
      const definition = buildFieldDefinition("description", field);

      expect(definition.type).toBe("text");
      expect(definition.required).toBe(false);
      expect(definition.options).toEqual({ max: 100 });
    });

    it("should handle required TextField (not optional)", () => {
      const field = TextField({ min: 1, max: 200 });
      const definition = buildFieldDefinition("name", field);

      expect(definition.type).toBe("text");
      expect(definition.required).toBe(true);
      expect(definition.options).toEqual({ min: 1, max: 200 });
    });

    it("should handle optional EmailField", () => {
      const field = EmailField().optional();
      const definition = buildFieldDefinition("alternateEmail", field);

      expect(definition.type).toBe("email");
      expect(definition.required).toBe(false);
    });

    it("should handle required EmailField (not optional)", () => {
      const field = EmailField();
      const definition = buildFieldDefinition("email", field);

      expect(definition.type).toBe("email");
      expect(definition.required).toBe(true);
    });

    it("should handle optional URLField", () => {
      const field = URLField().optional();
      const definition = buildFieldDefinition("website", field);

      expect(definition.type).toBe("url");
      expect(definition.required).toBe(false);
    });

    it("should handle required URLField (not optional)", () => {
      const field = URLField();
      const definition = buildFieldDefinition("homepage", field);

      expect(definition.type).toBe("url");
      expect(definition.required).toBe(true);
    });

    it("should handle optional EditorField", () => {
      const field = EditorField().optional();
      const definition = buildFieldDefinition("notes", field);

      expect(definition.type).toBe("editor");
      expect(definition.required).toBe(false);
    });

    it("should handle required EditorField (not optional)", () => {
      const field = EditorField();
      const definition = buildFieldDefinition("content", field);

      expect(definition.type).toBe("editor");
      expect(definition.required).toBe(true);
    });

    it("should handle optional DateField", () => {
      const field = DateField().optional();
      const definition = buildFieldDefinition("releaseDate", field);

      expect(definition.type).toBe("date");
      expect(definition.required).toBe(false);
    });

    it("should handle required DateField (not optional)", () => {
      const field = DateField();
      const definition = buildFieldDefinition("startDate", field);

      expect(definition.type).toBe("date");
      expect(definition.required).toBe(true);
    });

    it("should handle optional AutodateField", () => {
      const field = AutodateField({ onCreate: true }).optional();
      const definition = buildFieldDefinition("publishedAt", field);

      expect(definition.type).toBe("autodate");
      expect(definition.required).toBe(false);
      expect(definition.options).toEqual({ onCreate: true });
    });

    it("should handle required AutodateField (not optional)", () => {
      const field = AutodateField({ onUpdate: true });
      const definition = buildFieldDefinition("updatedAt", field);

      expect(definition.type).toBe("autodate");
      expect(definition.required).toBe(true);
      expect(definition.options).toEqual({ onUpdate: true });
    });

    it("should handle optional SelectField", () => {
      const field = SelectField(["draft", "published", "archived"]).optional();
      const definition = buildFieldDefinition("status", field);

      expect(definition.type).toBe("select");
      expect(definition.required).toBe(false);
      expect(definition.options?.values).toEqual(["draft", "published", "archived"]);
    });

    it("should handle required SelectField (not optional)", () => {
      const field = SelectField(["active", "inactive"]);
      const definition = buildFieldDefinition("state", field);

      expect(definition.type).toBe("select");
      expect(definition.required).toBe(true);
      expect(definition.options?.values).toEqual(["active", "inactive"]);
    });

    it("should handle optional FileField", () => {
      const field = FileField({ mimeTypes: ["image/*"] }).optional();
      const definition = buildFieldDefinition("avatar", field);

      expect(definition.type).toBe("file");
      expect(definition.required).toBe(false);
      expect(definition.options?.mimeTypes).toEqual(["image/*"]);
    });

    it("should handle required FileField (not optional)", () => {
      const field = FileField({ mimeTypes: ["application/pdf"] });
      const definition = buildFieldDefinition("document", field);

      expect(definition.type).toBe("file");
      expect(definition.required).toBe(true);
      expect(definition.options?.mimeTypes).toEqual(["application/pdf"]);
    });

    it("should handle optional FilesField", () => {
      const field = FilesField({ maxSelect: 5 }).optional();
      const definition = buildFieldDefinition("images", field);

      expect(definition.type).toBe("file");
      expect(definition.required).toBe(false);
      expect(definition.options?.maxSelect).toBe(5);
    });

    it("should handle required FilesField (not optional)", () => {
      const field = FilesField({ minSelect: 1, maxSelect: 10 });
      const definition = buildFieldDefinition("attachments", field);

      expect(definition.type).toBe("file");
      expect(definition.required).toBe(true);
      expect(definition.options?.minSelect).toBe(1);
      expect(definition.options?.maxSelect).toBe(10);
    });

    it("should handle optional JSONField", () => {
      const field = JSONField().optional();
      const definition = buildFieldDefinition("metadata", field);

      expect(definition.type).toBe("json");
      expect(definition.required).toBe(false);
    });

    it("should handle required JSONField (not optional)", () => {
      const field = JSONField();
      const definition = buildFieldDefinition("config", field);

      expect(definition.type).toBe("json");
      expect(definition.required).toBe(true);
    });

    it("should handle optional GeoPointField", () => {
      const field = GeoPointField().optional();
      const definition = buildFieldDefinition("location", field);

      expect(definition.type).toBe("geoPoint");
      expect(definition.required).toBe(false);
    });

    it("should handle required GeoPointField (not optional)", () => {
      const field = GeoPointField();
      const definition = buildFieldDefinition("coordinates", field);

      expect(definition.type).toBe("geoPoint");
      expect(definition.required).toBe(true);
    });
  });

  describe("Default value handling", () => {
    it("should handle BoolField with default value", () => {
      const field = BoolField().default(false);
      const definition = buildFieldDefinition("featured", field);

      expect(definition.type).toBe("bool");
      expect(definition.required).toBe(false); // Fields with defaults are not required
    });

    it("should handle NumberField with default value", () => {
      const field = NumberField({ min: 0 }).default(0);
      const definition = buildFieldDefinition("quantity", field);

      expect(definition.type).toBe("number");
      expect(definition.required).toBe(false); // Fields with defaults are not required
      expect(definition.options).toEqual({ min: 0 });
    });

    it("should handle TextField with default value", () => {
      const field = TextField({ max: 100 }).default("");
      const definition = buildFieldDefinition("description", field);

      expect(definition.type).toBe("text");
      expect(definition.required).toBe(false); // Fields with defaults are not required
      expect(definition.options).toEqual({ max: 100 });
    });

    it("should handle EmailField with default value", () => {
      const field = EmailField().default("noreply@example.com");
      const definition = buildFieldDefinition("email", field);

      expect(definition.type).toBe("email");
      expect(definition.required).toBe(false); // Fields with defaults are not required
    });

    it("should handle URLField with default value", () => {
      const field = URLField().default("https://example.com");
      const definition = buildFieldDefinition("website", field);

      expect(definition.type).toBe("url");
      expect(definition.required).toBe(false); // Fields with defaults are not required
    });

    it("should handle EditorField with default value", () => {
      const field = EditorField().default("<p>Default content</p>");
      const definition = buildFieldDefinition("content", field);

      expect(definition.type).toBe("editor");
      expect(definition.required).toBe(false); // Fields with defaults are not required
    });

    it("should handle DateField with default value", () => {
      const field = DateField().default("2024-01-01");
      const definition = buildFieldDefinition("startDate", field);

      expect(definition.type).toBe("date");
      expect(definition.required).toBe(false); // Fields with defaults are not required
    });

    it("should handle AutodateField with default value", () => {
      const field = AutodateField({ onCreate: true }).default("");
      const definition = buildFieldDefinition("createdAt", field);

      expect(definition.type).toBe("autodate");
      expect(definition.required).toBe(false); // Fields with defaults are not required
      expect(definition.options).toEqual({ onCreate: true });
    });

    it("should handle SelectField with default value", () => {
      const field = (
        SelectField(["draft", "published", "archived"]) as z.ZodEnum<["draft", "published", "archived"]>
      ).default("draft");
      const definition = buildFieldDefinition("status", field);

      expect(definition.type).toBe("select");
      expect(definition.required).toBe(false); // Fields with defaults are not required
      expect(definition.options?.values).toEqual(["draft", "published", "archived"]);
    });

    it("should handle JSONField with default value", () => {
      const field = JSONField().default({});
      const definition = buildFieldDefinition("metadata", field);

      expect(definition.type).toBe("json");
      expect(definition.required).toBe(false); // Fields with defaults are not required
    });

    it("should handle GeoPointField with default value", () => {
      const field = GeoPointField().default({ lon: 0, lat: 0 });
      const definition = buildFieldDefinition("location", field);

      expect(definition.type).toBe("geoPoint");
      expect(definition.required).toBe(false); // Fields with defaults are not required
    });

    it("should handle FilesField with default value", () => {
      const field = FilesField({ maxSelect: 5 }).default([]);
      const definition = buildFieldDefinition("images", field);

      expect(definition.type).toBe("file");
      expect(definition.required).toBe(false); // Fields with defaults are not required
      expect(definition.options?.maxSelect).toBe(5);
    });
  });

  describe("Backward compatibility", () => {
    it("should still infer type from plain Zod string", () => {
      const field = z.string();
      const definition = buildFieldDefinition("name", field);

      expect(definition.type).toBe("text");
    });

    it("should still infer type from plain Zod number", () => {
      const field = z.number();
      const definition = buildFieldDefinition("age", field);

      expect(definition.type).toBe("number");
    });

    it("should still infer type from plain Zod boolean", () => {
      const field = z.boolean();
      const definition = buildFieldDefinition("active", field);

      expect(definition.type).toBe("bool");
    });

    it("should still infer email from Zod string with email validation", () => {
      const field = z.string().email();
      const definition = buildFieldDefinition("email", field);

      expect(definition.type).toBe("email");
    });

    it("should still infer url from Zod string with url validation", () => {
      const field = z.string().url();
      const definition = buildFieldDefinition("website", field);

      expect(definition.type).toBe("url");
    });
  });
});
