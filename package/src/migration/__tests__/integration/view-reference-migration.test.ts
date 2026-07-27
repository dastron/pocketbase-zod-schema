/**
 * Compares generated view migrations against a reference migration authored by
 * PocketBase itself (created through the API on PocketBase 0.35.0, captured
 * from its automigrate output).
 *
 * The reference tells us what PocketBase considers canonical for a view:
 * type "view", the SQL query, read rules kept, write rules null, no indexes.
 * It also shows the derived `fields` array PocketBase writes for itself -
 * clone ids like `_clone_cLFu` are regenerated on every save, which is why the
 * generator never emits fields for a view and the diff never compares them.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compare } from "../../diff";
import { generate } from "../../generator";
import { executeMigrationFiles } from "../helpers/migration-executor";
import type { SchemaDefinition } from "../../types";
import { CreateViewCollectionSchema } from "../fixtures/schemas";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REFERENCE_PATH = join(__dirname, "../fixtures/reference-migrations/1769500000_created_view_collection.js");

describe("View Collection - PocketBase reference migration", () => {
  const tempDir = path.join(os.tmpdir(), "migration-test-view-ref-" + Date.now());

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reads PocketBase's own view migration", () => {
    const result = executeMigrationFiles([REFERENCE_PATH]);

    expect(result.created).toHaveLength(1);

    const collection = result.created[0];
    expect(collection.name).toBe("view_collection");
    expect(collection.type).toBe("view");
    expect(collection.viewQuery).toBe(CreateViewCollectionSchema.viewQuery);

    // PocketBase's derived fields are dropped: they are output, not schema
    expect(collection.fields).toHaveLength(0);
  });

  it("agrees with PocketBase on what defines a view", () => {
    const schema: SchemaDefinition = {
      collections: new Map([[CreateViewCollectionSchema.name, CreateViewCollectionSchema]]),
    };

    const generatedPath = generate(compare(schema, null), tempDir)[0];

    const reference = executeMigrationFiles([REFERENCE_PATH]).created[0];
    const ours = executeMigrationFiles([generatedPath]).created[0];

    expect(ours.type).toBe(reference.type);
    expect(ours.viewQuery).toBe(reference.viewQuery);
    expect(ours.rules?.listRule).toBe(reference.rules?.listRule);
    expect(ours.rules?.viewRule).toBe(reference.rules?.viewRule);
    expect(ours.rules?.createRule).toBeNull();
    expect(ours.rules?.updateRule).toBeNull();
    expect(ours.rules?.deleteRule).toBeNull();
  });

  it("re-reading our own output needs no follow-up migration", () => {
    const schema: SchemaDefinition = {
      collections: new Map([[CreateViewCollectionSchema.name, CreateViewCollectionSchema]]),
    };

    const dir = path.join(tempDir, "roundtrip");
    fs.mkdirSync(dir, { recursive: true });
    const generatedPath = generate(compare(schema, null), dir)[0];

    const snapshot = executeMigrationFiles([generatedPath]).snapshot;

    expect(compare(schema, snapshot).collectionsToModify).toHaveLength(0);
  });
});
