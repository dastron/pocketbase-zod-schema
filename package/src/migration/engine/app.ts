/**
 * SimulatedApp — the `app` handed to a migration's up() function
 *
 * Implements the schema-level surface of PocketBase's transactional app
 * (findCollectionByNameOrId / save / delete / importCollections). Everything
 * else — record and query APIs like findRecordById, db(), etc. — is handled
 * by a strictness-controlled Proxy: lenient mode records a warning and
 * returns an inert no-op value so schema-only replay of hand-written data
 * migrations still succeeds; strict mode throws.
 */

import { Collection } from "./collection";
import { generateRuntimeFieldId } from "./fields";
import type { CollectionStore } from "./store";
import type { EngineOptions, EngineWarning, RawCollection } from "./types";

export interface WarningSink {
  (warning: EngineWarning): void;
}

/**
 * A callable, chainable, inert value returned by lenient stubs so chains
 * like `app.db().newQuery("...").execute()` don't crash. Every call and
 * property access returns the stub itself; primitive coercion yields
 * neutral values.
 */
export function createInertStub(name: string, options: EngineOptions, warn: WarningSink): any {
  // Must be a full function (not an arrow) so the Proxy construct trap can
  // service `new Record()`-style calls
  const target = function inertStubTarget() {
    return undefined;
  };
  const stub: any = new Proxy(target, {
    get(_target, prop) {
      if (prop === Symbol.toPrimitive) {
        return () => "";
      }
      if (prop === "toString") {
        return () => "";
      }
      if (prop === "valueOf") {
        return () => 0;
      }
      // Not a thenable — await/then chains must not treat this as a promise
      if (prop === "then") {
        return undefined;
      }
      if (typeof prop === "symbol") {
        return undefined;
      }
      return createInertStub(`${name}.${prop}`, options, warn);
    },
    apply() {
      if (options.strictness === "strict") {
        throw new Error(`[engine] ${name}() is not supported by the migration simulation engine (strict mode)`);
      }
      warn({
        kind: "unsupported-api",
        api: name,
        message: `${name}() is not simulated; call was a no-op`,
      });
      return stub;
    },
    construct() {
      if (options.strictness === "strict") {
        throw new Error(`[engine] new ${name}() is not supported by the migration simulation engine (strict mode)`);
      }
      warn({
        kind: "unsupported-api",
        api: name,
        message: `new ${name}() is not simulated; result is inert`,
      });
      return stub;
    },
  });
  return stub;
}

class SimulatedAppImpl {
  constructor(private store: CollectionStore) {}

  findCollectionByNameOrId(nameOrId: string): Collection {
    const collection = this.store.getByNameOrId(nameOrId);
    if (!collection) {
      // Matches the error PocketBase surfaces for a missing collection
      throw new Error(`sql: no rows in result set (collection "${nameOrId}" not found)`);
    }
    return collection;
  }

  save(model: any): void {
    const collection = this.toCollection(model);
    if (!collection.name) {
      throw new Error("[engine] cannot save a collection without a name");
    }
    for (const field of collection.fields) {
      if (typeof field.id !== "string" || field.id === "") {
        field.id = generateRuntimeFieldId(typeof field.type === "string" ? field.type : "");
      }
    }
    this.store.upsert(collection);
  }

  delete(model: any): void {
    if (model instanceof Collection) {
      this.store.removeById(model.id);
      return;
    }
    if (typeof model === "string") {
      const collection = this.store.getByNameOrId(model);
      if (collection) {
        this.store.removeById(collection.id);
      }
      return;
    }
    if (model && typeof model.id === "string") {
      this.store.removeById(model.id);
    }
  }

  /**
   * What native snapshot migrations call:
   * `return app.importCollections(snapshot, deleteMissing)`
   */
  importCollections(rawCollections: RawCollection[], deleteMissing = false): void {
    if (!Array.isArray(rawCollections)) {
      throw new Error("[engine] importCollections expects an array of collections");
    }
    const imported = new Set<string>();
    for (const raw of rawCollections) {
      const collection = this.toCollection(raw);
      this.store.upsert(collection);
      imported.add(collection.id);
    }
    if (deleteMissing) {
      for (const existing of this.store.list()) {
        if (!imported.has(existing.id)) {
          this.store.removeById(existing.id);
        }
      }
    }
  }

  private toCollection(model: any): Collection {
    if (model instanceof Collection) {
      return model;
    }
    if (model && typeof model === "object") {
      return new Collection(model);
    }
    throw new Error("[engine] expected a collection object");
  }
}

export type SimulatedApp = SimulatedAppImpl;

export function createSimulatedApp(store: CollectionStore, options: EngineOptions, warn: WarningSink): SimulatedApp {
  const impl = new SimulatedAppImpl(store);
  return new Proxy(impl, {
    get(target, prop, receiver) {
      if (prop in target || typeof prop === "symbol") {
        return Reflect.get(target, prop, receiver);
      }
      return createInertStub(`app.${String(prop)}`, options, warn);
    },
  }) as SimulatedApp;
}
