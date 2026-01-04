/**
 * Fixture: Collection with Unicode Characters
 *
 * Purpose: Tests that the migration generator correctly handles unicode characters
 * in collection names, field names, and field values
 *
 * Expected Behavior:
 * - Generates valid JavaScript with unicode characters
 * - Handles emoji, CJK characters, accented characters
 * - Properly encodes unicode in string literals
 *
 * Validates Requirements: 4.3
 */

import type { CollectionSchema, FieldDefinition } from "../../../types";

export const unicodeCollectionName = "unicode_test_collection";
export const unicodeCollectionType = "base" as const;

// Define fields with unicode characters
export const unicodeFields: FieldDefinition[] = [
  // Select field with emoji
  {
    name: "emoji_select",
    type: "select",
    required: false,
    options: {
      values: ["😀 Happy", "😢 Sad", "🎉 Party", "🚀 Rocket", "❤️ Heart", "🌟 Star", "🔥 Fire", "💯 Hundred"],
      maxSelect: 1,
    },
  },
  // Select field with CJK characters
  {
    name: "cjk_select",
    type: "select",
    required: false,
    options: {
      values: ["中文", "日本語", "한국어", "你好世界", "こんにちは世界", "안녕하세요 세계"],
      maxSelect: 1,
    },
  },
  // Select field with accented characters
  {
    name: "accented_select",
    type: "select",
    required: false,
    options: {
      values: ["café", "naïve", "résumé", "Zürich", "São Paulo", "Москва", "Ελλάδα", "العربية"],
      maxSelect: 1,
    },
  },
  // Select field with mathematical symbols
  {
    name: "math_symbols_select",
    type: "select",
    required: false,
    options: {
      values: [
        "∑ Sum",
        "∫ Integral",
        "∞ Infinity",
        "π Pi",
        "√ Square Root",
        "≠ Not Equal",
        "≤ Less Than or Equal",
        "≥ Greater Than or Equal",
      ],
      maxSelect: 1,
    },
  },
  // Select field with currency symbols
  {
    name: "currency_select",
    type: "select",
    required: false,
    options: {
      values: ["$ Dollar", "€ Euro", "£ Pound", "¥ Yen", "₹ Rupee", "₽ Ruble", "₩ Won", "฿ Baht"],
      maxSelect: 1,
    },
  },
  // Text field for general unicode content
  {
    name: "unicode_text",
    type: "text",
    required: false,
    options: {},
  },
];

export const UnicodeSchema: CollectionSchema = {
  name: unicodeCollectionName,
  type: unicodeCollectionType,
  fields: unicodeFields,
  indexes: [],
  permissions: {
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
  },
};
