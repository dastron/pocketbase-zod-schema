/**
 * Record simulation — an in-memory row store per collection
 *
 * Schema reconstruction never needs this: a migration that seeds or rewrites
 * data does not change the shape of a collection. It matters for the other
 * job the engine can do — running a hand-written data migration before it
 * touches production and seeing what it actually does.
 *
 * Enabled with `records: "simulate"`. Left off, `Record` and the data-layer
 * `app.*` methods stay the inert stubs they have always been, so schema-only
 * replay is unchanged.
 *
 * The store lives on `CollectionStore`, which means it inherits the runner's
 * transaction semantics for free: a migration that throws halfway through a
 * data rewrite leaves neither schema nor records behind.
 */

import type { Collection } from "./collection";

/**
 * Fields PocketBase manages itself. `id` is generated on save; `created` and
 * `updated` are autodate columns the server stamps.
 */
const SYSTEM_RECORD_FIELDS = ["id", "created", "updated"];

/** PocketBase record ids are 15 lowercase alphanumeric characters */
export function generateRecordId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let index = 0; index < 15; index++) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
}

/**
 * The `Record` global a migration sees. Mirrors `core.Record`'s JSVM surface:
 * `get`/`set` plus the typed getters, `load`, `publicExport`, `originalCopy`.
 *
 * Arbitrary property access (`record.title`) is deliberately *not* supported —
 * `core.Record` is a Go struct and does not support it either, so a migration
 * that relies on it would fail in PocketBase.
 */
export class RecordModel {
  private data: Record<string, unknown> = {};
  private original: Record<string, unknown> = {};
  private readonly owner: Collection;
  /** Set by setPassword(); PocketBase stores a hash, the simulation the value */
  private password?: string;

  constructor(collection: Collection, data: Record<string, unknown> = {}) {
    if (!collection || typeof collection !== "object" || typeof (collection as Collection).name !== "string") {
      throw new Error("[engine] new Record() expects a collection");
    }
    this.owner = collection;
    this.load(data);
    this.original = { ...this.data };
  }

  get id(): string {
    return typeof this.data.id === "string" ? this.data.id : "";
  }

  set id(value: string) {
    this.data.id = value;
  }

  collection(): Collection {
    return this.owner;
  }

  /** PocketBase names a collection's table after the collection */
  tableName(): string {
    return this.owner.name;
  }

  get(key: string): unknown {
    return this.data[key];
  }

  set(key: string, value: unknown): void {
    this.data[key] = value;
  }

  getString(key: string): string {
    const value = this.get(key);
    if (value === null || value === undefined) {
      return "";
    }
    return typeof value === "string" ? value : String(value);
  }

  getBool(key: string): boolean {
    const value = this.get(key);
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    if (typeof value === "string") {
      return value !== "" && value !== "0" && value.toLowerCase() !== "false";
    }
    return Boolean(value);
  }

  getInt(key: string): number {
    const value = Number(this.get(key));
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }

  getFloat(key: string): number {
    const value = Number(this.get(key));
    return Number.isFinite(value) ? value : 0;
  }

  getDateTime(key: string): string {
    return this.getString(key);
  }

  getStringSlice(key: string): string[] {
    const value = this.get(key);
    if (Array.isArray(value)) {
      return value.map((entry) => (typeof entry === "string" ? entry : String(entry)));
    }
    if (typeof value === "string" && value !== "") {
      return [value];
    }
    return [];
  }

  /** Bulk assignment, as `record.load({...})` does in the JSVM */
  load(data: Record<string, unknown>): void {
    if (!data || typeof data !== "object") {
      return;
    }
    for (const [key, value] of Object.entries(data)) {
      this.data[key] = value;
    }
  }

  setPassword(password: string): void {
    this.password = password;
    this.data.password = password;
  }

  validatePassword(password: string): boolean {
    return this.password !== undefined && this.password === password;
  }

  /** The record as it was last read from (or written to) the store */
  originalCopy(): RecordModel {
    return new RecordModel(this.owner, { ...this.original });
  }

  /**
   * Deep, independent copy. `owner` rebinds the copy to another Collection
   * instance (what a transaction clone needs); everything the getters cannot
   * reach — the pre-modification `original` and the password `setPassword()`
   * stored — is carried over, so a copy behaves like the record it came from.
   */
  clone(owner: Collection = this.owner): RecordModel {
    const copy = new RecordModel(owner, structuredClone(this.data));
    copy.original = structuredClone(this.original);
    copy.password = this.password;
    return copy;
  }

  /** Plain object, the shape `publicExport()` returns in the JSVM */
  publicExport(): Record<string, unknown> {
    return { ...this.data };
  }

  /** Every stored value, including system columns */
  export(): Record<string, unknown> {
    return { ...this.data };
  }

  /** Called by the store once a save has committed */
  markPersisted(): void {
    this.original = { ...this.data };
  }

  /** Fields the record carries that the collection does not declare */
  undeclaredFields(): string[] {
    const declared = new Set<string>(SYSTEM_RECORD_FIELDS);
    for (const field of this.owner.fields) {
      if (typeof field.name === "string") {
        declared.add(field.name);
      }
    }
    return Object.keys(this.data).filter((key) => !declared.has(key));
  }
}

/**
 * Rows, keyed by collection id then record id. Insertion order is preserved
 * so unsorted queries come back the way they went in.
 */
export class RecordStore {
  private byCollection = new Map<string, Map<string, RecordModel>>();

  save(record: RecordModel): RecordModel {
    if (record.id === "") {
      record.id = generateRecordId();
    }
    const collection = record.collection();
    const rows = this.rowsFor(collection.id);
    rows.set(record.id, record);
    record.markPersisted();
    return record;
  }

  delete(record: RecordModel): boolean {
    return this.rowsFor(record.collection().id).delete(record.id);
  }

  deleteById(collectionId: string, recordId: string): boolean {
    return this.rowsFor(collectionId).delete(recordId);
  }

  getById(collectionId: string, recordId: string): RecordModel | undefined {
    return this.rowsFor(collectionId).get(recordId);
  }

  list(collectionId: string): RecordModel[] {
    return [...this.rowsFor(collectionId).values()];
  }

  count(collectionId: string): number {
    return this.rowsFor(collectionId).size;
  }

  /** Drops every row of a collection (what deleting the collection does) */
  dropCollection(collectionId: string): void {
    this.byCollection.delete(collectionId);
  }

  /** Every collection id that currently holds at least one record */
  collectionIds(): string[] {
    return [...this.byCollection.keys()].filter((id) => this.byCollection.get(id)!.size > 0);
  }

  /**
   * Deep copy. Records are rebound to the collections in `collections` so a
   * cloned record's `collection()` points at the cloned schema, not the one
   * the transaction started from.
   */
  clone(resolveCollection: (id: string) => Collection | undefined): RecordStore {
    const copy = new RecordStore();
    for (const [collectionId, rows] of this.byCollection.entries()) {
      const collection = resolveCollection(collectionId);
      if (!collection) {
        // The collection was dropped in this transaction; its rows go with it
        continue;
      }
      const copiedRows = new Map<string, RecordModel>();
      for (const [recordId, record] of rows.entries()) {
        copiedRows.set(recordId, record.clone(collection));
      }
      copy.byCollection.set(collectionId, copiedRows);
    }
    return copy;
  }

  /** Commit: adopt another store's rows */
  replaceWith(other: RecordStore): void {
    this.byCollection = new Map(other.byCollection);
  }

  private rowsFor(collectionId: string): Map<string, RecordModel> {
    let rows = this.byCollection.get(collectionId);
    if (!rows) {
      rows = new Map();
      this.byCollection.set(collectionId, rows);
    }
    return rows;
  }
}
