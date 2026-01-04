/**
 * Fixture: Collection with Special Characters in Field Values
 *
 * Purpose: Tests that the migration generator correctly escapes special characters
 * in string values, including quotes, newlines, backslashes, and unicode characters
 *
 * Expected Behavior:
 * - Generates valid JavaScript with properly escaped strings
 * - Handles single quotes, double quotes, backticks
 * - Handles newlines, tabs, carriage returns
 * - Handles backslashes and escape sequences
 * - Handles unicode characters (emoji, accented characters, etc.)
 *
 * Validates Requirements: 4.3
 */

import type { CollectionSchema, FieldDefinition } from "../../../types";

export const specialCharactersCollectionName = "special_characters_test";
export const specialCharactersCollectionType = "base" as const;

// Define fields with special characters in various properties
export const specialCharactersFields: FieldDefinition[] = [
  // Text field with quotes in default value
  {
    name: "text_with_quotes",
    type: "text",
    required: false,
    options: {
      min: 0,
      max: 0,
      pattern: "",
    },
  },
  // Select field with special characters in values
  {
    name: "select_with_special_chars",
    type: "select",
    required: false,
    options: {
      values: [
        "option with spaces",
        "option'with'single'quotes",
        'option"with"double"quotes',
        "option\nwith\nnewlines",
        "option\twith\ttabs",
        "option\\with\\backslashes",
        "option with emoji 🎉",
        "option with accents: café, naïve, résumé",
        "option with unicode: 你好世界",
        "option with symbols: @#$%^&*()",
        'option with mixed: It\'s a "test" \n with \\backslash',
      ],
      maxSelect: 1,
    },
  },
  // Editor field (rich text) - may contain HTML/special chars
  {
    name: "editor_with_html",
    type: "editor",
    required: false,
    options: {},
  },
  // JSON field - will contain complex nested structures
  {
    name: "json_with_special_chars",
    type: "json",
    required: false,
    options: {},
  },
  // Text field with pattern containing special regex chars
  {
    name: "text_with_regex_pattern",
    type: "text",
    required: false,
    options: {
      min: 0,
      max: 0,
      pattern: "^[a-zA-Z0-9_\\-\\.]+@[a-zA-Z0-9_\\-\\.]+\\.[a-zA-Z]{2,5}$",
    },
  },
];

export const SpecialCharactersSchema: CollectionSchema = {
  name: specialCharactersCollectionName,
  type: specialCharactersCollectionType,
  fields: specialCharactersFields,
  indexes: [],
  permissions: {
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
  },
};
