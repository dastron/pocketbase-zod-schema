/**
 * Every field option the generator is allowed to write has to survive replay.
 *
 * The generator emits whatever `filterSupportedFieldOptions` keeps; the engine
 * plus `pocketbase-converter` is the only reader of those files. An option
 * written but not read back reads as "the schema changed" on the next
 * `db:generate` — a fresh `updated_*` migration on every run, forever.
 *
 * `autogeneratePattern` is the user-settable case (TextField), so it gets the
 * full schema -> migration -> replay -> compare loop; the remaining
 * whitelisted options are exercised straight from a CollectionSchema.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCollection } from "../../../schema/base";
import { TextField } from "../../../schema/fields";
import { convertZodSchemaToCollectionSchema } from "../../analyzer";
import { compare } from "../../diff";
import { generate } from "../../generator";
import type { CollectionSchema, SchemaDefinition } from "../../types";
import { executeMigrationFiles } from "../helpers/migration-executor";

describe("Generated field options replay back", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "field-option-round-trip-"));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Generates the create migration for one collection, executes it, and
   * returns both the field as replay reads it and the diff a second
   * `db:generate` would produce.
   */
  function roundTrip(collection: CollectionSchema, fieldName: string) {
    const schema: SchemaDefinition = {
      collections: new Map([[collection.name, collection]]),
    };

    const generatedPaths = generate(compare(schema, null), tempDir);
    expect(generatedPaths).toHaveLength(1);

    const snapshot = executeMigrationFiles([generatedPaths[0]]).snapshot;
    const replayed = snapshot.collections.get(collection.name);
    expect(replayed).toBeDefined();

    return {
      field: replayed!.fields.find((f) => f.name === fieldName),
      followUp: compare(schema, snapshot),
    };
  }

  it("reads autogeneratePattern back from a TextField", () => {
    const collection = convertZodSchemaToCollectionSchema(
      "skus",
      defineCollection({
        collectionName: "skus",
        schema: z.object({
          sku: TextField({ autogeneratePattern: "[A-Z]{3}-[0-9]{6}" }),
        }),
      })
    );

    const { field, followUp } = roundTrip(collection, "sku");

    expect(field?.options?.autogeneratePattern).toBe("[A-Z]{3}-[0-9]{6}");
    expect(followUp.collectionsToModify).toHaveLength(0);
  });

  it("does not re-emit a migration for a collection it just generated", () => {
    const collection = convertZodSchemaToCollectionSchema(
      "skus_stable",
      defineCollection({
        collectionName: "skus_stable",
        schema: z.object({
          sku: TextField({ autogeneratePattern: "[A-Z]{3}-[0-9]{6}", min: 3, max: 20 }),
          note: TextField({ pattern: "^[a-z]+$" }),
        }),
      })
    );

    const { followUp } = roundTrip(collection, "sku");

    expect(followUp.collectionsToCreate).toHaveLength(0);
    expect(followUp.collectionsToModify).toHaveLength(0);
  });

  it("reads back the remaining whitelisted options the generator can write", () => {
    const collection: CollectionSchema = {
      name: "whitelisted_options",
      id: "whitelisted_options_id",
      type: "base",
      fields: [
        {
          name: "body",
          id: "body_id",
          type: "editor",
          required: false,
          options: { convertURLs: true, maxSize: 5000 },
        },
        {
          name: "secret",
          id: "secret_id",
          type: "password",
          required: false,
          options: { cost: 12, min: 8, hidden: true },
        },
        {
          name: "label",
          id: "label_id",
          type: "text",
          required: false,
          options: { presentable: true },
        },
      ],
      indexes: [],
    };

    const schema: SchemaDefinition = { collections: new Map([[collection.name, collection]]) };
    const generatedPaths = generate(compare(schema, null), tempDir);
    const snapshot = executeMigrationFiles([generatedPaths[0]]).snapshot;
    const replayed = snapshot.collections.get(collection.name)!;

    const optionsOf = (name: string) => replayed.fields.find((f) => f.name === name)?.options ?? {};

    expect(optionsOf("body")).toMatchObject({ convertURLs: true, maxSize: 5000 });
    expect(optionsOf("secret")).toMatchObject({ cost: 12, min: 8, hidden: true });
    expect(optionsOf("label")).toMatchObject({ presentable: true });

    expect(compare(schema, snapshot).collectionsToModify).toHaveLength(0);
  });

  it("treats PocketBase's zero-value options as equivalent to omitting them", () => {
    // What a PocketBase-authored migration looks like: every option present,
    // most of them at their zero value
    const verbose: CollectionSchema = {
      name: "verbose_options",
      id: "verbose_options_id",
      type: "base",
      fields: [
        {
          name: "title",
          id: "title_id",
          type: "text",
          required: true,
          options: {
            autogeneratePattern: "",
            hidden: false,
            max: 200,
            pattern: "",
            presentable: false,
            primaryKey: false,
            system: false,
          },
        },
      ],
      indexes: [],
    };

    const terse: CollectionSchema = {
      ...verbose,
      fields: [{ name: "title", id: "title_id", type: "text", required: true, options: { max: 200 } }],
    };

    const generatedPaths = generate(
      compare({ collections: new Map([[verbose.name, verbose]]) }, null),
      tempDir
    );
    const snapshot = executeMigrationFiles([generatedPaths[0]]).snapshot;

    const followUp = compare({ collections: new Map([[terse.name, terse]]) }, snapshot);
    expect(followUp.collectionsToModify).toHaveLength(0);
  });
});
