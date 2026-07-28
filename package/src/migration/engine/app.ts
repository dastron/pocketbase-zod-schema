/**
 * SimulatedApp — the `app` handed to a migration's up() function
 *
 * Implements the schema-level surface of PocketBase's transactional app
 * (findCollectionByNameOrId / save / delete / importCollections). Everything
 * else — record and query APIs like findRecordById, db(), etc. — is handled
 * by a strictness-controlled Proxy: lenient mode records a warning and
 * returns an inert no-op value so schema-only replay of hand-written data
 * migrations still succeeds; strict mode throws.
 *
 * With `records: "simulate"` those data-layer methods are real instead
 * (see `data-api.ts`), backed by the in-memory record store.
 */

import { Collection, ensureAuthSystemFields } from "./collection";
import { createDataApi } from "./data-api";
import { generateRuntimeFieldId } from "./fields";
import { RecordModel } from "./records";
import type { CollectionStore } from "./store";
import type { EngineOptions, EngineWarning, RawCollection } from "./types";

export interface WarningSink {
  (warning: EngineWarning): void;
}

/** Identifies the values `createInertStub` returns, which pretend to be anything */
const INERT_STUB = Symbol.for("pocketbase-zod-schema.inertStub");

export function isInertStub(value: unknown): boolean {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return false;
  }
  return (value as Record<symbol, unknown>)[INERT_STUB] === true;
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
      if (prop === INERT_STUB) {
        return true;
      }
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
  constructor(
    private store: CollectionStore,
    private options: EngineOptions,
    private warn: WarningSink
  ) {}

  findCollectionByNameOrId(nameOrId: string): Collection {
    const collection = this.store.getByNameOrId(nameOrId);
    if (!collection) {
      // Matches the error PocketBase surfaces for a missing collection
      throw new Error(`sql: no rows in result set (collection "${nameOrId}" not found)`);
    }
    return collection;
  }

  save(model: any): void {
    // A record only reaches here with record simulation on; without it
    // `new Record()` produced an inert stub, handled below
    if (model instanceof RecordModel) {
      this.store.records.save(model);
      return;
    }
    if (this.skipInertModel(model, "save")) {
      return;
    }

    const collection = this.toCollection(model);
    if (!collection.name) {
      throw new Error("[engine] cannot save a collection without a name");
    }
    // PocketBase restores missing auth system fields as part of the save
    ensureAuthSystemFields(collection);
    for (const field of collection.fields) {
      if (typeof field.id !== "string" || field.id === "") {
        field.id = generateRuntimeFieldId(typeof field.type === "string" ? field.type : "");
      }
    }
    this.store.upsert(collection);
  }

  delete(model: any): void {
    if (model instanceof RecordModel) {
      this.store.records.delete(model);
      return;
    }
    if (this.skipInertModel(model, "delete")) {
      return;
    }
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
   * `app.save(record)` in a data migration hands us whatever `new Record()`
   * produced. Without record simulation that is an inert stub, and treating
   * it as a collection would fail the whole replay over rows nobody is
   * tracking — so the call is reported and skipped, like every other
   * unsimulated data operation.
   */
  private skipInertModel(model: unknown, operation: string): boolean {
    if (!isInertStub(model)) {
      return false;
    }
    if (this.options.strictness === "strict") {
      throw new Error(`[engine] app.${operation}() received an unsimulated model (strict mode)`);
    }
    this.warn({
      kind: "unsupported-api",
      api: `app.${operation}`,
      message:
        `app.${operation}() was called with an unsimulated model; the call was a no-op. ` +
        `Set records: "simulate" to execute record operations.`,
    });
    return true;
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
      ensureAuthSystemFields(collection);
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

/**
 * The data-layer surface installed alongside the app when record simulation
 * is on, so the sandbox can expose the same `Record` and `$dbx` objects the
 * app's finders return.
 */
export interface SimulatedAppBundle {
  app: SimulatedApp;
  /** Null when records are not simulated */
  data: ReturnType<typeof createDataApi> | null;
}

export function createSimulatedAppBundle(
  store: CollectionStore,
  options: EngineOptions,
  warn: WarningSink
): SimulatedAppBundle {
  const impl = new SimulatedAppImpl(store, options, warn);
  const data = options.records === "simulate" ? createDataApi(store, options, warn) : null;

  const app = new Proxy(impl, {
    get(target, prop, receiver) {
      if (prop in target || typeof prop === "symbol") {
        return Reflect.get(target, prop, receiver);
      }
      const name = String(prop);
      if (data && name in data.methods) {
        return data.methods[name];
      }
      return createInertStub(`app.${name}`, options, warn);
    },
  }) as SimulatedApp;

  data?.bindApp(app);

  return { app, data };
}

export function createSimulatedApp(store: CollectionStore, options: EngineOptions, warn: WarningSink): SimulatedApp {
  return createSimulatedAppBundle(store, options, warn).app;
}
