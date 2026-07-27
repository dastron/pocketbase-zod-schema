/**
 * CollectionStore — the in-memory database state migrations execute against
 *
 * Keyed by collection id (migrations reference collections by id, name, or
 * the `_pb_users_auth_` alias; renames must not orphan entries). Cloning
 * serializes to plain objects and rebuilds, giving transaction semantics:
 * the runner clones, applies a migration to the clone, and commits with
 * replaceWith() only on success.
 */

import { rawCollectionsToSnapshot } from "../pocketbase-converter";
import type { SchemaSnapshot } from "../types";
import { Collection } from "./collection";
import type { RawCollection } from "./types";

/** PocketBase's fixed id for the default users auth collection */
const USERS_AUTH_ID = "_pb_users_auth_";

export class CollectionStore {
  private byId = new Map<string, Collection>();

  list(): Collection[] {
    return [...this.byId.values()];
  }

  getById(id: string): Collection | undefined {
    return this.byId.get(id);
  }

  getByNameOrId(nameOrId: string): Collection | undefined {
    const byId = this.byId.get(nameOrId);
    if (byId) {
      return byId;
    }
    for (const collection of this.byId.values()) {
      if (collection.name === nameOrId) {
        return collection;
      }
    }
    // The users auth collection is addressable by its fixed system id even
    // when a snapshot stored it under a different id, and vice versa
    if (nameOrId === USERS_AUTH_ID) {
      return this.getByNameOrId("users");
    }
    return undefined;
  }

  upsert(collection: Collection): void {
    this.byId.set(collection.id, collection);
  }

  removeById(id: string): boolean {
    return this.byId.delete(id);
  }

  /** Deep, independent copy (rebuilds Collection/FieldsList instances) */
  clone(): CollectionStore {
    const copy = new CollectionStore();
    for (const collection of this.byId.values()) {
      copy.upsert(new Collection(structuredClone(collection.serialize())));
    }
    return copy;
  }

  /** Commit: adopt another store's state */
  replaceWith(other: CollectionStore): void {
    this.byId = new Map(other.byId);
  }

  serialize(): RawCollection[] {
    return this.list().map((collection) => collection.serialize());
  }

  /** Convert to the internal schema model used by diff/compare */
  toSnapshot(): SchemaSnapshot {
    return rawCollectionsToSnapshot(this.serialize());
  }
}
