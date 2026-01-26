import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { CollectionSchema, SchemaDefinition } from "../../migration/types";
import { TypeGenerator } from "../generator";

describe("TypeGenerator JSON Fields", () => {
  it("should generate types for simple JSON object", () => {
    const jsonSchema = z.object({
      foo: z.string(),
      bar: z.number(),
    });

    const collection: CollectionSchema = {
      name: "settings",
      type: "base",
      fields: [
        {
          id: "pb_config",
          name: "config",
          type: "json",
          required: true,
          zodType: jsonSchema,
        },
      ],
    };

    const schema: SchemaDefinition = {
      collections: new Map([["settings", collection]]),
    };

    const generator = new TypeGenerator(schema);
    const output = generator.generate();

    expect(output).toContain("export interface SettingsRecord {");
    expect(output).toContain("config: {");
    expect(output).toContain("foo: string;");
    expect(output).toContain("bar: number;");
    expect(output).toContain("};");
  });

  it("should generate types for JSON array of objects", () => {
    const jsonSchema = z.array(z.object({
      id: z.number(),
      tags: z.array(z.string()),
    }));

    const collection: CollectionSchema = {
      name: "data",
      type: "base",
      fields: [
        {
          id: "pb_items",
          name: "items",
          type: "json",
          required: false,
          zodType: jsonSchema,
        },
      ],
    };

    const schema: SchemaDefinition = {
      collections: new Map([["data", collection]]),
    };

    const generator = new TypeGenerator(schema);
    const output = generator.generate();

    expect(output).toContain("items?: ({");
    expect(output).toContain("id: number;");
    expect(output).toContain("tags: string[];");
    expect(output).toContain("})[];");
  });

  it("should generate types for complex nested JSON", () => {
      const jsonSchema = z.object({
          meta: z.object({
              created: z.string(),
              version: z.number().optional(),
          }),
          values: z.array(z.union([z.string(), z.number()])),
          status: z.enum(["active", "inactive"]),
      });

      const collection: CollectionSchema = {
          name: "complex",
          type: "base",
          fields: [
              {
                  id: "pb_payload",
                  name: "payload",
                  type: "json",
                  required: true,
                  zodType: jsonSchema,
              }
          ]
      };

      const schema: SchemaDefinition = {
          collections: new Map([["complex", collection]]),
      };

      const generator = new TypeGenerator(schema);
      const output = generator.generate();

      expect(output).toContain("payload: {");
      expect(output).toContain("meta: {");
      expect(output).toContain("created: string;");
      expect(output).toContain("version?: number | undefined;");
      expect(output).toContain("values: (string | number)[];");
      expect(output).toContain('status: "active" | "inactive";');
  });
});
