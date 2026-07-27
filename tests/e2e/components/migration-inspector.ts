/**
 * Migration Inspector — reads a migration file by executing it
 *
 * Both e2e migration sources (PocketBase's own captured migrations and the
 * library's generated ones) used to be read with a hand-rolled brace scanner
 * that pulled `new Collection({...})` literals out of the file text. That only
 * ever worked for create-shaped migrations: an update migration that reaches
 * for `app.findCollectionByNameOrId(...)` and mutates it declares no literal,
 * and anything computed (a loop over field definitions, a helper function, a
 * variable holding the collection name) is invisible to a scanner.
 *
 * This module executes the file through the migration engine instead and reads
 * the resulting collections out of the store, so what the comparison sees is
 * the state the migration actually produces — the same thing PocketBase would
 * end up with.
 *
 * The reported collections are the ones the file *touched*: the store is
 * fingerprinted before and after `up()`, so pre-existing baseline collections
 * the migration never mentions stay out of the comparison.
 */

import { readFile } from 'fs/promises';
import { basename } from 'path';

import {
  Collection,
  CollectionStore,
  executeMigrationSource,
  replayMigrations,
  type EngineWarning,
  type RawCollection,
} from '../../../package/src/migration/engine/index.js';
import type { CollectionRules } from '../fixtures/test-scenarios.js';

export interface ParsedField {
  id: string;
  name: string;
  type: string;
  required: boolean;
  unique: boolean;
  options: Record<string, any>;
  relation?: {
    collectionId: string;
    cascadeDelete: boolean;
    maxSelect: number;
    minSelect: number | null;
    displayFields: string[] | null;
  };
}

export interface ParsedCollection {
  id: string;
  name: string;
  type: 'base' | 'auth' | 'view';
  system: boolean;
  fields: ParsedField[];
  indexes: string[];
  rules: CollectionRules;
}

/** What the comparison stages consume */
export interface ParsedMigration {
  filename: string;
  /** Raw `up` closure text — input to the legacy text-similarity metric only */
  upFunction: string;
  /** Raw `down` closure text — input to the legacy text-similarity metric only */
  downFunction: string;
  /** Collections the migration created or modified */
  collections: ParsedCollection[];
}

/** Everything executing the file revealed, beyond the comparison inputs */
export interface InspectedMigration extends ParsedMigration {
  /** Names of collections the migration deleted */
  deletedCollections: string[];
  /** Stubbed-API and console warnings recorded while executing */
  warnings: EngineWarning[];
}

export interface InspectOptions {
  /**
   * Collections that already exist when the file runs. Defaults to the
   * minimal `users` auth collection every real PocketBase instance has.
   */
  baseline?: RawCollection[];
  /** Migration files executed before this one, to build up prior state */
  baselineFiles?: string[];
}

/** PocketBase's fixed id for the default users auth collection */
const USERS_AUTH_ID = '_pb_users_auth_';

const RULE_KEYS = [
  'listRule',
  'viewRule',
  'createRule',
  'updateRule',
  'deleteRule',
  'manageRule',
] as const;

/**
 * The state a migration under test starts from.
 *
 * Every real PocketBase instance has a `users` auth collection, and migrations
 * routinely reference it — by name or by the `_pb_users_auth_` id — so a store
 * without one makes `findCollectionByNameOrId` throw on migrations that are
 * perfectly valid against a real instance.
 */
export function createBaselineStore(options: InspectOptions = {}): CollectionStore {
  const store =
    options.baselineFiles && options.baselineFiles.length > 0
      ? replayMigrations(options.baselineFiles).store
      : new CollectionStore();

  for (const raw of options.baseline ?? []) {
    store.upsert(new Collection(structuredClone(raw)));
  }

  if (!store.getByNameOrId('users')) {
    store.upsert(new Collection({ id: USERS_AUTH_ID, name: 'users', type: 'auth', fields: [] }));
  }

  return store;
}

/**
 * Execute a migration file and report the collections it produced.
 *
 * Throws when the file cannot be executed — a migration the engine refuses to
 * run is a real defect, and silently returning an empty collection list is how
 * the old scanner turned those into passing comparisons.
 */
export async function inspectMigrationFile(
  filePath: string,
  options: InspectOptions = {}
): Promise<InspectedMigration> {
  const source = await readFile(filePath, 'utf-8');
  return inspectMigrationSource(source, filePath, options);
}

export function inspectMigrationSource(
  source: string,
  filePath: string,
  options: InspectOptions = {}
): InspectedMigration {
  const store = createBaselineStore(options);
  const before = fingerprint(store);

  const result = executeMigrationSource(source, store, { filename: filePath });

  const after = fingerprint(store);
  const touched = store.list().filter((collection) => after.get(collection.name) !== before.get(collection.name));

  return {
    filename: basename(filePath),
    upFunction: extractClosureSource(source, 'up'),
    downFunction: extractClosureSource(source, 'down'),
    collections: touched.map((collection) => toParsedCollection(collection.serialize())),
    deletedCollections: [...before.keys()].filter((name) => !after.has(name)),
    warnings: result.warnings,
  };
}

/** Serialized state per collection name, for detecting what a migration touched */
function fingerprint(store: CollectionStore): Map<string, string> {
  return new Map(store.list().map((collection) => [collection.name, JSON.stringify(collection.serialize())]));
}

function toParsedCollection(raw: RawCollection): ParsedCollection {
  const rules: CollectionRules = {};
  for (const key of RULE_KEYS) {
    rules[key] = raw[key];
  }

  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    system: raw.system === true,
    fields: (raw.fields ?? []).map(toParsedField),
    indexes: raw.indexes ?? [],
    rules,
  };
}

function toParsedField(raw: RawCollection): ParsedField {
  const field: ParsedField = {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    required: !!raw.required,
    unique: !!raw.unique,
    // PocketBase v0.23+ serializes field options flat rather than under an
    // `options` key; kept for the legacy comparison's shape
    options: raw.options ?? {},
  };

  if (raw.type === 'relation') {
    field.relation = {
      collectionId: raw.collectionId,
      cascadeDelete: raw.cascadeDelete ?? false,
      maxSelect: raw.maxSelect ?? 1,
      minSelect: raw.minSelect ?? null,
      displayFields: raw.displayFields ?? null,
    };
  }

  return field;
}

/**
 * Slice a migration's `up`/`down` closure out of the file text.
 *
 * This feeds the legacy Levenshtein text-similarity metric, which is
 * informational only — semantic agreement is measured by executing both
 * migrations (see engine-state-comparator) and by applying one to a real
 * PocketBase (see real-apply-verifier).
 */
function extractClosureSource(source: string, direction: 'up' | 'down'): string {
  const pattern =
    direction === 'up'
      ? /migrate\s*\(\s*\((?:app|db)\)\s*=>\s*\{([\s\S]*?)\}\s*,/
      : /,\s*\((?:app|db)\)\s*=>\s*\{([\s\S]*?)\}\s*\)/;

  return source.match(pattern)?.[0] ?? '';
}
