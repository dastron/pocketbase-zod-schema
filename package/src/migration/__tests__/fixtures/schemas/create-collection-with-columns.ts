/**
 * Fixture: Collection with All Field Types
 *
 * Purpose: Tests that the migration generator correctly handles all PocketBase field types
 *
 * Expected Behavior:
 * - Generates a collection with text, editor, number, bool, email, url, date, select, file, relation, json, and geoPoint fields
 * - All field type-specific properties are correctly mapped
 * - Base fields (id, created, updated) are included
 * - Collection has null permissions (superuser-only access)
 *
 * Validates Requirements: 1.1, 3.1-3.13
 */

import type { CollectionSchema, FieldDefinition } from "../../../types";

export const createCollectionWithColumnsName = "create_new_collection_with_columns";
export const createCollectionWithColumnsType = "base" as const;

// Define fields matching the reference migration
export const createCollectionWithColumnsFields: FieldDefinition[] = [
  {
    name: "plain_text_column",
    id: "plain_text_column_id",
    type: "text",
    required: false,
    options: {},
  },
  {
    name: "rich_text_column",
    id: "rich_text_column_id",
    type: "editor",
    required: false,
    options: {},
  },
  {
    name: "number_column",
    id: "number_column_id",
    type: "number",
    required: false,
    options: {},
  },
  {
    name: "bool_column",
    id: "bool_column_id",
    type: "bool",
    required: false,
    options: {},
  },
  {
    name: "email_column",
    id: "email_column_id",
    type: "email",
    required: false,
    options: {},
  },
  {
    name: "url_column",
    id: "url_column_id",
    type: "url",
    required: false,
    options: {},
  },
  {
    name: "datetime_column",
    id: "datetime_column_id",
    type: "date",
    required: false,
    options: {},
  },
  {
    name: "select_column",
    id: "select_column_id",
    type: "select",
    required: false,
    options: {
      values: ["a_select_option", "b_select_option"],
      maxSelect: 1,
    },
  },
  {
    name: "file_column",
    id: "file_column_id",
    type: "file",
    required: false,
    options: {
      maxSelect: 1,
      maxSize: 0,
      mimeTypes: [],
      thumbs: [],
      protected: false,
    },
  },
  {
    name: "relation_to_users_column",
    id: "relation_to_users_column_id",
    type: "relation",
    required: false,
    options: {},
    relation: {
      collection: "users",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: false,
    },
  },
  {
    name: "json_column",
    id: "json_column_id",
    type: "json",
    required: false,
    options: {},
  },
  {
    name: "geopoint_column",
    id: "geopoint_column_id",
    type: "geoPoint",
    required: false,
    options: {},
  },
  {
    name: "autodate_column",
    id: "autodate_column_id",
    type: "autodate",
    required: false,
    options: {
      onCreate: true,
      onUpdate: false,
    },
  },
];

export const CreateCollectionWithColumnsSchema: CollectionSchema = {
  name: createCollectionWithColumnsName,
  type: createCollectionWithColumnsType,
  fields: createCollectionWithColumnsFields,
  indexes: [],
  permissions: {
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  },
};
