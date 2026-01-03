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
