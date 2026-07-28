import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GeoPointField, JSONField, extractFieldMetadata } from "../fields";

describe("JSONField", () => {
  it("should create a JSON field without inner schema", () => {
    const field = JSONField();

    // Verify it's a valid Zod schema
    expect(field).toBeDefined();

    // Verify metadata
    const metadata = extractFieldMetadata(field.description);
    expect(metadata).toEqual({
      type: "json",
    });
  });

  it("should create a JSON field with inner schema", () => {
    const innerSchema = z.object({
      theme: z.string(),
      notifications: z.boolean(),
    });

    const field = JSONField(innerSchema);

    // Verify it's a valid Zod schema
    expect(field).toBeDefined();

    // Verify metadata
    const metadata = extractFieldMetadata(field.description);
    expect(metadata).toEqual({
      type: "json",
    });

    // Verify inner schema validation works
    const validData = { theme: "dark", notifications: true };
    expect(() => field.parse(validData)).not.toThrow();

    const invalidData = { theme: "dark", notifications: "yes" };
    expect(() => field.parse(invalidData)).toThrow();
  });

  it("should validate any JSON when no schema provided", () => {
    const field = JSONField();

    // Should accept any valid object
    expect(() => field.parse({ foo: "bar" })).not.toThrow();
    expect(() => field.parse({ nested: { data: 123 } })).not.toThrow();
    expect(() => field.parse({ array: [1, 2, 3] })).not.toThrow();
  });

  describe("maxSize", () => {
    it("should accept an options object in place of a schema", () => {
      const field = JSONField({ maxSize: 5242880 });

      expect(extractFieldMetadata(field.description)).toEqual({
        type: "json",
        options: { maxSize: 5242880 },
      });

      // Still validates as an untyped JSON object
      expect(() => field.parse({ foo: "bar" })).not.toThrow();
    });

    it("should accept options alongside an inner schema", () => {
      const innerSchema = z.object({ fps: z.number() });
      const field = JSONField(innerSchema, { maxSize: "200K" });

      expect(extractFieldMetadata(field.description)).toEqual({
        type: "json",
        options: { maxSize: 204800 },
      });

      expect(() => field.parse({ fps: 30 })).not.toThrow();
      expect(() => field.parse({ fps: "30" })).toThrow();
    });

    it("should keep the cap when the schema argument is omitted explicitly", () => {
      const field = JSONField(undefined, { maxSize: "5M" });

      expect(extractFieldMetadata(field.description)?.options?.maxSize).toBe(5 * 1024 * 1024);
    });

    it.each([
      ["5M", 5 * 1024 * 1024],
      ["200K", 200 * 1024],
      ["1G", 1024 * 1024 * 1024],
      ["1g", 1024 * 1024 * 1024],
      [1234, 1234],
    ] as const)("should normalize %s to %i bytes", (input, expected) => {
      const field = JSONField({ maxSize: input });

      expect(extractFieldMetadata(field.description)?.options?.maxSize).toBe(expected);
    });

    it("should reject a malformed size string", () => {
      // @ts-expect-error - deliberately invalid unit
      expect(() => JSONField({ maxSize: "5MB" })).toThrow(/maxSize string must be like/);
    });

    it("should reject a negative size", () => {
      expect(() => JSONField({ maxSize: -1 })).toThrow(/maxSize must be >= 0/);
    });

    it("should reject a size beyond what PocketBase stores", () => {
      expect(() => JSONField({ maxSize: Number.MAX_SAFE_INTEGER + 2 })).toThrow(/cannot exceed 2\^53-1/);
    });

    it("should allow sizes above the 8G file ceiling", () => {
      // A json field's limit is validated against 2^53-1, not the file cap
      const field = JSONField({ maxSize: "16G" });

      expect(extractFieldMetadata(field.description)?.options?.maxSize).toBe(16 * 1024 * 1024 * 1024);
    });

    it("should omit options entirely when no constraint is given", () => {
      expect(extractFieldMetadata(JSONField().description)).toEqual({ type: "json" });
      expect(extractFieldMetadata(JSONField({}).description)).toEqual({ type: "json" });
      expect(extractFieldMetadata(JSONField(z.object({ a: z.string() })).description)).toEqual({ type: "json" });
    });
  });
});

describe("GeoPointField", () => {
  it("should create a GeoPoint field with lon/lat structure", () => {
    const field = GeoPointField();

    // Verify it's a valid Zod schema
    expect(field).toBeDefined();

    // Verify metadata
    const metadata = extractFieldMetadata(field.description);
    expect(metadata).toEqual({
      type: "geoPoint",
    });
  });

  it("should validate lon/lat coordinates", () => {
    const field = GeoPointField();

    // Valid coordinates
    const validCoords = { lon: -122.4194, lat: 37.7749 };
    expect(() => field.parse(validCoords)).not.toThrow();

    // Invalid - missing lon
    expect(() => field.parse({ lat: 37.7749 })).toThrow();

    // Invalid - missing lat
    expect(() => field.parse({ lon: -122.4194 })).toThrow();

    // Invalid - wrong types
    expect(() => field.parse({ lon: "string", lat: 37.7749 })).toThrow();
    expect(() => field.parse({ lon: -122.4194, lat: "string" })).toThrow();
  });

  it("should work with optional modifier", () => {
    const field = GeoPointField().optional();

    // Should accept undefined
    expect(() => field.parse(undefined)).not.toThrow();

    // Should accept valid coordinates
    expect(() => field.parse({ lon: 0, lat: 0 })).not.toThrow();
  });
});
