/**
 * Execution engine types
 *
 * The engine executes PocketBase JS migration files in a sandboxed context
 * that emulates the PocketBase JSVM (goja) API surface, instead of statically
 * parsing them. These types describe its configuration and results.
 */

import type { SchemaSnapshot } from "../types";
import type { CollectionStore } from "./store";

/**
 * A PocketBase-shaped plain collection object, as found in migration files
 * and snapshot arrays (the JSON shape PocketBase itself serializes).
 */
export type RawCollection = Record<string, any>;

/**
 * How the engine treats PocketBase APIs it does not simulate
 * ($os, $dbx, Record, data-layer app methods, ...):
 * - "lenient": record a warning and return an inert no-op value
 * - "strict": throw immediately
 */
export type EngineStrictness = "strict" | "lenient";

export interface EngineWarning {
  /** Migration file the warning originated from, when known */
  file?: string;
  kind: "unsupported-api" | "console" | "noop";
  /** The API that was stubbed, e.g. "$os.getenv" or "app.findRecordById" */
  api?: string;
  message: string;
}

export interface EngineOptions {
  /** Defaults to "lenient" */
  strictness?: EngineStrictness;
  /** Invoked for every warning as it happens (warnings are also collected) */
  onWarning?: (warning: EngineWarning) => void;
  /** Per-file evaluation/execution timeout in milliseconds. Defaults to 5000. */
  timeoutMs?: number;
}

/** Which of a migration's two closures was executed */
export type MigrationDirection = "up" | "down";

export interface MigrationExecutionResult {
  file?: string;
  /** Which closure ran. Defaults to "up" for state reconstruction. */
  direction: MigrationDirection;
  /**
   * False when the file registered no closure for this direction — no
   * migrate() call at all, or a migrate(up) with no down.
   */
  applied: boolean;
  warnings: EngineWarning[];
}

export interface ReplayResult {
  /** Final state converted to the internal schema model */
  snapshot: SchemaSnapshot;
  /** The raw store, for further execution or inspection */
  store: CollectionStore;
  warnings: EngineWarning[];
  filesExecuted: string[];
}
