/**
 * Reads migrations by executing them
 *
 * For tests that need to know what a migration *does*. Migrations are read the
 * way PocketBase reads them — by running `up()` in the simulated JSVM — so
 * these helpers report the *state* a migration produces, plus a before/after
 * diff of the store for the tests asserting "this migration created a
 * collection" or "this migration changed these fields".
 *
 * A state diff describes what the migration actually does rather than how it
 * happens to be written, which is the whole point: a loop, a helper function,
 * or a computed collection name is invisible to anything reading the text.
 *
 * To assert on the literal syntax the generator emitted instead, use
 * `migration-parser.ts`.
 */

import * as fs from "fs";
import { Collection } from "../../engine/collection";
import { executeMigrationSource } from "../../engine/runner";
import { CollectionStore } from "../../engine/store";
import type { EngineOptions, EngineWarning, RawCollection } from "../../engine/types";
import { rawCollectionsToSnapshot } from "../../pocketbase-converter";
import type { CollectionSchema, SchemaSnapshot } from "../../types";

export interface ExecuteOptions extends EngineOptions {
  /** Collections that already exist when the migration runs */
  baseline?: RawCollection[];
  /** Migration sources executed first, to build up prior state */
  baselineSources?: string[];
  /** Migration files executed first, to build up prior state */
  baselineFiles?: string[];
}

/** What executing one or more migrations produced */
export interface ExecutedMigrations {
  /** Full state after execution */
  snapshot: SchemaSnapshot;
  /** The store, for further execution or raw inspection */
  store: CollectionStore;
  /** Collections that did not exist beforehand */
  created: CollectionSchema[];
  /** Collections that existed beforehand and changed */
  updated: CollectionSchema[];
  /** Names of collections that existed beforehand and are now gone */
  deleted: string[];
  /** Stubbed-API and console warnings recorded while executing */
  warnings: EngineWarning[];
}

/** Builds the store a migration under test starts from. */
export function createBaselineStore(options: ExecuteOptions = {}): CollectionStore {
  const store = new CollectionStore();

  for (const raw of options.baseline ?? []) {
    store.upsert(new Collection(structuredClone(raw)));
  }

  for (const file of options.baselineFiles ?? []) {
    executeMigrationSource(fs.readFileSync(file, "utf-8"), store, { ...options, filename: file });
  }

  for (const source of options.baselineSources ?? []) {
    executeMigrationSource(source, store, options);
  }

  return store;
}

/**
 * Executes migration sources in order and reports the state they produce.
 *
 * Throws when a migration cannot be executed — a migration the engine refuses
 * to run is a real defect, and swallowing it would turn that defect into a
 * passing test asserting against empty state.
 */
export function executeMigrationSources(sources: string[], options: ExecuteOptions = {}): ExecutedMigrations {
  const store = createBaselineStore(options);
  const before = fingerprint(store);
  const warnings: EngineWarning[] = [];

  for (const source of sources) {
    warnings.push(...executeMigrationSource(source, store, options).warnings);
  }

  return { ...diffAgainst(before, store), store, warnings };
}

/** File-path counterpart of {@link executeMigrationSources}. */
export function executeMigrationFiles(files: string[], options: ExecuteOptions = {}): ExecutedMigrations {
  const store = createBaselineStore(options);
  const before = fingerprint(store);
  const warnings: EngineWarning[] = [];

  for (const file of files) {
    const source = fs.readFileSync(file, "utf-8");
    warnings.push(...executeMigrationSource(source, store, { ...options, filename: file }).warnings);
  }

  return { ...diffAgainst(before, store), store, warnings };
}

/** The state a set of migration files reconstructs, with nothing else reported. */
export function snapshotFromMigrationFiles(files: string[], options: ExecuteOptions = {}): SchemaSnapshot {
  return executeMigrationFiles(files, options).snapshot;
}

/** The state a set of migration sources reconstructs. */
export function snapshotFromMigrationSources(sources: string[], options: ExecuteOptions = {}): SchemaSnapshot {
  return executeMigrationSources(sources, options).snapshot;
}

/**
 * Looks a collection up in a snapshot, failing loudly when it is absent.
 * Keeps tests from asserting against `undefined` and passing by accident.
 */
export function requireCollection(snapshot: SchemaSnapshot, name: string): CollectionSchema {
  const collection = snapshot.collections.get(name);
  if (!collection) {
    throw new Error(`Collection "${name}" not found. Present: ${[...snapshot.collections.keys()].join(", ") || "none"}`);
  }
  return collection;
}

/** Serialized state per collection id, for detecting what a migration touched */
function fingerprint(store: CollectionStore): Map<string, { name: string; state: string }> {
  return new Map(
    store.list().map((collection) => [collection.id, { name: collection.name, state: JSON.stringify(collection.serialize()) }])
  );
}

function diffAgainst(
  before: Map<string, { name: string; state: string }>,
  store: CollectionStore
): Pick<ExecutedMigrations, "snapshot" | "created" | "updated" | "deleted"> {
  const created: RawCollection[] = [];
  const updated: RawCollection[] = [];
  const seen = new Set<string>();

  for (const collection of store.list()) {
    seen.add(collection.id);
    const raw = collection.serialize();
    const previous = before.get(collection.id);
    if (!previous) {
      created.push(raw);
    } else if (previous.state !== JSON.stringify(raw)) {
      updated.push(raw);
    }
  }

  return {
    snapshot: store.toSnapshot(),
    created: [...rawCollectionsToSnapshot(created).collections.values()],
    updated: [...rawCollectionsToSnapshot(updated).collections.values()],
    deleted: [...before.entries()].filter(([id]) => !seen.has(id)).map(([, previous]) => previous.name),
  };
}
