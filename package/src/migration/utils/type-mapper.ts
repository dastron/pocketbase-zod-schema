/**
 * Zod to PocketBase type mapping utilities
 *
 * This module provides comprehensive mapping between Zod schema types
 * and PocketBase field types, including support for all PocketBase field types:
 * - text, email, url, editor
 * - number, bool
 * - date, autodate
 * - select (single/multiple)
 * - relation (single/multiple)
 * - file (single/multiple)
 * - json
 * - geoPoint
 */

import { z } from "zod";
import { extractFieldMetadata, type PocketBaseFieldType } from "../../schema/fields";

/**
 * All supported PocketBase field types
 */
export const POCKETBASE_FIELD_TYPES: readonly PocketBaseFieldType[] = [
  "text",
  "email",
  "url",
  "number",
  "bool",
  "date",
  "select",
  "relation",
  "file",
  "json",
  "editor",
  "geoPoint",
  "autodate",
  "password",
] as const;

/**
 * Field type metadata for documentation and validation
 */
export interface FieldTypeInfo {
  type: PocketBaseFieldType;
  description: string;
  zodTypes: string[];
  supportsMultiple: boolean;
}

/**
 * Metadata about each PocketBase field type
 */
export const FIELD_TYPE_INFO: Record<PocketBaseFieldType, FieldTypeInfo> = {
  text: {
    type: "text",
    description: "Plain text field",
    zodTypes: ["ZodString"],
    supportsMultiple: false,
  },
  password: {
    type: "password",
    description: "Password field (system)",
    zodTypes: ["ZodString"],
    supportsMultiple: false,
  },
  email: {
    type: "email",
    description: "Email address field with validation",
    zodTypes: ["ZodString with email()"],
    supportsMultiple: false,
  },
  url: {
    type: "url",
    description: "URL field with validation",
    zodTypes: ["ZodString with url()"],
    supportsMultiple: false,
  },
  editor: {
    type: "editor",
    description: "Rich text editor field",
    zodTypes: ["ZodString"],
    supportsMultiple: false,
  },
  number: {
    type: "number",
    description: "Numeric field (integer or float)",
    zodTypes: ["ZodNumber"],
    supportsMultiple: false,
  },
  bool: {
    type: "bool",
    description: "Boolean field",
    zodTypes: ["ZodBoolean"],
    supportsMultiple: false,
  },
  date: {
    type: "date",
    description: "Date/datetime field",
    zodTypes: ["ZodDate", "ZodString with datetime format"],
    supportsMultiple: false,
  },
  autodate: {
    type: "autodate",
    description: "Auto-managed date field (created/updated)",
    zodTypes: ["ZodString"],
    supportsMultiple: false,
  },
  select: {
    type: "select",
    description: "Single or multiple select from predefined values",
    zodTypes: ["ZodEnum", "ZodArray<ZodEnum>"],
    supportsMultiple: true,
  },
  relation: {
    type: "relation",
    description: "Reference to another collection (explicit RelationField()/RelationsField() metadata only)",
    zodTypes: ["RelationField()", "RelationsField()"],
    supportsMultiple: true,
  },
  file: {
    type: "file",
    description: "File upload field",
    zodTypes: ["File", "ZodArray<File>"],
    supportsMultiple: true,
  },
  json: {
    type: "json",
    description: "JSON data field",
    zodTypes: ["ZodRecord", "ZodObject", "ZodArray", "ZodArray<ZodString>"],
    supportsMultiple: false,
  },
  geoPoint: {
    type: "geoPoint",
    description: "Geographic coordinates (lon, lat)",
    zodTypes: ["ZodObject with lon/lat"],
    supportsMultiple: false,
  },
};

function getChecks(zodType: z.ZodTypeAny): any[] {
  const def = (zodType as any).def ?? (zodType as any)._def;
  return (def?.checks ?? []) as any[];
}

function getJsonSchema(zodType: z.ZodTypeAny): any | null {
  try {
    const toJSONSchema = (zodType as any).toJSONSchema;
    return typeof toJSONSchema === "function" ? toJSONSchema.call(zodType) : null;
  } catch {
    return null;
  }
}

/**
 * Maps Zod string types to PocketBase field types
 */
export function mapZodStringType(zodType: z.ZodString): PocketBaseFieldType {
  const checks = getChecks(zodType);

  // Check for email validation
  const hasEmail = checks.some((check: any) => check.kind === "email" || check.def?.format === "email");
  if (hasEmail) {
    return "email";
  }

  // Check for URL validation
  const hasUrl = checks.some((check: any) => check.kind === "url" || check.def?.format === "url");
  if (hasUrl) {
    return "url";
  }

  // Check for datetime validation (could be date field)
  const hasDatetime = checks.some(
    (check: any) => check.kind === "datetime" || check.def?.format === "datetime" || check.def?.format === "date-time"
  );
  if (hasDatetime) {
    return "date";
  }

  // Default to text
  return "text";
}

/**
 * Maps Zod number types to PocketBase number type
 */
export function mapZodNumberType(_zodType: z.ZodNumber): PocketBaseFieldType {
  return "number";
}

/**
 * Maps Zod boolean types to PocketBase bool type
 */
export function mapZodBooleanType(_zodType: z.ZodBoolean): PocketBaseFieldType {
  return "bool";
}

/**
 * Maps Zod enum types to PocketBase select type
 */
export function mapZodEnumType(_zodType: z.ZodEnum<any>): PocketBaseFieldType {
  return "select";
}

/**
 * Maps Zod array types to appropriate PocketBase types
 *
 * A bare array of strings maps to `json` — PocketBase has no plain
 * string-array type. Relations and multi-selects must be declared explicitly
 * with RelationsField() or SelectField(values, { maxSelect }).
 */
export function mapZodArrayType(zodType: z.ZodArray<any>): PocketBaseFieldType {
  const elementType = zodType.element as z.ZodTypeAny;

  if (elementType instanceof z.ZodFile) {
    return "file";
  }

  // Default to JSON for all other array types (including arrays of strings)
  return "json";
}

/**
 * Maps Zod date types to PocketBase date type
 */
export function mapZodDateType(_zodType: z.ZodDate): PocketBaseFieldType {
  return "date";
}

/**
 * Maps Zod record/object types to PocketBase JSON type
 */
export function mapZodRecordType(_zodType: z.ZodRecord | z.ZodObject<any>): PocketBaseFieldType {
  return "json";
}

/**
 * Main type mapping function that determines PocketBase field type from Zod type
 */
export function mapZodTypeToPocketBase(zodType: z.ZodTypeAny): PocketBaseFieldType {
  const unwrappedType = unwrapZodType(zodType);

  // Check for metadata first (explicit type overrides)
  const metadata = extractFieldMetadata(unwrappedType.description);
  if (metadata && metadata.type) {
    return metadata.type;
  }

  if (unwrappedType instanceof z.ZodFile) {
    return "file";
  }

  // Map based on Zod type
  let type: PocketBaseFieldType = "text";

  if (unwrappedType instanceof z.ZodString) {
    type = mapZodStringType(unwrappedType);
  } else if (unwrappedType instanceof z.ZodNumber) {
    type = mapZodNumberType(unwrappedType);
  } else if (unwrappedType instanceof z.ZodBoolean) {
    type = mapZodBooleanType(unwrappedType);
  } else if (unwrappedType instanceof z.ZodEnum) {
    type = mapZodEnumType(unwrappedType);
  } else if (unwrappedType instanceof z.ZodArray) {
    type = mapZodArrayType(unwrappedType);
  } else if (unwrappedType instanceof z.ZodDate) {
    type = mapZodDateType(unwrappedType);
  } else if (unwrappedType instanceof z.ZodRecord || unwrappedType instanceof z.ZodObject) {
    type = mapZodRecordType(unwrappedType);
  }

  return type;
}

/**
 * Extracts field options from Zod type (min, max, pattern, etc.)
 */
export function extractFieldOptions(zodType: z.ZodTypeAny): Record<string, any> {
  const options: Record<string, any> = {};

  const unwrappedType = unwrapZodType(zodType);
  const checks = getChecks(unwrappedType);

  // Extract string constraints
  if (unwrappedType instanceof z.ZodString) {
    for (const check of checks) {
      if (check.kind === "min") {
        options.min = check.value;
      }
      if (check.kind === "max") {
        options.max = check.value;
      }
      if (check.kind === "regex") {
        options.pattern = check.regex.source;
      }
    }

    if (options.min === undefined || options.max === undefined || options.pattern === undefined) {
      const schema = getJsonSchema(unwrappedType);
      if (schema) {
        if (options.min === undefined && typeof schema.minLength === "number") {
          options.min = schema.minLength;
        }
        if (options.max === undefined && typeof schema.maxLength === "number") {
          options.max = schema.maxLength;
        }
        if (options.pattern === undefined && typeof schema.pattern === "string") {
          options.pattern = schema.pattern;
        }
      }
    }
  }

  // Extract number constraints
  if (unwrappedType instanceof z.ZodNumber) {
    for (const check of checks) {
      if (check.kind === "min") {
        options.min = check.value;
      }
      if (check.kind === "max") {
        options.max = check.value;
      }
    }

    const schema = getJsonSchema(unwrappedType);
    if (schema) {
      if (options.min === undefined && typeof schema.minimum === "number") {
        options.min = schema.minimum;
      }
      if (options.max === undefined && typeof schema.maximum === "number") {
        options.max = schema.maximum;
      }
    }

    // `z.number().int()` is how an integer column is spelled in Zod; it maps
    // onto PocketBase's onlyInt, which the generator writes from noDecimal
    const isInteger =
      schema?.type === "integer" ||
      checks.some((check: any) => check.kind === "int" || String(check.def?.format ?? "").includes("int"));
    if (isInteger) {
      options.noDecimal = true;
    }
  }

  // Extract enum values
  if (unwrappedType instanceof z.ZodEnum) {
    options.values = unwrappedType.options.map(String);
  }

  // Extract array constraints
  if (unwrappedType instanceof z.ZodArray) {
    const arrayChecks = getChecks(unwrappedType);
    for (const check of arrayChecks) {
      if (check.kind === "min") {
        options.minSelect = check.value;
      }
      if (check.kind === "max") {
        options.maxSelect = check.value;
      }
    }

    if (options.minSelect === undefined || options.maxSelect === undefined) {
      const schema = getJsonSchema(unwrappedType);
      if (schema) {
        if (options.minSelect === undefined && typeof schema.minItems === "number") {
          options.minSelect = schema.minItems;
        }
        if (options.maxSelect === undefined && typeof schema.maxItems === "number") {
          options.maxSelect = schema.maxItems;
        }
      }
    }
  }

  return options;
}

/**
 * Determines if a Zod field is required (not optional)
 */
export function isFieldRequired(zodType: z.ZodTypeAny): boolean {
  // Check if it's optional
  if (zodType instanceof z.ZodOptional) {
    return false;
  }

  // Check if it has a default value (makes it optional)
  if (zodType instanceof z.ZodDefault) {
    return false;
  }

  // Check for nullable (in PocketBase context, nullable means optional)
  if (zodType instanceof z.ZodNullable) {
    return false;
  }

  return true;
}

/**
 * Unwraps a Zod type to get the inner type
 * Handles optional, nullable, and default wrappers
 */
export function unwrapZodType(zodType: z.ZodTypeAny): z.ZodTypeAny {
  let unwrapped = zodType;
  let previous = null;

  while (unwrapped !== previous) {
    previous = unwrapped;
    if (unwrapped instanceof z.ZodOptional) {
      unwrapped = unwrapped.unwrap() as z.ZodTypeAny;
    } else if (unwrapped instanceof z.ZodNullable) {
      unwrapped = unwrapped.unwrap() as z.ZodTypeAny;
    } else if (unwrapped instanceof z.ZodDefault) {
      unwrapped = unwrapped.unwrap() as z.ZodTypeAny;
    }
  }

  return unwrapped;
}

/**
 * Gets the default value from a Zod type if it has one
 */
export function getDefaultValue(zodType: z.ZodTypeAny): any {
  if (zodType instanceof z.ZodDefault) {
    return zodType.def.defaultValue;
  }
  return undefined;
}

/**
 * Checks if a Zod type is an array type
 */
export function isArrayType(zodType: z.ZodTypeAny): boolean {
  const unwrapped = unwrapZodType(zodType);
  return unwrapped instanceof z.ZodArray;
}

/**
 * Gets the element type of an array Zod type
 */
export function getArrayElementType(zodType: z.ZodTypeAny): z.ZodTypeAny | null {
  const unwrapped = unwrapZodType(zodType);
  if (unwrapped instanceof z.ZodArray) {
    return unwrapped.element as z.ZodTypeAny;
  }
  return null;
}

/**
 * Checks if a Zod type represents a geo point (object with lon/lat)
 */
export function isGeoPointType(zodType: z.ZodTypeAny): boolean {
  const unwrapped = unwrapZodType(zodType);
  if (!(unwrapped instanceof z.ZodObject)) {
    return false;
  }

  const shape = unwrapped.shape;
  const hasLon = "lon" in shape && shape.lon instanceof z.ZodNumber;
  const hasLat = "lat" in shape && shape.lat instanceof z.ZodNumber;

  return hasLon && hasLat;
}

/**
 * Complete field options extracted from a Zod type
 */
export interface ExtractedFieldOptions {
  min?: number;
  max?: number;
  pattern?: string;
  values?: string[];
  minSelect?: number;
  maxSelect?: number;
  mimeTypes?: string[];
  maxSize?: number;
  thumbs?: string[];
}

/**
 * Extracts comprehensive field options from Zod type
 * Includes all constraints that can be mapped to PocketBase field options
 */
export function extractComprehensiveFieldOptions(zodType: z.ZodTypeAny): ExtractedFieldOptions {
  const options: ExtractedFieldOptions = {};
  const unwrapped = unwrapZodType(zodType);
  const checks = getChecks(unwrapped);

  // Extract string constraints
  if (unwrapped instanceof z.ZodString) {
    for (const check of checks) {
      if (check.kind === "min") {
        options.min = check.value;
      }
      if (check.kind === "max") {
        options.max = check.value;
      }
      if (check.kind === "regex") {
        options.pattern = check.regex.source;
      }
    }

    if (options.min === undefined || options.max === undefined || options.pattern === undefined) {
      const schema = getJsonSchema(unwrapped);
      if (schema) {
        if (options.min === undefined && typeof schema.minLength === "number") {
          options.min = schema.minLength;
        }
        if (options.max === undefined && typeof schema.maxLength === "number") {
          options.max = schema.maxLength;
        }
        if (options.pattern === undefined && typeof schema.pattern === "string") {
          options.pattern = schema.pattern;
        }
      }
    }
  }

  // Extract number constraints
  if (unwrapped instanceof z.ZodNumber) {
    for (const check of checks) {
      if (check.kind === "min") {
        options.min = check.value;
      }
      if (check.kind === "max") {
        options.max = check.value;
      }
    }

    if (options.min === undefined || options.max === undefined) {
      const schema = getJsonSchema(unwrapped);
      if (schema) {
        if (options.min === undefined && typeof schema.minimum === "number") {
          options.min = schema.minimum;
        }
        if (options.max === undefined && typeof schema.maximum === "number") {
          options.max = schema.maximum;
        }
      }
    }
  }

  // Extract enum values
  if (unwrapped instanceof z.ZodEnum) {
    options.values = unwrapped.options.map(String);
  }

  // Extract array constraints
  if (unwrapped instanceof z.ZodArray) {
    const arrayChecks = getChecks(unwrapped);
    for (const check of arrayChecks) {
      if (check.kind === "min") {
        options.minSelect = check.value;
      }
      if (check.kind === "max") {
        options.maxSelect = check.value;
      }
    }

    if (options.minSelect === undefined || options.maxSelect === undefined) {
      const schema = getJsonSchema(unwrapped);
      if (schema) {
        if (options.minSelect === undefined && typeof schema.minItems === "number") {
          options.minSelect = schema.minItems;
        }
        if (options.maxSelect === undefined && typeof schema.maxItems === "number") {
          options.maxSelect = schema.maxItems;
        }
      }
    }

    // Check for enum element type
    const elementType = unwrapped.element as z.ZodTypeAny;
    if (elementType instanceof z.ZodEnum) {
      options.values = elementType.options.map(String);
    }
  }

  return options;
}



/**
 * Options every PocketBase field carries, whatever its type
 */
const UNIVERSAL_FIELD_OPTIONS = ["hidden", "presentable", "system"] as const;

/**
 * The options PocketBase actually stores per field type.
 *
 * Zod validators do not line up with PocketBase's option set: `z.string()
 * .email()` carries a regex that becomes `pattern`, but PocketBase's `email`
 * type has no `pattern` and drops it on save. Emitting one leaves the
 * migration file describing a collection the server never had — the file and
 * the database disagree from the moment it is applied.
 *
 * Keys are PocketBase's own, plus the internal aliases the generator
 * translates on the way out (`noDecimal` -> `onlyInt`).
 */
const SUPPORTED_FIELD_OPTIONS: Record<PocketBaseFieldType, readonly string[]> = {
  text: ["min", "max", "pattern", "autogeneratePattern", "primaryKey"],
  password: ["min", "max", "pattern", "cost"],
  email: ["exceptDomains", "onlyDomains"],
  url: ["exceptDomains", "onlyDomains"],
  editor: ["convertURLs", "maxSize"],
  number: ["min", "max", "onlyInt", "noDecimal"],
  bool: [],
  date: ["min", "max"],
  autodate: ["onCreate", "onUpdate"],
  select: ["values", "maxSelect"],
  file: ["mimeTypes", "thumbs", "maxSelect", "maxSize", "protected"],
  relation: ["collectionId", "cascadeDelete", "minSelect", "maxSelect"],
  json: ["maxSize"],
  geoPoint: [],
};

/**
 * The option keys a field of `fieldType` can carry — the same set the
 * generator is allowed to emit.
 *
 * The reader (`pocketbase-converter.extractFieldOptions`) uses this so that
 * every option the generator writes is read back on replay. A key that is
 * emitted but not read makes `compare()` see a modification on every run and
 * emit the same `updated_*` migration forever.
 *
 * @param fieldType - The PocketBase field type, if known
 * @returns The option keys readable for that type (every known key when the
 *   type is unrecognized)
 */
export function getSupportedFieldOptionKeys(fieldType?: string): string[] {
  const typeSpecific =
    fieldType && fieldType in SUPPORTED_FIELD_OPTIONS
      ? SUPPORTED_FIELD_OPTIONS[fieldType as PocketBaseFieldType]
      : Object.values(SUPPORTED_FIELD_OPTIONS).flat();

  return [...new Set([...typeSpecific, ...UNIVERSAL_FIELD_OPTIONS])];
}

/**
 * Drops the options a PocketBase field type does not support.
 *
 * @param fieldType - The resolved PocketBase field type
 * @param options - Options collected from the Zod schema or field metadata
 * @returns The supported subset, or undefined when nothing is left
 */
export function filterSupportedFieldOptions(
  fieldType: PocketBaseFieldType,
  options: Record<string, any> | undefined
): Record<string, any> | undefined {
  if (!options) {
    return options;
  }

  const supported = SUPPORTED_FIELD_OPTIONS[fieldType];
  if (!supported) {
    return options;
  }

  const allowed = new Set<string>([...supported, ...UNIVERSAL_FIELD_OPTIONS]);
  const filtered: Record<string, any> = {};

  for (const [key, value] of Object.entries(options)) {
    if (allowed.has(key)) {
      filtered[key] = value;
    }
  }

  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

/**
 * What PocketBase stores for an option that carries no constraint.
 *
 * Options live on a Go struct, so there is nothing to delete: dropping `max`
 * from a text field sets it back to `0`, dropping `pattern` sets it back to
 * `""`. `min`/`max` are typed per field and handled in
 * {@link getFieldOptionUnsetValue}.
 */
const OPTION_UNSET_VALUES: Record<string, any> = {
  pattern: "",
  autogeneratePattern: "",
  cost: 0,
  maxSize: 0,
  maxSelect: 0,
  minSelect: 0,
  primaryKey: false,
  onlyInt: false,
  noDecimal: false,
  convertURLs: false,
  protected: false,
  hidden: false,
  presentable: false,
  system: false,
  values: [],
  mimeTypes: [],
  thumbs: [],
  exceptDomains: [],
  onlyDomains: [],
};

/**
 * PocketBase's zero value for a field option — what the server holds once the
 * option no longer constrains anything.
 *
 * Removing an option has to be *written*, not omitted: the generator emits
 * `field.max = 0` rather than `field.max = null`, and the diff treats that zero
 * value as equivalent to a schema that never set the option. Emitting `null`
 * instead describes a state PocketBase cannot hold, and replay reads it back as
 * a removal still pending — a fresh `updated_*` migration on every run.
 *
 * @param fieldType - The PocketBase field type, if known
 * @param key - The option key
 * @returns The zero value PocketBase stores, or undefined for an unknown key
 */
export function getFieldOptionUnsetValue(fieldType: string | undefined, key: string): any {
  // min/max are typed per field type: *float64 on number (nil when unset),
  // types.DateTime on date (empty string), plain int everywhere else
  if (key === "min" || key === "max") {
    if (fieldType === "number") {
      return null;
    }
    if (fieldType === "date") {
      return "";
    }
    return 0;
  }

  return OPTION_UNSET_VALUES[key];
}

/**
 * Gets the PocketBase field type with additional context
 */
export interface FieldTypeResult {
  type: PocketBaseFieldType;
  isMultiple: boolean;
  options: ExtractedFieldOptions;
}

/**
 * Comprehensive type mapping that returns full field information
 */
export function getFieldTypeInfo(zodType: z.ZodTypeAny): FieldTypeResult {
  const type = mapZodTypeToPocketBase(zodType);
  const isMultiple = isArrayType(zodType);
  const options = extractComprehensiveFieldOptions(zodType);

  return {
    type,
    isMultiple,
    options,
  };
}
