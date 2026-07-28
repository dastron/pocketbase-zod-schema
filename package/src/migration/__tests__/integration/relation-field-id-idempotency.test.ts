/**
 * Field-id idempotency for explicit relation fields
 *
 * Field ids embed the field type as a plaintext prefix. RelationField ids
 * historically hashed the structural type ("text..."); they now hash the
 * settled type ("relation..."). This must be invisible to the diff: fields
 * are matched by name and ids are never compared, so neither a fresh
 * round-trip nor a migration history carrying old-style ids may produce
 * spurious operations.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { RelationField, RelationsField } from "../../../schema/base";
import { convertZodSchemaToCollectionSchema } from "../../analyzer";
import { compare } from "../../diff";
import { generate } from "../../generator";
import type { SchemaDefinition, SchemaSnapshot } from "../../types";
import { generateFieldId } from "../../utils/collection-id-generator";
import { executeMigrationFiles } from "../helpers/migration-executor";

describe("Relation field-id idempotency", () => {
  const tempDir = path.join(os.tmpdir(), "migration-test-relation-ids-" + Date.now());

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const zodSchema = z.object({
    title: z.string(),
    author: RelationField({ collection: "users" }),
    reviewers: RelationsField({ collection: "users", maxSelect: 5 }),
  });

  it("should hash the settled type into explicit relation field ids", () => {
    const collection = convertZodSchemaToCollectionSchema("posts", zodSchema);

    const author = collection.fields.find((f) => f.name === "author");
    const reviewers = collection.fields.find((f) => f.name === "reviewers");

    expect(author?.id).toMatch(/^relation/);
    expect(reviewers?.id).toMatch(/^relation/);
  });

  it("should need no additional migration after generate + replay", () => {
    const collection = convertZodSchemaToCollectionSchema("posts", zodSchema);
    const originalSchema: SchemaDefinition = { collections: new Map([["posts", collection]]) };

    const diff = compare(originalSchema, null);
    const generatedPaths = generate(diff, tempDir);
    expect(generatedPaths).toHaveLength(1);

    const snapshot = executeMigrationFiles(generatedPaths).snapshot;

    const diffAfterGeneration = compare(originalSchema, snapshot);
    expect(diffAfterGeneration.collectionsToCreate).toHaveLength(0);
    expect(diffAfterGeneration.collectionsToDelete).toHaveLength(0);
    expect(diffAfterGeneration.collectionsToModify).toHaveLength(0);
  });

  it("should see no changes against a history carrying old-style text-prefixed ids", () => {
    const collection = convertZodSchemaToCollectionSchema("posts", zodSchema);
    const originalSchema: SchemaDefinition = { collections: new Map([["posts", collection]]) };

    // A snapshot as replayed from a migration written before this release:
    // the relation field's id hashes "text" (single) — everything else equal
    const legacySnapshot: SchemaSnapshot = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      collections: new Map([
        [
          "posts",
          {
            ...collection,
            fields: collection.fields.map((field) =>
              field.name === "author" ? { ...field, id: generateFieldId("text", field.name) } : field
            ),
          },
        ],
      ]),
    };

    const diff = compare(originalSchema, legacySnapshot);
    expect(diff.collectionsToCreate).toHaveLength(0);
    expect(diff.collectionsToDelete).toHaveLength(0);
    expect(diff.collectionsToModify).toHaveLength(0);
  });
});
