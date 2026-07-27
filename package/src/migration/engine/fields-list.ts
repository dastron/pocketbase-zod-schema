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

import { Field } from "./fields";

export class FieldsList {
  private items: Field[] = [];

  constructor(fields?: any[]) {
    if (Array.isArray(fields)) {
      for (const field of fields) {
        this.items.push(field instanceof Field ? field : new Field(field));
      }
    }
  }

  get length(): number {
    return this.items.length;
  }

  /**
   * Appends fields; a field whose id matches an existing entry replaces it
   * in place (position preserved), matching PocketBase upsert semantics.
   */
  add(...fields: any[]): void {
    for (const raw of fields) {
      const field = raw instanceof Field ? raw : new Field(raw);
      const existing = this.indexOfId(field.id);
      if (existing >= 0) {
        this.items[existing] = field;
      } else {
        this.items.push(field);
      }
    }
  }

  /**
   * Inserts fields at a position. A field with an already-present id is
   * moved: the old entry is removed first, then the field is inserted at
   * the requested position.
   */
  addAt(position: number, ...fields: any[]): void {
    let insertAt = Math.max(0, Math.min(position, this.items.length));
    for (const raw of fields) {
      const field = raw instanceof Field ? raw : new Field(raw);
      const existing = this.indexOfId(field.id);
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

  getById(id: string): Field | undefined {
    const index = this.indexOfId(id);
    return index >= 0 ? this.items[index] : undefined;
  }

  getByName(name: string): Field | undefined {
    return this.items.find((f) => f.name === name);
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

  /** Plain objects, in order */
  serialize(): Record<string, any>[] {
    return this.items.map((field) => ({ ...field }));
  }

  private indexOfId(id: unknown): number {
    if (typeof id !== "string" || id === "") {
      return -1;
    }
    return this.items.findIndex((f) => f.id === id);
  }
}
