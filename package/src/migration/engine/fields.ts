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
 * the same data the literal declares, materialized as a real object.
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

/** crc32 (IEEE polynomial), lazily tabulated */
let crcTable: Uint32Array | null = null;

function crc32(input: string): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let bit = 0; bit < 8; bit++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[i] = c >>> 0;
    }
  }

  let crc = 0xffffffff;
  for (const byte of new TextEncoder().encode(input)) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * The id PocketBase gives a field that is added without one: its type
 * followed by crc32 of its name, as an unsigned decimal. Verified against the
 * ids PocketBase writes for the auth system fields — `password901924565`,
 * `text2504183744` (tokenKey), `email3885137012`, `bool1547992806`
 * (emailVisibility), `bool256245529` (verified), `text3208210256` (id).
 *
 * The formula has to match exactly, not just look plausible: `FieldsList.add()`
 * uses the derived id to decide whether an incoming field *replaces* an
 * existing one, so a random suffix silently turns a field rewrite into a
 * duplicate field.
 */
export function generateRuntimeFieldId(type: string, name: string): string {
  return `${type || "field"}${crc32(name)}`;
}
