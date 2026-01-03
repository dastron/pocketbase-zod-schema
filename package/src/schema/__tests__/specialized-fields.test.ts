import { describe, expect, it } from "vitest";
import { EditorField, EmailField, extractFieldMetadata, URLField } from "../fields";

describe("Specialized Text Field Helpers", () => {
  describe("EmailField", () => {
    it("should create an email field with correct metadata", () => {
      const field = EmailField();
      const metadata = extractFieldMetadata(field.description);

      expect(metadata).toBeDefined();
      expect(metadata?.type).toBe("email");
    });

    it("should validate email addresses", () => {
      const field = EmailField();

      expect(field.safeParse("test@example.com").success).toBe(true);
      expect(field.safeParse("user+tag@domain.co.uk").success).toBe(true);
      expect(field.safeParse("not-an-email").success).toBe(false);
      expect(field.safeParse("missing@domain").success).toBe(false);
    });

    it("should work with optional chaining", () => {
      const field = EmailField().optional();

      expect(field.safeParse(undefined).success).toBe(true);
      expect(field.safeParse("test@example.com").success).toBe(true);
      expect(field.safeParse("invalid").success).toBe(false);
    });
  });

  describe("URLField", () => {
    it("should create a URL field with correct metadata", () => {
      const field = URLField();
      const metadata = extractFieldMetadata(field.description);

      expect(metadata).toBeDefined();
      expect(metadata?.type).toBe("url");
    });

    it("should validate URLs", () => {
      const field = URLField();

      expect(field.safeParse("https://example.com").success).toBe(true);
      expect(field.safeParse("http://localhost:3000").success).toBe(true);
      expect(field.safeParse("https://example.com/path?query=value").success).toBe(true);
      expect(field.safeParse("not-a-url").success).toBe(false);
      expect(field.safeParse("example.com").success).toBe(false);
    });

    it("should work with optional chaining", () => {
      const field = URLField().optional();

      expect(field.safeParse(undefined).success).toBe(true);
      expect(field.safeParse("https://example.com").success).toBe(true);
      expect(field.safeParse("invalid").success).toBe(false);
    });
  });

  describe("EditorField", () => {
    it("should create an editor field with correct metadata", () => {
      const field = EditorField();
      const metadata = extractFieldMetadata(field.description);

      expect(metadata).toBeDefined();
      expect(metadata?.type).toBe("editor");
    });

    it("should accept any string content", () => {
      const field = EditorField();

      expect(field.safeParse("<p>Rich text content</p>").success).toBe(true);
      expect(field.safeParse("Plain text").success).toBe(true);
      expect(field.safeParse("").success).toBe(true);
      expect(field.safeParse("<h1>Title</h1><p>Paragraph</p>").success).toBe(true);
    });

    it("should work with optional chaining", () => {
      const field = EditorField().optional();

      expect(field.safeParse(undefined).success).toBe(true);
      expect(field.safeParse("<p>Content</p>").success).toBe(true);
    });
  });
});
