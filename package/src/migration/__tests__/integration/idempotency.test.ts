import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compare } from "../../diff";
import type { CollectionSchema, FieldDefinition, SchemaDefinition, SchemaSnapshot } from "../../types";

function createSchemaDefinition(collectionSchema: any): SchemaDefinition {
  return {
    collections: new Map([
      [collectionSchema.name, collectionSchema],
      ["users", { name: "users", id: "users_id", type: "auth", fields: [] } as any], // Mock users collection
    ]),
  };
}

// Helper to create a snapshot that mirrors the schema, simulating "applied" state
function createSnapshotFromSchema(schema: SchemaDefinition): SchemaSnapshot {
  return {
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    collections: new Map(schema.collections),
  };
}

describe("Migration Idempotency Tests", () => {
  const tempDir = path.join(os.tmpdir(), "migration-idempotency-test-" + Date.now());

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // Previous tests omitted...

  it("should handle relation field where snapshot has ID and schema has Name", () => {
    // 1. Schema defines relation to "target_col" by name
    const schema: CollectionSchema = {
      name: "source_col",
      id: "source_col_id",
      type: "base",
      fields: [
        {
          name: "rel_field",
          id: "rel_field_id",
          type: "relation",
          required: false,
          relation: {
            collection: "target_col", // Name reference
            maxSelect: 1,
            minSelect: 0,
            cascadeDelete: false,
          },
          options: {},
        },
      ],
    };

    const targetSchema: CollectionSchema = {
      name: "target_col",
      id: "target_col_id",
      type: "base",
      fields: [],
    };

    // 2. Snapshot has resolved the relation to the ID of target_col
    const snapshotSource: CollectionSchema = {
      ...schema,
      fields: [
        {
          ...schema.fields[0],
          relation: {
            ...schema.fields[0].relation!,
            collection: "pb_target_12345", // ID reference
          },
        },
      ],
    };

    const snapshotTarget: CollectionSchema = {
      ...targetSchema,
      id: "pb_target_12345",
    };

    const currentSchema = {
      collections: new Map([
        ["source_col", schema],
        ["target_col", targetSchema],
      ]),
    };

    const snapshot = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      collections: new Map([
        ["source_col", snapshotSource],
        ["target_col", snapshotTarget],
      ]),
    };

    // 3. Compare
    const diff = compare(currentSchema, snapshot);

    // This should ideally be 0, but if bug exists, it will be > 0 (modifying rel_field)
    if (diff.collectionsToModify.length > 0) {
      console.log(
        "Reproduction SUCCESS: Detected changes in relation field:",
        JSON.stringify(diff.collectionsToModify, null, 2)
      );
    }

    expect(diff.collectionsToModify).toHaveLength(0);
  });

  describe("Sequential Schema Evolution Idempotency", () => {
    const collectionName = "evolution_col";

    function checkIdempotency(schema: SchemaDefinition) {
      const snapshot = createSnapshotFromSchema(schema);
      const diff = compare(schema, snapshot);

      if (diff.collectionsToCreate.length > 0) {
        console.error("Unexpected collections to create:", JSON.stringify(diff.collectionsToCreate, null, 2));
      }
      if (diff.collectionsToModify.length > 0) {
        console.error("Unexpected collections to modify:", JSON.stringify(diff.collectionsToModify, null, 2));
      }
      if (diff.collectionsToDelete.length > 0) {
        console.error("Unexpected collections to delete:", JSON.stringify(diff.collectionsToDelete, null, 2));
      }

      expect(diff.collectionsToCreate).toHaveLength(0);
      expect(diff.collectionsToModify).toHaveLength(0);
      expect(diff.collectionsToDelete).toHaveLength(0);
    }

    it("should remain idempotent through sequential field additions", () => {
      // 1. Base Collection
      let collectionFields: FieldDefinition[] = [];
      let schema = createSchemaDefinition({
        name: collectionName,
        type: "base",
        fields: collectionFields,
      });
      checkIdempotency(schema);

      // 2. Add Text Field
      collectionFields.push({
        name: "title",
        id: "title_id",
        type: "text",
        required: true,
        options: { min: 1, max: 100, pattern: "" },
      });
      schema = createSchemaDefinition({
        name: collectionName,
        type: "base",
        fields: collectionFields,
      });
      checkIdempotency(schema);

      // 3. Add Number Field
      collectionFields.push({
        name: "count",
        id: "count_id",
        type: "number",
        required: false,
        options: { min: 0, max: 1000, noDecimal: true },
      });
      schema = createSchemaDefinition({
        name: collectionName,
        type: "base",
        fields: collectionFields,
      });
      checkIdempotency(schema);

      // 4. Add Bool Field
      collectionFields.push({
        name: "active",
        id: "active_id",
        type: "bool",
        required: false,
        options: {},
      });
      schema = createSchemaDefinition({
        name: collectionName,
        type: "base",
        fields: collectionFields,
      });
      checkIdempotency(schema);

      // 5. Add Email Field
      collectionFields.push({
        name: "contact_email",
        id: "contact_email_id",
        type: "email",
        required: false,
        options: { exceptDomains: [], onlyDomains: [] },
      });
      schema = createSchemaDefinition({
        name: collectionName,
        type: "base",
        fields: collectionFields,
      });
      checkIdempotency(schema);

      // 6. Add Url Field
      collectionFields.push({
        name: "website",
        id: "website_id",
        type: "url",
        required: false,
        options: { exceptDomains: [], onlyDomains: [] },
      });
      schema = createSchemaDefinition({
        name: collectionName,
        type: "base",
        fields: collectionFields,
      });
      checkIdempotency(schema);

      // 7. Add Date Field
      collectionFields.push({
        name: "event_date",
        id: "event_date_id",
        type: "date",
        required: false,
        options: { min: "", max: "" },
      });
      schema = createSchemaDefinition({
        name: collectionName,
        type: "base",
        fields: collectionFields,
      });
      checkIdempotency(schema);

      // 8. Add Select Field
      collectionFields.push({
        name: "category",
        id: "category_id",
        type: "select",
        required: false,
        options: { maxSelect: 1, values: ["a", "b", "c"] },
      });
      schema = createSchemaDefinition({
        name: collectionName,
        type: "base",
        fields: collectionFields,
      });
      checkIdempotency(schema);

      // 9. Add Json Field
      collectionFields.push({
        name: "metadata",
        id: "metadata_id",
        type: "json",
        required: false,
        options: {},
      });
      schema = createSchemaDefinition({
        name: collectionName,
        type: "base",
        fields: collectionFields,
      });
      checkIdempotency(schema);

      // 10. Add File Field
      collectionFields.push({
        name: "attachment",
        id: "attachment_id",
        type: "file",
        required: false,
        options: { maxSelect: 1, maxSize: 5242880, mimeTypes: [], thumbs: [] },
      });
      schema = createSchemaDefinition({
        name: collectionName,
        type: "base",
        fields: collectionFields,
      });
      checkIdempotency(schema);

      // 11. Add Relation Field
      collectionFields.push({
        name: "owner",
        id: "owner_id",
        type: "relation",
        required: false,
        relation: {
          collection: "users",
          maxSelect: 1,
          minSelect: 0,
          cascadeDelete: false,
        },
        options: {},
      });
      schema = createSchemaDefinition({
        name: collectionName,
        type: "base",
        fields: collectionFields,
      });
      checkIdempotency(schema);
    });

    it("should normalize relation options to avoid false positive changes", () => {
      // This test reproduces the issue where maxSelect: 1 triggers a migration loop
      // because it wasn't being normalized against null/undefined in the snapshot
      const schema = createSchemaDefinition({
        name: "relation_loop_repro",
        id: "relation_loop_repro_id",
        type: "base",
        fields: [
          {
            name: "rel_field",
            id: "rel_field_id",
            type: "relation",
            required: false,
            relation: {
              collection: "users",
              maxSelect: 1, // Default value that should be normalized
              minSelect: 0, // Default value that should be normalized
              cascadeDelete: false,
            },
            options: {},
          },
        ],
      });

      // Create a snapshot that mimics PB's state where defaults are stored as null/undefined
      // We use the helper validly, then manually patch the specific field to simulate the issue
      const properSnapshot = createSnapshotFromSchema(schema);

      // Get the collection we want to modify
      const col = properSnapshot.collections.get("relation_loop_repro");
      if (!col) throw new Error("Collection not found in snapshot");

      const colClone = {
        ...col,
        fields: col.fields.map((f) => {
          if (f.name === "rel_field") {
            return {
              ...f,
              relation: {
                ...f.relation!,
                maxSelect: null,
                minSelect: null,
              },
            };
          }
          return f;
        }),
      } as any; /* casting to any to allow nulls if strict types forbid it, though types allow optional? */

      properSnapshot.collections.set("relation_loop_repro", colClone);

      const diff = compare(schema, properSnapshot);

      if (diff.collectionsToModify.length > 0) {
        console.log("Difference found:", JSON.stringify(diff.collectionsToModify, null, 2));
      }

      expect(diff.collectionsToModify).toHaveLength(0);
    });
  });
});
