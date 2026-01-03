import { describe, expect, it } from "vitest";
import * as schemaExports from "../index";

describe("Schema exports", () => {
  it("should export all field helper functions", () => {
    // Field helper functions
    expect(schemaExports.BoolField).toBeDefined();
    expect(schemaExports.NumberField).toBeDefined();
    expect(schemaExports.TextField).toBeDefined();
    expect(schemaExports.EmailField).toBeDefined();
    expect(schemaExports.URLField).toBeDefined();
    expect(schemaExports.EditorField).toBeDefined();
    expect(schemaExports.DateField).toBeDefined();
    expect(schemaExports.AutodateField).toBeDefined();
    expect(schemaExports.SelectField).toBeDefined();
    expect(schemaExports.FileField).toBeDefined();
    expect(schemaExports.FilesField).toBeDefined();
    expect(schemaExports.JSONField).toBeDefined();
    expect(schemaExports.GeoPointField).toBeDefined();

    // Relation helpers
    expect(schemaExports.RelationField).toBeDefined();
    expect(schemaExports.RelationsField).toBeDefined();
  });

  it("should export field metadata utilities", () => {
    expect(schemaExports.FIELD_METADATA_KEY).toBeDefined();
    expect(schemaExports.extractFieldMetadata).toBeDefined();
    expect(schemaExports.extractRelationMetadata).toBeDefined();
  });

  it("should export base utilities", () => {
    expect(schemaExports.baseSchema).toBeDefined();
    expect(schemaExports.defineCollection).toBeDefined();
    expect(schemaExports.withPermissions).toBeDefined();
    expect(schemaExports.withIndexes).toBeDefined();
  });

  it("should export permission utilities", () => {
    expect(schemaExports.PermissionTemplates).toBeDefined();
    expect(schemaExports.resolveTemplate).toBeDefined();
    expect(schemaExports.isTemplateConfig).toBeDefined();
    expect(schemaExports.isPermissionSchema).toBeDefined();
    expect(schemaExports.validatePermissionConfig).toBeDefined();
    expect(schemaExports.createPermissions).toBeDefined();
    expect(schemaExports.mergePermissions).toBeDefined();
  });
});
