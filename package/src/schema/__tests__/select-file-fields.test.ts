import { describe, expect, it } from "vitest";
import { FileField, FilesField, SelectField, extractFieldMetadata } from "../fields";

describe("SelectField", () => {
  it("should create a single select field with metadata", () => {
    const field = SelectField(["draft", "published", "archived"]);
    const metadata = extractFieldMetadata(field.description);

    expect(metadata).toBeDefined();
    expect(metadata?.type).toBe("select");
    expect(metadata?.options?.values).toEqual(["draft", "published", "archived"]);
    expect(metadata?.options?.maxSelect).toBe(1);
  });

  it("should create a multiple select field when maxSelect > 1", () => {
    const field = SelectField(["electronics", "clothing", "food"], { maxSelect: 3 });
    const metadata = extractFieldMetadata(field.description);

    expect(metadata).toBeDefined();
    expect(metadata?.type).toBe("select");
    expect(metadata?.options?.values).toEqual(["electronics", "clothing", "food"]);
    expect(metadata?.options?.maxSelect).toBe(3);
  });

  it("should return enum schema for single select", () => {
    const field = SelectField(["draft", "published"]);
    expect(field._def.typeName).toBe("ZodEnum");
  });

  it("should return array schema for multiple select", () => {
    const field = SelectField(["tag1", "tag2"], { maxSelect: 2 });
    expect(field._def.typeName).toBe("ZodArray");
  });
});

describe("FileField", () => {
  it("should create a file field with metadata", () => {
    const field = FileField();
    const metadata = extractFieldMetadata(field.description);

    expect(metadata).toBeDefined();
    expect(metadata?.type).toBe("file");
  });

  it("should support mimeTypes option", () => {
    const field = FileField({ mimeTypes: ["image/*", "application/pdf"] });
    const metadata = extractFieldMetadata(field.description);

    expect(metadata?.options?.mimeTypes).toEqual(["image/*", "application/pdf"]);
  });

  it("should support maxSize option", () => {
    const field = FileField({ maxSize: 5242880 });
    const metadata = extractFieldMetadata(field.description);

    expect(metadata?.options?.maxSize).toBe(5242880);
  });

  it("should support thumbs option", () => {
    const field = FileField({ thumbs: ["100x100", "200x200"] });
    const metadata = extractFieldMetadata(field.description);

    expect(metadata?.options?.thumbs).toEqual(["100x100", "200x200"]);
  });

  it("should support protected option", () => {
    const field = FileField({ protected: true });
    const metadata = extractFieldMetadata(field.description);

    expect(metadata?.options?.protected).toBe(true);
  });

  it("should support all options combined", () => {
    const field = FileField({
      mimeTypes: ["image/*"],
      maxSize: 5242880,
      thumbs: ["100x100"],
      protected: true,
    });
    const metadata = extractFieldMetadata(field.description);

    expect(metadata?.options?.mimeTypes).toEqual(["image/*"]);
    expect(metadata?.options?.maxSize).toBe(5242880);
    expect(metadata?.options?.thumbs).toEqual(["100x100"]);
    expect(metadata?.options?.protected).toBe(true);
  });
});

describe("FilesField", () => {
  it("should create a files field with metadata", () => {
    const field = FilesField();
    const metadata = extractFieldMetadata(field.description);

    expect(metadata).toBeDefined();
    expect(metadata?.type).toBe("file");
  });

  it("should return array schema", () => {
    const field = FilesField();
    expect(field._def.typeName).toBe("ZodArray");
  });

  it("should support minSelect option", () => {
    const field = FilesField({ minSelect: 1 });
    const metadata = extractFieldMetadata(field.description);

    expect(metadata?.options?.minSelect).toBe(1);
  });

  it("should support maxSelect option", () => {
    const field = FilesField({ maxSelect: 5 });
    const metadata = extractFieldMetadata(field.description);

    expect(metadata?.options?.maxSelect).toBe(5);
  });

  it("should support file options (mimeTypes, maxSize, thumbs, protected)", () => {
    const field = FilesField({
      mimeTypes: ["image/*"],
      maxSize: 5242880,
      thumbs: ["100x100"],
      protected: true,
      minSelect: 1,
      maxSelect: 5,
    });
    const metadata = extractFieldMetadata(field.description);

    expect(metadata?.options?.mimeTypes).toEqual(["image/*"]);
    expect(metadata?.options?.maxSize).toBe(5242880);
    expect(metadata?.options?.thumbs).toEqual(["100x100"]);
    expect(metadata?.options?.protected).toBe(true);
    expect(metadata?.options?.minSelect).toBe(1);
    expect(metadata?.options?.maxSelect).toBe(5);
  });

  it("should throw error if minSelect > maxSelect", () => {
    expect(() => {
      FilesField({ minSelect: 5, maxSelect: 3 });
    }).toThrow("FilesField: minSelect cannot be greater than maxSelect");
  });

  it("should apply Zod min validation", () => {
    const field = FilesField({ minSelect: 2 });
    const result = field.safeParse([new File([], "test.txt")]);

    expect(result.success).toBe(false);
  });

  it("should apply Zod max validation", () => {
    const field = FilesField({ maxSelect: 2 });
    const files = [new File([], "test1.txt"), new File([], "test2.txt"), new File([], "test3.txt")];
    const result = field.safeParse(files);

    expect(result.success).toBe(false);
  });
});
