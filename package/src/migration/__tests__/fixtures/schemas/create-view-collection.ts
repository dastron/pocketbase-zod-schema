/**
 * Fixture: View Collection
 *
 * Purpose: Tests that the migration generator correctly handles read-only view
 * collections backed by a SQL query
 *
 * Expected Behavior:
 * - Generates a collection with type "view" carrying the SQL query
 * - No fields or indexes are emitted (PocketBase derives fields from the query)
 * - Read rules are preserved, write rules are locked to null
 *
 * Paired reference migration: reference-migrations/1769500000_created_view_collection.js
 */

import type { CollectionSchema } from "../../../types";

export const createViewCollectionName = "view_collection";
export const createViewCollectionType = "view" as const;

export const createViewCollectionQuery = [
  "SELECT p.id AS id,",
  "       p.title AS title",
  "  FROM create_new_collection_with_columns p",
].join("\n");

export const CreateViewCollectionSchema: CollectionSchema = {
  name: createViewCollectionName,
  type: createViewCollectionType,
  viewQuery: createViewCollectionQuery,
  // A view has no stored fields - PocketBase derives them from the query.
  // The Zod shape only drives TypeScript type generation.
  fields: [],
  indexes: [],
  permissions: {
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: null,
    updateRule: null,
    deleteRule: null,
  },
};
