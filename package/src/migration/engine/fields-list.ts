/**
 * FieldsList — runtime equivalent of a PocketBase collection's `fields`
 *
 * Mirrors the methods the JSVM exposes on `collection.fields`:
 * add / addAt / removeById / removeByName / getById / getByName, plus
 * read-side iteration. Field entries are live objects — mutations through
 * getByName() are visible when the collection is saved, exactly like the
 * generator's `const f = collection.fields.getByName("x"); f.max = 500;`
 * output expects.
 */

import { Field, generateRuntimeFieldId } from "./fields";

export class FieldsList {
  private items: Field[] = [];

  constructor(fields?: any[]) {
    if (Array.isArray(fields)) {
      this.add(...fields);
    }
  }

  get length(): number {
    return this.items.length;
  }

  /**
   * Appends fields; a field that matches an existing entry replaces it in
   * place (position preserved), matching PocketBase upsert semantics.
   */
  add(...fields: any[]): void {
    for (const raw of fields) {
      const { field, existing } = this.resolveIncoming(raw);
      if (existing >= 0) {
        this.items[existing] = field;
      } else {
        this.items.push(field);
      }
    }
  }

  /**
   * Inserts fields at a position. A field matching an already-present entry is
   * moved: the old entry is removed first, then the field is inserted at
   * the requested position.
   */
  addAt(position: number, ...fields: any[]): void {
    let insertAt = Math.max(0, Math.min(position, this.items.length));
    for (const raw of fields) {
      const { field, existing } = this.resolveIncoming(raw);
      if (existing >= 0) {
        this.items.splice(existing, 1);
        if (existing < insertAt) {
          insertAt--;
        }
      }
      insertAt = Math.max(0, Math.min(insertAt, this.items.length));
      this.items.splice(insertAt, 0, field);
      insertAt++;
    }
  }

  /**
   * Materializes an incoming field and locates the entry it replaces.
   *
   * PocketBase's rule (documented on `FieldsList.Add` in types.d.ts): match by
   * id, "or by their name if the new field doesn't have an explicit id", and
   * autogenerate a missing id from the name. Matching by id alone turns the
   * idiomatic `fields.add(new TextField({name: "title", max: 500}))` — no id,
   * meant to rewrite `title` — into a second field also called `title`, which
   * PocketBase would reject on save but the engine used to accept, corrupting
   * the reconstructed state.
   *
   * On a name match the *existing* id is kept rather than replaced with the
   * derived one. For a collection PocketBase authored the two are identical
   * (its auto-ids already are `<type><crc32(name)>`); they diverge only when
   * the stored field carries a hand-assigned id, and there preserving it keeps
   * a later `removeById`/`getById` in the same migration working.
   */
  private resolveIncoming(raw: any): { field: Field; existing: number } {
    const field = raw instanceof Field ? raw : new Field(raw);
    const hasExplicitId = typeof field.id === "string" && field.id !== "";

    if (hasExplicitId) {
      return { field, existing: this.indexOfId(field.id) };
    }

    const existing = this.items.findIndex((f) => f.name === field.name);
    field.id =
      existing >= 0
        ? this.items[existing].id
        : generateRuntimeFieldId(
            typeof field.type === "string" ? field.type : "",
            typeof field.name === "string" ? field.name : ""
          );
    return { field, existing };
  }

  removeById(id: string): void {
    const index = this.indexOfId(id);
    if (index >= 0) {
      this.items.splice(index, 1);
    }
  }

  removeByName(name: string): void {
    const index = this.items.findIndex((f) => f.name === name);
    if (index >= 0) {
      this.items.splice(index, 1);
    }
  }

  /**
   * Null rather than undefined for a miss: these two return a Go `Field`
   * interface, and goja surfaces a nil interface to JavaScript as `null`. A
   * migration written as `if (collection.fields.getByName("x") === null)` has
   * to take the same branch here as it does in production.
   */
  getById(id: string): Field | null {
    const index = this.indexOfId(id);
    return index >= 0 ? this.items[index] : null;
  }

  getByName(name: string): Field | null {
    return this.items.find((f) => f.name === name) ?? null;
  }

  at(index: number): Field | undefined {
    return this.items.at(index);
  }

  find(predicate: (field: Field, index: number) => boolean): Field | undefined {
    return this.items.find(predicate);
  }

  filter(predicate: (field: Field, index: number) => boolean): Field[] {
    return this.items.filter(predicate);
  }

  map<T>(mapper: (field: Field, index: number) => T): T[] {
    return this.items.map(mapper);
  }

  forEach(callback: (field: Field, index: number) => void): void {
    this.items.forEach(callback);
  }

  [Symbol.iterator](): Iterator<Field> {
    return this.items[Symbol.iterator]();
  }

  /** Replaces the whole list (used by unmarshal({fields: [...]}, collection)) */
  replaceAll(fields: any[]): void {
    this.items = [];
    this.add(...fields);
  }

  /**
   * Plain objects, in order — copied deeply, so option arrays like a select
   * field's `values` are not shared with the live list. A shallow spread let a
   * snapshot handed to the diff engine alias engine state, where an in-place
   * sort or push downstream would silently rewrite the collection it came from.
   */
  serialize(): Record<string, any>[] {
    return this.items.map((field) => copyPlainData({ ...field }) as Record<string, any>);
  }

  private indexOfId(id: unknown): number {
    if (typeof id !== "string" || id === "") {
      return -1;
    }
    return this.items.findIndex((f) => f.id === id);
  }
}

/**
 * Deep copy of arrays and plain objects; anything else (including a function a
 * migration parked on a field) passes through by reference rather than
 * throwing, which is what structuredClone would do.
 */
function copyPlainData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(copyPlainData);
  }
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      const copy: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) {
        copy[key] = copyPlainData(entry);
      }
      return copy;
    }
  }
  return value;
}
