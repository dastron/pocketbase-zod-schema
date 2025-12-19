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
import type { PocketBaseFieldType } from "../types";

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
    description: "Reference to another collection",
    zodTypes: ["ZodString", "ZodArray<ZodString>"],
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
    zodTypes: ["ZodRecord", "ZodObject", "ZodArray"],
    supportsMultiple: false,
  },
  geoPoint: {
    type: "geoPoint",
    description: "Geographic coordinates (lon, lat)",
    zodTypes: ["ZodObject with lon/lat"],
    supportsMultiple: false,
  },
};

/**
 * Maps Zod string types to PocketBase field types
 */
export function mapZodStringType(zodType: z.ZodString): PocketBaseFieldType {
  const checks = (zodType as any)._def.checks || [];

  // Check for email validation
  const hasEmail = checks.some((check: any) => check.kind === "email");
  if (hasEmail) {
    return "email";
  }

  // Check for URL validation
  const hasUrl = checks.some((check: any) => check.kind === "url");
  if (hasUrl) {
    return "url";
  }

  // Check for datetime validation (could be date field)
  const hasDatetime = checks.some((check: any) => check.kind === "datetime");
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
 * Arrays of strings could be relations or file fields depending on context
 */
export function mapZodArrayType(zodType: z.ZodArray<any>, _fieldName: string): PocketBaseFieldType {
  const elementType = zodType._def.type;

  // Check if it's an array of File instances (file upload)
  if (elementType instanceof z.ZodType) {
    const typeName = elementType._def.typeName;
    if (typeName === "ZodType" && (elementType as any)._def?.innerType?.name === "File") {
      return "file";
    }
  }

  // Check for instanceof File
  if (elementType._def?.typeName === "ZodType") {
    const checks = (elementType as any)._def?.checks || [];
    const isFileInstance = checks.some(
      (check: any) => check.kind === "instanceof" || (elementType as any)._def?.innerType?.name === "File"
    );
    if (isFileInstance) {
      return "file";
    }
  }

  // Array of strings - could be relation (will be determined by relation detector)
  if (elementType instanceof z.ZodString) {
    return "relation";
  }

  // Default to JSON for other array types
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
export function mapZodTypeToPocketBase(zodType: z.ZodTypeAny, fieldName: string): PocketBaseFieldType {
  // Handle optional and nullable types by unwrapping
  let unwrappedType = zodType;

  if (zodType instanceof z.ZodOptional) {
    unwrappedType = zodType._def.innerType;
  }

  if (unwrappedType instanceof z.ZodNullable) {
    unwrappedType = unwrappedType._def.innerType;
  }

  if (unwrappedType instanceof z.ZodDefault) {
    unwrappedType = unwrappedType._def.innerType;
  }

  // Check for ZodEffects (which is what z.instanceof() creates)
  if ((unwrappedType as any)._def?.typeName === "ZodEffects") {
    const effect = (unwrappedType as any)._def?.effect;

    // z.instanceof(File) creates a refinement effect
    // We need to check if this is a File instance check
    // The field name 'avatar', 'image', 'file', 'attachment' etc. are hints
    if (effect?.type === "refinement") {
      // Common file field names
      const fileFieldNames = ["avatar", "image", "file", "attachment", "photo", "picture", "document", "upload"];
      if (fileFieldNames.some((name) => fieldName.toLowerCase().includes(name))) {
        return "file";
      }
    }
  }

  // Check for instanceof File (z.instanceof(File)) - legacy check
  if ((unwrappedType as any)._def?.typeName === "ZodType") {
    const checks = (unwrappedType as any)._def?.checks || [];
    const innerType = (unwrappedType as any)._def?.innerType;

    // Check if it's instanceof File
    if (innerType?.name === "File" || checks.some((check: any) => check.kind === "instanceof")) {
      return "file";
    }
  }

  // Map based on Zod type
  if (unwrappedType instanceof z.ZodString) {
    return mapZodStringType(unwrappedType);
  }

  if (unwrappedType instanceof z.ZodNumber) {
    return mapZodNumberType(unwrappedType);
  }

  if (unwrappedType instanceof z.ZodBoolean) {
    return mapZodBooleanType(unwrappedType);
  }

  if (unwrappedType instanceof z.ZodEnum) {
    return mapZodEnumType(unwrappedType);
  }

  if (unwrappedType instanceof z.ZodArray) {
    return mapZodArrayType(unwrappedType, fieldName);
  }

  if (unwrappedType instanceof z.ZodDate) {
    return mapZodDateType(unwrappedType);
  }

  if (unwrappedType instanceof z.ZodRecord || unwrappedType instanceof z.ZodObject) {
    return mapZodRecordType(unwrappedType);
  }

  // Default to text for unknown types
  return "text";
}

/**
 * Extracts field options from Zod type (min, max, pattern, etc.)
 */
export function extractFieldOptions(zodType: z.ZodTypeAny): Record<string, any> {
  const options: Record<string, any> = {};

  // Unwrap optional/nullable/default
  let unwrappedType = zodType;
  if (zodType instanceof z.ZodOptional) {
    unwrappedType = zodType._def.innerType;
  }
  if (unwrappedType instanceof z.ZodNullable) {
    unwrappedType = unwrappedType._def.innerType;
  }
  if (unwrappedType instanceof z.ZodDefault) {
    unwrappedType = unwrappedType._def.innerType;
  }

  const checks = (unwrappedType as any)._def?.checks || [];

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
  }

  // Extract enum values
  if (unwrappedType instanceof z.ZodEnum) {
    options.values = unwrappedType._def.values;
  }

  // Extract array constraints
  if (unwrappedType instanceof z.ZodArray) {
    const arrayChecks = (unwrappedType as any)._def?.checks || [];
    for (const check of arrayChecks) {
      if (check.kind === "min") {
        options.minSelect = check.value;
      }
      if (check.kind === "max") {
        options.maxSelect = check.value;
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

  if (unwrapped instanceof z.ZodOptional) {
    unwrapped = unwrapped._def.innerType;
  }

  if (unwrapped instanceof z.ZodNullable) {
    unwrapped = unwrapped._def.innerType;
  }

  if (unwrapped instanceof z.ZodDefault) {
    unwrapped = unwrapped._def.innerType;
  }

  return unwrapped;
}

/**
 * Gets the default value from a Zod type if it has one
 */
export function getDefaultValue(zodType: z.ZodTypeAny): any {
  if (zodType instanceof z.ZodDefault) {
    return zodType._def.defaultValue();
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
    return unwrapped._def.type;
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

  const shape = unwrapped._def.shape();
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
  const checks = (unwrapped as any)._def?.checks || [];

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
  }

  // Extract enum values
  if (unwrapped instanceof z.ZodEnum) {
    options.values = unwrapped._def.values;
  }

  // Extract array constraints
  if (unwrapped instanceof z.ZodArray) {
    const arrayDef = unwrapped._def;
    if (arrayDef.minLength) {
      options.minSelect = arrayDef.minLength.value;
    }
    if (arrayDef.maxLength) {
      options.maxSelect = arrayDef.maxLength.value;
    }

    // Check for enum element type
    const elementType = arrayDef.type;
    if (elementType instanceof z.ZodEnum) {
      options.values = elementType._def.values;
    }
  }

  return options;
}

/**
 * Determines if a field should be treated as an editor field
 * based on field name conventions
 */
export function isEditorField(fieldName: string): boolean {
  const editorFieldNames = [
    "content",
    "body",
    "description",
    "bio",
    "about",
    "summary",
    "notes",
    "details",
    "html",
    "richtext",
    "editor",
  ];
  return editorFieldNames.some((name) => fieldName.toLowerCase().includes(name));
}

/**
 * Determines if a field should be treated as a file field
 * based on field name conventions
 */
export function isFileFieldByName(fieldName: string): boolean {
  const fileFieldNames = [
    "avatar",
    "image",
    "file",
    "attachment",
    "photo",
    "picture",
    "document",
    "upload",
    "thumbnail",
    "cover",
    "banner",
    "logo",
    "icon",
    "media",
  ];
  return fileFieldNames.some((name) => fieldName.toLowerCase().includes(name));
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
export function getFieldTypeInfo(zodType: z.ZodTypeAny, fieldName: string): FieldTypeResult {
  const type = mapZodTypeToPocketBase(zodType, fieldName);
  const isMultiple = isArrayType(zodType);
  const options = extractComprehensiveFieldOptions(zodType);

  return {
    type,
    isMultiple,
    options,
  };
}
