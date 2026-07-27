/**
 * Integration tests for field fidelity against real PocketBase
 *
 * A generated migration is only useful if the collection PocketBase ends up
 * with is the collection the file describes. PocketBase silently discards
 * options a field type does not have, so anything extra the generator writes
 * makes the file and the database disagree from the moment it is applied —
 * and the e2e suite's engine simulation then diverges from the real server.
 *
 * Each expectation here was measured against a real PocketBase 0.35 instance
 * (see tests/e2e): the captured migrations show which options survive a save.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCollection, RelationField } from "../../../schema/base";
import { convertZodSchemaToCollectionSchema, extractCollectionNameFromSchema } from "../../analyzer";
import { compare } from "../../diff";
import { generate } from "../../generator";
import type { SchemaDefinition } from "../../types";
import { parseMigrationFile } from "../helpers";

describe("PocketBase field fidelity", () => {
  const tempDir = path.join(os.tmpdir(), "migration-test-field-fidelity-" + Date.now());

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Generate the migration for a single collection and read it back, so the
   * assertions are about the field the migration produces rather than about
   * the file's text.
   */
  function generateFields(collection: any, fallbackName: string): { source: string; fields: any[] } {
    const name = extractCollectionNameFromSchema(collection) || fallbackName;
    const schema: SchemaDefinition = {
      collections: new Map([[name, convertZodSchemaToCollectionSchema(name, collection)]]),
    };

    const generatedPaths = generate(compare(schema, null), tempDir);
    expect(generatedPaths).toHaveLength(1);

    return {
      source: fs.readFileSync(generatedPaths[0], "utf-8"),
      fields: parseMigrationFile(generatedPaths[0]).upFunction.collections[0].fields,
    };
  }

  function fieldNamed(fields: any[], fieldName: string): any {
    const field = fields.find((candidate) => candidate.name === fieldName);
    expect(field, `field "${fieldName}" missing from the generated migration`).toBeDefined();
    return field;
  }

  describe("options the field type does not support", () => {
    it("should not carry the Zod email regex onto an email field as a pattern", () => {
      const { fields } = generateFields(
        defineCollection({
          collectionName: "pattern_email_test",
          schema: z.object({ contact: z.string().email() }),
        }),
        "pattern_email_test"
      );

      const contact = fieldNamed(fields, "contact");

      expect(contact.type).toBe("email");
      // PocketBase's email field has no pattern option and drops it on save
      expect(contact.pattern).toBeUndefined();
    });

    it("should not carry the Zod datetime regex onto a date field as a pattern", () => {
      const { fields } = generateFields(
        defineCollection({
          collectionName: "pattern_date_test",
          schema: z.object({ published: z.string().datetime() }),
        }),
        "pattern_date_test"
      );

      const published = fieldNamed(fields, "published");

      expect(published.type).toBe("date");
      expect(published.pattern).toBeUndefined();
    });

    it("should map z.number().int() onto PocketBase's onlyInt", () => {
      const { fields } = generateFields(
        defineCollection({
          collectionName: "int_number_test",
          schema: z.object({ score: z.number().int().min(0).max(100) }),
        }),
        "int_number_test"
      );

      const score = fieldNamed(fields, "score");

      expect(score.type).toBe("number");
      expect(score.onlyInt).toBe(true);
      expect(score.min).toBe(0);
      expect(score.max).toBe(100);
    });

    it("should keep pattern on a text field, which does support it", () => {
      const { fields } = generateFields(
        defineCollection({
          collectionName: "pattern_text_test",
          schema: z.object({ slug: z.string().regex(/^[a-z-]+$/) }),
        }),
        "pattern_text_test"
      );

      const slug = fieldNamed(fields, "slug");

      expect(slug.type).toBe("text");
      expect(slug.pattern).toBe("^[a-z-]+$");
    });
  });

  describe("relation fields", () => {
    it("should not emit displayFields, which PocketBase removed in v0.23", () => {
      const { source, fields } = generateFields(
        defineCollection({
          collectionName: "relation_display_test",
          schema: z.object({
            author: RelationField({
              collection: "users",
              displayFields: ["name", "email"],
            }),
          }),
        }),
        "relation_display_test"
      );

      const author = fieldNamed(fields, "author");

      expect(author.type).toBe("relation");
      expect(author.collectionId).toBe("_pb_users_auth_");
      expect(source).not.toContain("displayFields");
    });
  });
});
