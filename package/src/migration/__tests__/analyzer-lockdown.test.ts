/**
 * Tests for the explicit-only field/collection contract
 *
 * Field types come from explicit helper metadata (strong contract) or the
 * structural mapping of plain Zod types (loose contract) — never from names.
 * Collection types come from explicit metadata only.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCollection } from "../../schema/base";
import { buildFieldDefinition, convertZodSchemaToCollectionSchema } from "../analyzer";

describe("Analyzer lockdown", () => {
  describe("bare string arrays (loose contract)", () => {
    it("should map z.array(z.string()) to json", () => {
      const definition = buildFieldDefinition("tags", z.array(z.string()));

      expect(definition.type).toBe("json");
      expect(definition.relation).toBeUndefined();
    });

    it("should not leak array constraints into json options", () => {
      const definition = buildFieldDefinition("tags", z.array(z.string()).min(2).max(5));

      expect(definition.type).toBe("json");
      expect(definition.options?.minSelect).toBeUndefined();
      expect(definition.options?.maxSelect).toBeUndefined();
    });
  });

  describe("auth collection type is explicit-only", () => {
    it("should default a collection with email+password fields to base", () => {
      const schema = z.object({
        email: z.string().email(),
        password: z.string(),
      });

      const collection = convertZodSchemaToCollectionSchema("accounts", schema);

      expect(collection.type).toBe("base");
    });

    it("should honor explicit type: auth and inject system fields", () => {
      const schema = defineCollection({
        collectionName: "accounts",
        type: "auth",
        schema: z.object({
          email: z.string().email(),
          password: z.string(),
        }),
      });

      const collection = convertZodSchemaToCollectionSchema("accounts", schema);

      expect(collection.type).toBe("auth");
      expect(collection.fields.find((f) => f.name === "tokenKey")).toBeDefined();
      expect(collection.fields.find((f) => f.name === "password")?.type).toBe("password");
    });
  });

  describe("malformed strong contract", () => {
    it("should throw on __pocketbase_field__ metadata with an unknown type", () => {
      const field = z.string().describe(JSON.stringify({ __pocketbase_field__: { type: "banana" } }));

      expect(() => buildFieldDefinition("weird", field)).toThrow(/unknown type "banana"/);
    });

    it("should throw on __pocketbase_field__ metadata with a missing type", () => {
      const field = z.string().describe(JSON.stringify({ __pocketbase_field__: {} }));

      expect(() => buildFieldDefinition("weird", field)).toThrow(/__pocketbase_field__/);
    });
  });
});
