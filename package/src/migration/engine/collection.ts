/**
 * Runtime Collection class matching the PocketBase JSVM global
 *
 * `new Collection({...})` in a migration produces one of these. All data
 * properties are copied verbatim (auth options, templates, etc. survive a
 * snapshot import round-trip); `fields` becomes a live FieldsList and
 * `indexes` a real array so `push`/`findIndex`/`splice` work natively.
 *
 * No rule properties are defaulted: the serialized collection must contain
 * exactly what the migration declared, so engine output stays byte-parity
 * with static analysis of the same literals.
 */

import { FieldsList } from "./fields-list";
import type { RawCollection } from "./types";

/**
 * Auth collections in real PocketBase always carry these system fields.
 * PocketBase injects the missing ones *when the collection is saved*
 * (`initDefaultFields`), not when the model is constructed — so this list is
 * applied by `ensureAuthSystemFields()` on the save path, never in the
 * constructor. Injecting on construction would also re-add them every time a
 * collection is rebuilt (`CollectionStore.clone()`), silently undoing a
 * migration that dropped one. Shapes and ids mirror what PocketBase
 * serializes into its own migration files.
 */
const AUTH_SYSTEM_FIELDS: RawCollection[] = [
  {
    autogeneratePattern: "",
    hidden: true,
    id: "password901924565",
    max: 0,
    min: 8,
    name: "password",
    pattern: "",
    presentable: false,
    required: true,
    system: true,
    type: "password",
  },
  {
    autogeneratePattern: "[a-zA-Z0-9]{50}",
    hidden: true,
    id: "text2504183744",
    max: 60,
    min: 30,
    name: "tokenKey",
    pattern: "",
    presentable: false,
    primaryKey: false,
    required: true,
    system: true,
    type: "text",
  },
  {
    exceptDomains: null,
    hidden: false,
    id: "email3885137012",
    name: "email",
    onlyDomains: null,
    presentable: false,
    required: true,
    system: true,
    type: "email",
  },
  {
    hidden: false,
    id: "bool1547992806",
    name: "emailVisibility",
    presentable: false,
    required: false,
    system: true,
    type: "bool",
  },
  {
    hidden: false,
    id: "bool256245529",
    name: "verified",
    presentable: false,
    required: false,
    system: true,
    type: "bool",
  },
];

export function generateRuntimeCollectionId(): string {
  let digits = "";
  for (let i = 0; i < 10; i++) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return `pbc_${digits}`;
}

export class Collection {
  [key: string]: any;

  id: string;
  name: string;
  type: string;
  system: boolean;
  fields: FieldsList;
  indexes: string[];

  constructor(data: RawCollection = {}) {
    const { fields, indexes, ...rest } = data;
    Object.assign(this, rest);

    this.id = typeof data.id === "string" && data.id !== "" ? data.id : generateRuntimeCollectionId();
    this.name = typeof data.name === "string" ? data.name : "";
    this.type = typeof data.type === "string" && data.type !== "" ? data.type : "base";
    this.system = data.system === true;
    this.fields = new FieldsList(Array.isArray(fields) ? fields : []);
    this.indexes = Array.isArray(indexes) ? [...indexes] : [];
  }

  /** PocketBase-shaped plain object (what a snapshot array entry looks like) */
  serialize(): RawCollection {
    const raw: RawCollection = {};
    for (const [key, value] of Object.entries(this)) {
      if (key === "fields" || key === "indexes") {
        continue;
      }
      raw[key] = value;
    }
    raw.fields = this.fields.serialize();
    raw.indexes = [...this.indexes];
    return raw;
  }
}

/**
 * PocketBase's `initDefaultFields` for auth collections: on save, any missing
 * system field is put back. Call this from the save path only — the resulting
 * collection is then stable across serialize/rebuild cycles, so replaying the
 * next migration file sees exactly what the previous one committed.
 */
export function ensureAuthSystemFields(collection: Collection): void {
  if (collection.type !== "auth") {
    return;
  }
  for (const systemField of AUTH_SYSTEM_FIELDS) {
    if (!collection.fields.getByName(systemField.name)) {
      collection.fields.add({ ...systemField });
    }
  }
}
