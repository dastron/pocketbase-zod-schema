import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BoolField,
  DateField,
  EmailField,
  JSONField,
  NumberField,
  TextField,
  URLField
} from "../../schema/fields";
import { buildFieldDefinition } from "../analyzer";

describe("Reproduction of Issue", () => {
    it("should correctly handle BoolField().optional().default(true)", () => {
      const field = BoolField().optional().default(true);
      const definition = buildFieldDefinition("hasAudio", field);

      expect(definition.type).toBe("bool");
      expect(definition.required).toBe(false);
    });

    it("should correctly handle TextField().optional().default('default')", () => {
      const field = TextField().optional().default("default");
      const definition = buildFieldDefinition("title", field);

      expect(definition.type).toBe("text");
      expect(definition.required).toBe(false);
    });

    it("should correctly handle NumberField().optional().default(0)", () => {
      const field = NumberField().optional().default(0);
      const definition = buildFieldDefinition("count", field);

      expect(definition.type).toBe("number");
      expect(definition.required).toBe(false);
    });

    it("should correctly handle DateField().optional().default(new Date())", () => {
      const field = DateField().optional().default(new Date().toISOString());
      const definition = buildFieldDefinition("created", field);

      expect(definition.type).toBe("date");
      expect(definition.required).toBe(false);
    });

    it("should correctly handle JSONField().optional().default({})", () => {
        const field = JSONField().optional().default({});
        const definition = buildFieldDefinition("meta", field);

        expect(definition.type).toBe("json");
        expect(definition.required).toBe(false);
    });

    it("should correctly handle EmailField().optional().default('test@example.com')", () => {
        const field = EmailField().optional().default("test@example.com");
        const definition = buildFieldDefinition("email", field);

        expect(definition.type).toBe("email");
        expect(definition.required).toBe(false);
    });

    it("should correctly handle URLField().optional().default('https://example.com')", () => {
        const field = URLField().optional().default("https://example.com");
        const definition = buildFieldDefinition("url", field);

        expect(definition.type).toBe("url");
        expect(definition.required).toBe(false);
    });

    // Test deeply nested wrappers (e.g. nullable().optional().default())
    it("should correctly handle deeply nested wrappers", () => {
        const field = BoolField().nullable().optional().default(true);
        const definition = buildFieldDefinition("deep", field);

        expect(definition.type).toBe("bool");
        expect(definition.required).toBe(false);
    });
});
