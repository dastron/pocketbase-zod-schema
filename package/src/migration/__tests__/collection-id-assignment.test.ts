/**
 * Tests for collection ID assignment in diff generation
 */

import { describe, expect, it } from "vitest";
import { compare } from "../diff";
import type { CollectionSchema, SchemaDefinition } from "../types";

describe("Collection ID Assignment", () => {
  it("should assign collection IDs to new collections", () => {
    const testCollection: CollectionSchema = {
      name: "test_collection",
      type: "base",
      fields: [
        {
          name: "title",
          id: "title_id",
          type: "text",
          required: true,
        },
      ],
    };

    const currentSchema: SchemaDefinition = {
      collections: new Map([["test_collection", testCollection]]),
    };

    const diff = compare(currentSchema, null);

    expect(diff.collectionsToCreate).toHaveLength(1);
    expect(diff.collectionsToCreate[0].id).toBeDefined();
    expect(diff.collectionsToCreate[0].id).toMatch(/^pb_[a-z0-9]{15}$/);
  });

  it("should assign users constant for users collection", () => {
    const usersCollection: CollectionSchema = {
      name: "users",
      type: "auth",
      fields: [
        {
          name: "name",
          id: "name_id",
          type: "text",
          required: true,
        },
      ],
    };

    const currentSchema: SchemaDefinition = {
      collections: new Map([["users", usersCollection]]),
    };

    const diff = compare(currentSchema, null);

    expect(diff.collectionsToCreate).toHaveLength(1);
    expect(diff.collectionsToCreate[0].id).toBe("_pb_users_auth_");
  });

  it("should assign unique IDs to multiple collections", () => {
    const collection1: CollectionSchema = {
      name: "collection1",
      type: "base",
      fields: [],
    };

    const collection2: CollectionSchema = {
      name: "collection2",
      type: "base",
      fields: [],
    };

    const currentSchema: SchemaDefinition = {
      collections: new Map([
        ["collection1", collection1],
        ["collection2", collection2],
      ]),
    };

    const diff = compare(currentSchema, null);

    expect(diff.collectionsToCreate).toHaveLength(2);
    expect(diff.collectionsToCreate[0].id).toBeDefined();
    expect(diff.collectionsToCreate[1].id).toBeDefined();
    expect(diff.collectionsToCreate[0].id).not.toBe(diff.collectionsToCreate[1].id);
  });

  it("should preserve existing collection IDs if already present", () => {
    const existingId = "pb_existing123456";
    const testCollection: CollectionSchema = {
      name: "test_collection",
      id: existingId,
      type: "base",
      fields: [
        {
          name: "title",
          id: "title_id",
          type: "text",
          required: true,
        },
      ],
    };

    const currentSchema: SchemaDefinition = {
      collections: new Map([["test_collection", testCollection]]),
    };

    const diff = compare(currentSchema, null);

    expect(diff.collectionsToCreate).toHaveLength(1);
    expect(diff.collectionsToCreate[0].id).toBe(existingId);
  });
});
