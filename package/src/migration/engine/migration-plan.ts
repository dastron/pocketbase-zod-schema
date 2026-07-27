/**
 * Replay planning — which migration files reconstruct the current state
 *
 * Without knowledge of PocketBase's `_migrations` table, replay assumes every
 * file on disk has been applied. That is right for the common case and wrong
 * in exactly the situations that matter: a migration written but not yet run,
 * or a file removed from disk after it ran. Both produce a reconstructed state
 * the database was never in, and therefore a wrong diff.
 *
 * Given an applied-migrations list (see `applied-migrations.ts`), this module
 * turns a pb_migrations directory into a plan:
 *
 * - `filesToReplay` — the applied prefix, starting at the newest *applied*
 *   snapshot, which is the checkpoint replay should start from
 * - `pending` — on disk, never applied
 * - `missing` — applied, no longer on disk
 * - `outOfOrder` — pending files whose timestamp sits behind an already
 *   applied one, so they will be applied out of authoring order
 */

import * as fs from "fs";
import * as path from "path";
import type { AppliedMigrationsSource } from "./applied-migrations";
import { appliedMigrationsFromList } from "./applied-migrations";

/**
 * Extracts the timestamp prefix from a migration filename.
 * Migration files are named `[timestamp]_[description].js`.
 *
 * @param filename - Migration filename (basename, not a path)
 * @returns Timestamp as a number, or null when the name is not prefixed
 */
export function extractTimestampFromFilename(filename: string): number | null {
  const match = filename.match(/^(\d+)_/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/** A migration file discovered on disk */
export interface DiscoveredMigration {
  /** Absolute path */
  path: string;
  /** Basename, which is what `_migrations.file` stores */
  name: string;
  timestamp: number;
  /** PocketBase's own `*_collections_snapshot.js` files */
  isSnapshot: boolean;
}

export interface MigrationPlan {
  /** The snapshot the replay starts from, when the directory has one */
  snapshotFile: string | null;
  /** Absolute paths to execute, in timestamp order */
  filesToReplay: string[];
  /** Basenames present on disk but absent from `_migrations` */
  pending: string[];
  /** Basenames recorded in `_migrations` with no file on disk */
  missing: string[];
  /**
   * Basenames from `pending` whose timestamp precedes an already-applied
   * migration. PocketBase will still run them, but after migrations authored
   * later — so the state they produce depends on apply order.
   */
  outOfOrder: string[];
  /** False when no applied list was supplied: every file is assumed applied */
  appliedKnown: boolean;
  /** Where the applied list came from, when there was one */
  appliedOrigin?: string;
  /** Number of JS migrations recorded as applied */
  appliedCount: number;
  /** True when disk and `_migrations` agree exactly */
  inSync: boolean;
}

export interface PlanOptions {
  /**
   * The applied-migrations list. A plain array of filenames is accepted as a
   * shorthand. Omit (or pass null) to assume every file on disk is applied.
   */
  applied?: AppliedMigrationsSource | string[] | null;
}

/**
 * Lists every timestamped `.js` migration in a directory, in timestamp order.
 * Returns an empty list when the directory does not exist.
 */
export function discoverMigrations(migrationsPath: string): DiscoveredMigration[] {
  if (!fs.existsSync(migrationsPath) || !fs.statSync(migrationsPath).isDirectory()) {
    return [];
  }

  const discovered: DiscoveredMigration[] = [];
  for (const name of fs.readdirSync(migrationsPath)) {
    if (!name.endsWith(".js")) {
      continue;
    }
    const timestamp = extractTimestampFromFilename(name);
    if (timestamp === null) {
      continue;
    }
    discovered.push({
      path: path.join(migrationsPath, name),
      name,
      timestamp,
      isSnapshot: name.endsWith("_collections_snapshot.js") || name.endsWith("_snapshot.js"),
    });
  }

  // Ties broken by name so the order is stable across filesystems
  discovered.sort((a, b) => a.timestamp - b.timestamp || a.name.localeCompare(b.name));
  return discovered;
}

/**
 * Builds the replay plan for a migrations directory.
 *
 * Without an applied list this reproduces the directory's default replay
 * window — newest snapshot plus everything after it — so the plan is a
 * drop-in for the previous file selection.
 */
export function planMigrationReplay(migrationsPath: string, options: PlanOptions = {}): MigrationPlan {
  const discovered = discoverMigrations(migrationsPath);
  const applied = normalizeApplied(options.applied);

  if (!applied) {
    const snapshot = lastSnapshot(discovered);
    return {
      snapshotFile: snapshot?.path ?? null,
      filesToReplay: replayWindow(discovered, snapshot).map((migration) => migration.path),
      pending: [],
      missing: [],
      outOfOrder: [],
      appliedKnown: false,
      appliedCount: 0,
      inSync: true,
    };
  }

  const appliedNames = new Set(applied.entries.map((entry) => entry.file));
  const onDisk = new Set(discovered.map((migration) => migration.name));

  // Start from the newest snapshot that was actually applied: a snapshot
  // sitting on disk unapplied is not a checkpoint the database ever reached
  const snapshot = lastSnapshot(discovered.filter((migration) => appliedNames.has(migration.name)));
  const filesToReplay = replayWindow(discovered, snapshot)
    .filter((migration) => appliedNames.has(migration.name))
    .map((migration) => migration.path);

  const pendingMigrations = discovered.filter((migration) => !appliedNames.has(migration.name));
  const missing = applied.entries.filter((entry) => !onDisk.has(entry.file)).map((entry) => entry.file);

  const newestAppliedTimestamp = discovered
    .filter((migration) => appliedNames.has(migration.name))
    .reduce((newest, migration) => Math.max(newest, migration.timestamp), 0);
  const outOfOrder = pendingMigrations
    .filter((migration) => migration.timestamp < newestAppliedTimestamp)
    .map((migration) => migration.name);

  const pending = pendingMigrations.map((migration) => migration.name);

  return {
    snapshotFile: snapshot?.path ?? null,
    filesToReplay,
    pending,
    missing,
    outOfOrder,
    appliedKnown: true,
    appliedOrigin: applied.origin,
    appliedCount: applied.entries.length,
    inSync: pending.length === 0 && missing.length === 0,
  };
}

/**
 * The files a replay executes: the snapshot, then every non-snapshot
 * migration authored after it. Snapshots supersede everything before them,
 * so earlier files are never re-executed.
 */
function replayWindow(discovered: DiscoveredMigration[], snapshot: DiscoveredMigration | null): DiscoveredMigration[] {
  if (!snapshot) {
    return discovered.filter((migration) => !migration.isSnapshot);
  }
  return [
    snapshot,
    ...discovered.filter((migration) => !migration.isSnapshot && migration.timestamp > snapshot.timestamp),
  ];
}

function lastSnapshot(discovered: DiscoveredMigration[]): DiscoveredMigration | null {
  let latest: DiscoveredMigration | null = null;
  for (const migration of discovered) {
    if (migration.isSnapshot) {
      latest = migration;
    }
  }
  return latest;
}

function normalizeApplied(applied: PlanOptions["applied"]): AppliedMigrationsSource | null {
  if (!applied) {
    return null;
  }
  return Array.isArray(applied) ? appliedMigrationsFromList(applied) : applied;
}
