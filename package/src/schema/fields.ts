import { z } from "zod";

// ============================================================================
// Field Metadata System
// ============================================================================

/**
 * Internal marker for field metadata
 * Used by the migration generator to detect explicit field type definitions
 */
export const FIELD_METADATA_KEY = "__pocketbase_field__";

/**
 * PocketBase field types
 */
export type PocketBaseFieldType =
  | "text"
  | "email"
  | "url"
  | "editor"
  | "number"
  | "bool"
  | "date"
  | "autodate"
  | "select"
  | "relation"
  | "file"
  | "json"
  | "geoPoint"
  | "password";

/**
 * Field metadata structure embedded in Zod schema descriptions
 */
export interface FieldMetadata {
  type: PocketBaseFieldType;
  options?: Record<string, any>;
}

/**
 * Extracts field metadata from a Zod type's description
 * Used by the migration generator to detect explicit field type definitions
 *
 * @param description - The Zod type's description string
 * @returns Field metadata if present, null otherwise
 *
 * @example
 * const schema = TextField({ min: 1, max: 100 });
 * const metadata = extractFieldMetadata(schema.description);
 * // Returns: { type: "text", options: { min: 1, max: 100 } }
 */
export function extractFieldMetadata(description: string | undefined): FieldMetadata | null {
  if (!description) return null;

  try {
    const parsed = JSON.parse(description);
    if (parsed[FIELD_METADATA_KEY]) {
      return parsed[FIELD_METADATA_KEY];
    }
  } catch {
    // Not JSON, ignore
  }

  return null;
}

// ============================================================================
// Field Options Interfaces
// ============================================================================

/**
 * Text field configuration options
 */
export interface TextFieldOptions {
  /**
   * Minimum length constraint
   */
  min?: number;

  /**
   * Maximum length constraint
   */
  max?: number;

  /**
   * Pattern constraint (regex)
   */
  pattern?: RegExp | string;

  /**
   * Auto-generate pattern for automatic value generation
   * Example: "[A-Z]{3}-[0-9]{6}" generates values like "ABC-123456"
   */
  autogeneratePattern?: string;
}

/**
 * Number field configuration options
 */
export interface NumberFieldOptions {
  /**
   * Minimum value constraint
   */
  min?: number;

  /**
   * Maximum value constraint
   */
  max?: number;

  /**
   * Whether to disallow decimal values (integers only)
   */
  noDecimal?: boolean;

  /**
   * Whether the field is required
   * @default false
   *
   * Note: In PocketBase, `required: true` for number fields means the value must be non-zero.
   * If you want to allow zero values (e.g., for progress: 0-100), keep this as `false`.
   * Set to `true` only if you want to enforce non-zero values.
   */
  required?: boolean;
}

/**
 * Date field configuration options
 */
export interface DateFieldOptions {
  /**
   * Minimum date constraint
   */
  min?: Date | string;

  /**
   * Maximum date constraint
   */
  max?: Date | string;
}

/**
 * Autodate field configuration options
 */
export interface AutodateFieldOptions {
  /**
   * Set date automatically on record creation
   * @default false
   */
  onCreate?: boolean;

  /**
   * Update date automatically on record update
   * @default false
   */
  onUpdate?: boolean;
}

/**
 * Select field configuration options
 */
export interface SelectFieldOptions {
  /**
   * Maximum number of selections allowed
   * If > 1, enables multiple selection
   * @default 1
   */
  maxSelect?: number;
}

type EnumFromArray<T extends readonly [string, ...string[]]> = z.ZodEnum<z.core.util.ToEnum<T[number]>>;

/**
 * Human-friendly byte size input.
 *
 * - Use a number for raw bytes (e.g. `5242880`)
 * - Use a string with unit suffix for kibibytes/mebibytes/gibibytes (e.g. `"5M"`, `"1G"`)
 *
 * Supported suffixes: `K`, `M`, `G` (case-insensitive).
 */
export type ByteSize = number | `${number}${"K" | "M" | "G" | "k" | "m" | "g"}`;

/**
 * File field configuration options
 */
export interface FileFieldOptions {
  /**
   * Allowed MIME types
   * Example: ["image/*", "application/pdf"]
   */
  mimeTypes?: string[];

  /**
   * Maximum file size.
   *
   * - Provide a number for raw bytes
   * - Or use a string with `K`, `M`, `G` suffix (case-insensitive)
   *
   * Max allowed is `8G`.
   *
   * @example
   * maxSize: 5242880
   * maxSize: "5M"
   * maxSize: "1G"
   */
  maxSize?: ByteSize;

  /**
   * Thumbnail sizes to generate
   * Example: ["100x100", "200x200"]
   * Set to null to explicitly disable thumbnails
   */
  thumbs?: string[];

  /**
   * Whether the file is protected (requires auth to access)
   * @default false
   */
  protected?: boolean;
}

/**
 * Multiple files field configuration options
 */
export interface FilesFieldOptions extends FileFieldOptions {
  /**
   * Minimum number of files required
   */
  minSelect?: number;

  /**
   * Maximum number of files allowed
   */
  maxSelect?: number;
}

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024 * 1024; // 8G

function parseByteSizeToBytes(value: ByteSize, context: string): number {
  let bytes: number;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${context}: maxSize must be a finite number of bytes`);
    }
    bytes = Math.round(value);
  } else {
    const trimmed = value.trim();
    const match = /^(\d+(?:\.\d+)?)\s*([KMG])$/i.exec(trimmed);
    if (!match) {
      throw new Error(`${context}: maxSize string must be like "10K", "5M", or "1G" (case-insensitive)`);
    }

    const amount = Number(match[1]);
    const unit = match[2].toUpperCase() as "K" | "M" | "G";

    if (!Number.isFinite(amount)) {
      throw new Error(`${context}: maxSize must be a valid number`);
    }

    const multiplier = unit === "K" ? 1024 : unit === "M" ? 1024 * 1024 : 1024 * 1024 * 1024;
    bytes = Math.round(amount * multiplier);
  }

  if (bytes < 0) {
    throw new Error(`${context}: maxSize must be >= 0`);
  }

  if (bytes > MAX_FILE_SIZE_BYTES) {
    throw new Error(`${context}: maxSize cannot exceed 8G (${MAX_FILE_SIZE_BYTES} bytes)`);
  }

  return bytes;
}

function normalizeFileFieldOptions(
  options: FileFieldOptions | undefined,
  context: string
): FileFieldOptions | undefined {
  if (!options) return options;
  if (options.maxSize === undefined) return options;

  return {
    ...options,
    // PocketBase expects bytes; normalize any human-friendly inputs to bytes here.
    maxSize: parseByteSizeToBytes(options.maxSize, context),
  };
}

// ============================================================================
// Field Helper Functions
// ============================================================================

/**
 * Creates a boolean field schema
 * Maps to PocketBase 'bool' field type
 *
 * @returns Zod boolean schema with PocketBase metadata
 *
 * @example
 * const ProductSchema = z.object({
 *   active: BoolField(),
 *   featured: BoolField().optional(),
 * });
 */
export function BoolField(): z.ZodBoolean {
  const metadata = {
    [FIELD_METADATA_KEY]: {
      type: "bool" as const,
    },
  };

  return z.boolean().describe(JSON.stringify(metadata));
}

/**
 * Creates a number field schema with optional constraints
 * Maps to PocketBase 'number' field type
 *
 * @param options - Optional constraints for the number field
 * @returns Zod number schema with PocketBase metadata
 *
 * @example
 * const ProductSchema = z.object({
 *   price: NumberField({ min: 0 }),
 *   quantity: NumberField({ min: 0, noDecimal: true }),
 *   rating: NumberField({ min: 0, max: 5 }),
 *   progress: NumberField({ min: 0, max: 100 }), // required defaults to false, allowing zero
 *   score: NumberField({ min: 1, max: 10, required: true }), // requires non-zero value
 * });
 *
 * @remarks
 * By default, number fields are not required (`required: false`), which allows zero values.
 * In PocketBase, `required: true` for number fields means the value must be non-zero.
 * If you set `min: 0` and want to allow zero, keep `required: false` (the default).
 */
export function NumberField(options?: NumberFieldOptions): z.ZodNumber {
  // Validate options
  if (options?.min !== undefined && options?.max !== undefined) {
    if (options.min > options.max) {
      throw new Error("NumberField: min cannot be greater than max");
    }
  }

  // Create base schema
  let schema = z.number();

  // Apply Zod validations
  if (options?.min !== undefined) {
    schema = schema.min(options.min);
  }
  if (options?.max !== undefined) {
    schema = schema.max(options.max);
  }

  // Build metadata
  const metadata = {
    [FIELD_METADATA_KEY]: {
      type: "number" as const,
      options: options || {},
    },
  };

  return schema.describe(JSON.stringify(metadata));
}

/**
 * Creates a text field schema with optional constraints
 * Maps to PocketBase 'text' field type
 *
 * @param options - Optional constraints for the text field
 * @returns Zod string schema with PocketBase metadata
 *
 * @example
 * const ProductSchema = z.object({
 *   name: TextField({ min: 1, max: 200 }),
 *   sku: TextField({ autogeneratePattern: "[A-Z]{3}-[0-9]{6}" }),
 *   description: TextField({ max: 1000 }),
 * });
 */
export function TextField(options?: TextFieldOptions): z.ZodString {
  // Validate options
  if (options?.min !== undefined && options?.max !== undefined) {
    if (options.min > options.max) {
      throw new Error("TextField: min cannot be greater than max");
    }
  }

  // Create base schema
  let schema = z.string();

  // Apply Zod validations
  if (options?.min !== undefined) {
    schema = schema.min(options.min);
  }
  if (options?.max !== undefined) {
    schema = schema.max(options.max);
  }
  if (options?.pattern !== undefined) {
    const pattern = options.pattern instanceof RegExp ? options.pattern : new RegExp(options.pattern);
    schema = schema.regex(pattern);
  }

  // Build metadata
  const metadata = {
    [FIELD_METADATA_KEY]: {
      type: "text" as const,
      options: options || {},
    },
  };

  return schema.describe(JSON.stringify(metadata));
}

/**
 * Creates an email field schema
 * Maps to PocketBase 'email' field type
 *
 * @returns Zod string schema with email validation and PocketBase metadata
 *
 * @example
 * const UserSchema = z.object({
 *   email: EmailField(),
 *   alternateEmail: EmailField().optional(),
 * });
 */
export function EmailField(): z.ZodString {
  const metadata = {
    [FIELD_METADATA_KEY]: {
      type: "email" as const,
    },
  };

  return z.string().email().describe(JSON.stringify(metadata));
}

/**
 * Creates a URL field schema
 * Maps to PocketBase 'url' field type
 *
 * @returns Zod string schema with URL validation and PocketBase metadata
 *
 * @example
 * const ProductSchema = z.object({
 *   website: URLField(),
 *   documentation: URLField().optional(),
 * });
 */
export function URLField(): z.ZodString {
  const metadata = {
    [FIELD_METADATA_KEY]: {
      type: "url" as const,
    },
  };

  return z.string().url().describe(JSON.stringify(metadata));
}

/**
 * Creates a rich text editor field schema
 * Maps to PocketBase 'editor' field type
 *
 * @returns Zod string schema with PocketBase metadata
 *
 * @example
 * const PostSchema = z.object({
 *   content: EditorField(),
 *   summary: EditorField().optional(),
 * });
 */
export function EditorField(): z.ZodString {
  const metadata = {
    [FIELD_METADATA_KEY]: {
      type: "editor" as const,
    },
  };

  return z.string().describe(JSON.stringify(metadata));
}

/**
 * Creates a date field schema with optional constraints
 * Maps to PocketBase 'date' field type
 *
 * @param options - Optional date constraints
 * @returns Zod string schema with PocketBase metadata
 *
 * @example
 * const EventSchema = z.object({
 *   startDate: DateField(),
 *   endDate: DateField({ min: new Date('2024-01-01') }),
 *   releaseDate: DateField().optional(),
 * });
 */
export function DateField(options?: DateFieldOptions): z.ZodString {
  // Validate options
  if (options?.min !== undefined && options?.max !== undefined) {
    const minDate = typeof options.min === "string" ? new Date(options.min) : options.min;
    const maxDate = typeof options.max === "string" ? new Date(options.max) : options.max;
    if (minDate > maxDate) {
      throw new Error("DateField: min cannot be greater than max");
    }
  }

  // Create base schema
  const schema = z.string();

  // Build metadata
  const metadata = {
    [FIELD_METADATA_KEY]: {
      type: "date" as const,
      options: options || {},
    },
  };

  return schema.describe(JSON.stringify(metadata));
}

/**
 * Creates an autodate field schema with automatic timestamp management
 * Maps to PocketBase 'autodate' field type
 *
 * @param options - Optional autodate configuration
 * @returns Zod string schema with PocketBase metadata
 *
 * @example
 * const PostSchema = z.object({
 *   createdAt: AutodateField({ onCreate: true }),
 *   updatedAt: AutodateField({ onUpdate: true }),
 *   publishedAt: AutodateField({ onCreate: true, onUpdate: false }),
 * });
 */
export function AutodateField(options?: AutodateFieldOptions): z.ZodString {
  const schema = z.string();

  // Build metadata
  const metadata = {
    [FIELD_METADATA_KEY]: {
      type: "autodate" as const,
      options: options || {},
    },
  };

  return schema.describe(JSON.stringify(metadata));
}

/**
 * Creates a select field schema from enum values
 * Maps to PocketBase 'select' field type
 *
 * @param values - Array of allowed string values
 * @param options - Optional select configuration
 * @returns Zod enum or array schema with PocketBase metadata
 *
 * @example
 * // Single select
 * const PostSchema = z.object({
 *   status: SelectField(["draft", "published", "archived"]),
 * });
 *
 * @example
 * // Multiple select
 * const ProductSchema = z.object({
 *   categories: SelectField(["electronics", "clothing", "food"], { maxSelect: 3 }),
 * });
 */
export function SelectField<const T extends readonly [string, ...string[]]>(
  values: T,
  options?: SelectFieldOptions
): EnumFromArray<T> | z.ZodArray<EnumFromArray<T>> {
  // Return array schema if maxSelect > 1
  if (options?.maxSelect && options.maxSelect > 1) {
    return MultiSelectField(values, options);
  }

  return SingleSelectField(values);
}

/**
 * Creates a single select field schema from enum values
 * Maps to PocketBase 'select' field type with maxSelect=1
 *
 * @param values - Array of allowed string values
 * @returns Zod enum schema with PocketBase metadata
 */
export function SingleSelectField<const T extends readonly [string, ...string[]]>(values: T): EnumFromArray<T> {
  const enumSchema = z.enum(values);

  const metadata = {
    [FIELD_METADATA_KEY]: {
      type: "select" as const,
      options: {
        values,
        maxSelect: 1,
      },
    },
  };

  return enumSchema.describe(JSON.stringify(metadata)) as EnumFromArray<T>;
}

/**
 * Creates a multiple select field schema from enum values
 * Maps to PocketBase 'select' field type with maxSelect>1
 *
 * @param values - Array of allowed string values
 * @param options - Optional select configuration
 * @returns Zod array schema with PocketBase metadata
 */
export function MultiSelectField<const T extends readonly [string, ...string[]]>(
  values: T,
  options?: SelectFieldOptions
): z.ZodArray<EnumFromArray<T>> {
  const enumSchema = z.enum(values);
  const maxSelect = options?.maxSelect ?? 999;

  if (maxSelect <= 1) {
    throw new Error("MultiSelectField: maxSelect must be greater than 1");
  }

  const metadata = {
    [FIELD_METADATA_KEY]: {
      type: "select" as const,
      options: {
        values,
        maxSelect,
      },
    },
  };

  return z.array(enumSchema).describe(JSON.stringify(metadata)) as z.ZodArray<EnumFromArray<T>>;
}

/**
 * Creates a single file field schema
 * Maps to PocketBase 'file' field type with maxSelect=1
 *
 * @param options - Optional file constraints
 * @returns Zod schema that accepts File on input and returns string when reading from database
 *
 * @example
 * const ProductSchema = z.object({
 *   thumbnail: FileField({ mimeTypes: ["image/*"], maxSize: 5242880 }),
 *   document: FileField({ mimeTypes: ["application/pdf"] }),
 * });
 *
 * @remarks
 * - When creating/updating records: accepts File objects
 * - When reading from PocketBase: returns string (filename)
 */
export function FileField(options?: FileFieldOptions): z.ZodType<string, File | string> {
  // Accept File for input (when creating/updating) or string (when reading from DB)
  // Output is always string (as returned by PocketBase)
  const schema = z.preprocess((val) => {
    // If it's a File, return its name (or empty string if no name)
    // If it's already a string (from DB), return as-is
    return val instanceof File ? val.name || "" : val;
  }, z.string()) as z.ZodType<string, File | string>;

  const normalizedOptions = normalizeFileFieldOptions(options, "FileField");

  // Build metadata
  const metadata = {
    [FIELD_METADATA_KEY]: {
      type: "file" as const,
      options: normalizedOptions || {},
    },
  };

  return schema.describe(JSON.stringify(metadata));
}

/**
 * Creates a multiple files field schema
 * Maps to PocketBase 'file' field type with maxSelect>1
 *
 * @param options - Optional file constraints
 * @returns Zod array schema that accepts File[] on input and returns string[] when reading from database
 *
 * @example
 * const ProductSchema = z.object({
 *   images: FilesField({ mimeTypes: ["image/*"], maxSelect: 5 }),
 *   attachments: FilesField({ minSelect: 1, maxSelect: 10 }),
 * });
 *
 * @remarks
 * - When creating/updating records: accepts File[]
 * - When reading from PocketBase: returns string[] (filenames)
 */
export function FilesField(options?: FilesFieldOptions): z.ZodType<string[], (File | string)[]> {
  // Validate options
  if (options?.minSelect !== undefined && options?.maxSelect !== undefined) {
    if (options.minSelect > options.maxSelect) {
      throw new Error("FilesField: minSelect cannot be greater than maxSelect");
    }
  }

  // Accept File[] for input (when creating/updating) or string[] (when reading from DB)
  // Output is always string[] (as returned by PocketBase)
  let baseArraySchema = z.array(z.string());

  // Apply Zod validations first
  if (options?.minSelect !== undefined) {
    baseArraySchema = baseArraySchema.min(options.minSelect);
  }
  if (options?.maxSelect !== undefined) {
    baseArraySchema = baseArraySchema.max(options.maxSelect);
  }

  const schema = z.preprocess((val) => {
    // Handle array of Files or strings
    if (Array.isArray(val)) {
      return val.map((item) => (item instanceof File ? item.name || "" : item));
    }
    return val;
  }, baseArraySchema);

  const normalizedOptions = normalizeFileFieldOptions(options, "FilesField");

  // Build metadata
  const metadata = {
    [FIELD_METADATA_KEY]: {
      type: "file" as const,
      options: normalizedOptions || {},
    },
  };

  return schema.describe(JSON.stringify(metadata)) as z.ZodType<string[], (File | string)[]>;
}

/**
 * Creates a JSON field schema with optional inner schema validation
 * Maps to PocketBase 'json' field type
 *
 * @param schema - Optional Zod schema for the JSON structure
 * @returns Zod schema with PocketBase metadata
 *
 * @example
 * // Any JSON
 * const ProductSchema = z.object({
 *   metadata: JSONField(),
 * });
 *
 * @example
 * // Typed JSON
 * const ProductSchema = z.object({
 *   settings: JSONField(z.object({
 *     theme: z.string(),
 *     notifications: z.boolean(),
 *   })),
 * });
 */
export function JSONField<T extends z.ZodTypeAny>(schema?: T): T | z.ZodRecord<z.ZodString, z.ZodAny> {
  const baseSchema = schema ?? z.record(z.string(), z.any());

  // Build metadata
  const metadata = {
    [FIELD_METADATA_KEY]: {
      type: "json" as const,
    },
  };

  return baseSchema.describe(JSON.stringify(metadata)) as T | z.ZodRecord<z.ZodString, z.ZodAny>;
}

/**
 * Creates a geographic point field schema
 * Maps to PocketBase 'geoPoint' field type
 *
 * @returns Zod object schema with lon/lat fields and PocketBase metadata
 *
 * @example
 * const LocationSchema = z.object({
 *   coordinates: GeoPointField(),
 *   homeLocation: GeoPointField().optional(),
 * });
 */
export function GeoPointField(): z.ZodObject<{
  lon: z.ZodNumber;
  lat: z.ZodNumber;
}> {
  const schema = z.object({
    lon: z.number(),
    lat: z.number(),
  });

  // Build metadata
  const metadata = {
    [FIELD_METADATA_KEY]: {
      type: "geoPoint" as const,
    },
  };

  return schema.describe(JSON.stringify(metadata));
}
