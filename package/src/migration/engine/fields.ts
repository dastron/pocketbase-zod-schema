/**
 * Runtime field constructors matching the PocketBase JSVM globals
 *
 * In the PocketBase JSVM, migrations construct fields via `new Field({...})`
 * or typed constructors like `new TextField({...})`. Instances are plain
 * mutable objects; migrations freely assign properties after construction
 * (e.g. `field.max = 500`).
 *
 * The constructors deliberately add no default properties beyond `type`:
 * the resulting state must match what the migration file literally declares,
 * the same data the static parser would have extracted from the same literal.
 */

/**
 * Generic field constructor: `new Field({type: "number", ...})`.
 * PocketBase's own generated migrations use this form with an explicit type.
 */
export class Field {
  [key: string]: any;

  constructor(data: Record<string, any> = {}) {
    Object.assign(this, data);
  }
}

function typedField(type: string): new (data?: Record<string, any>) => Field {
  return class extends Field {
    constructor(data: Record<string, any> = {}) {
      super({ type, ...data });
    }
  };
}

// One constructor per PocketBase field type (see POCKETBASE_FIELD_TYPES)
export const TextField = typedField("text");
export const EmailField = typedField("email");
export const URLField = typedField("url");
export const NumberField = typedField("number");
export const BoolField = typedField("bool");
export const DateField = typedField("date");
export const SelectField = typedField("select");
export const RelationField = typedField("relation");
export const FileField = typedField("file");
export const JSONField = typedField("json");
export const EditorField = typedField("editor");
export const GeoPointField = typedField("geoPoint");
export const AutodateField = typedField("autodate");
export const PasswordField = typedField("password");

export const FIELD_CONSTRUCTORS: Record<string, new (data?: Record<string, any>) => Field> = {
  Field,
  TextField,
  EmailField,
  URLField,
  NumberField,
  BoolField,
  DateField,
  SelectField,
  RelationField,
  FileField,
  JSONField,
  EditorField,
  GeoPointField,
  AutodateField,
  PasswordField,
};

/**
 * Generates a field id in PocketBase's `<type><digits>` style when a
 * migration saves a field without one. PocketBase derives the digits from
 * crc32(name); a random suffix is sufficient here because diffing matches
 * fields by name, not id.
 */
export function generateRuntimeFieldId(type: string): string {
  let digits = "";
  for (let i = 0; i < 10; i++) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return `${type || "field"}${digits}`;
}
