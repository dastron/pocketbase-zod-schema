/**
 * Real Apply Verifier — the oracle stage
 *
 * Applies migration files with a real PocketBase binary, reads the resulting
 * collections back through the admin REST API, and diffs that against the
 * state the execution engine simulates for the same files.
 *
 * One run answers two questions:
 *  - do the generated migrations apply cleanly to real PocketBase?
 *  - does the engine's simulation match what PocketBase actually stores?
 *
 * A divergence in either direction is a real defect — in the generator or in
 * the engine — not a formatting difference, which is why this is the
 * strongest signal the e2e suite has.
 *
 * The simulation is seeded from a *real* freshly-initialized instance
 * (system collections plus the default `users`), so both sides start from
 * identical state and a migration that touches `users` is compared against
 * the real thing rather than a stub.
 */

import { execFile } from 'child_process';
import { copyFile } from 'fs/promises';
import { basename, join } from 'path';
import { promisify } from 'util';

import {
  Collection,
  CollectionStore,
  executeMigrationFile,
  type RawCollection,
} from '../../../package/src/migration/engine/index.js';
import { rawCollectionsToSnapshot } from '../../../package/src/migration/pocketbase-converter.js';
import { logger } from '../utils/test-helpers.js';
import { adminUrlForPort, authenticateSuperuser, fetchCollections } from './pb-admin-api.js';
import { alignOptionDefaults, describeDiff, diffStates, scopeSnapshot, scoreDiff } from './state-diff.js';
import {
  createWorkspaceManager,
  type TestWorkspace,
  type WorkspaceManager,
} from './workspace-manager.js';

const execFileAsync = promisify(execFile);

/** `pocketbase migrate up` over a handful of files is fast; DB init dominates */
const MIGRATE_TIMEOUT = 60000;

/** Penalty for a collection the migration deleted that PocketBase still has */
const LEFTOVER_COLLECTION_PENALTY = 30;

export interface RealApplyOptions {
  /**
   * Files applied — and simulated — before the files under test. The
   * comparison scope is computed after these, so a baseline collection the
   * files under test never touch is left out of the diff.
   */
  baselineFiles?: string[];
}

/** What real PocketBase did with the files */
export interface RealApplyOutcome {
  /** Every file was reported "Applied" and none reported an error */
  applied: boolean;
  /** Basenames PocketBase reported as applied */
  appliedFiles: string[];
  /**
   * Per-file apply failures. `pocketbase migrate up` exits 0 even when a
   * migration fails, so these are parsed out of its output rather than
   * inferred from the exit code.
   */
  applyFailures: { file: string; error: string }[];
  /** Combined stdout/stderr of `pocketbase migrate up` */
  output: string;
  /** Non-system collections read back from GET /api/collections */
  collections: RawCollection[];
}

export interface RealApplyComparison extends RealApplyOutcome {
  /** True when every file applied and the real state matches the simulation */
  equivalent: boolean;
  /** 0-100; 100 = real PocketBase state identical to the engine's simulation */
  realApplyScore: number;
  /** Human-readable state differences (real PocketBase vs engine) */
  differences: string[];
  /** Collections the files created, modified, or deleted — the comparison scope */
  comparedCollections: string[];
  /** Engine execution failures for the same files */
  simulationErrors: { file: string; error: string }[];
}

export interface RealApplyVerifier {
  applyMigrations(files: string[], options?: RealApplyOptions): Promise<RealApplyOutcome>;
  applyAndCompare(files: string[], options?: RealApplyOptions): Promise<RealApplyComparison>;
  /** Collections a freshly-initialized PocketBase starts with (cached) */
  getBaselineCollections(): Promise<RawCollection[]>;
}

/** The engine's view of what the files under test do */
export interface SimulatedApply {
  store: CollectionStore;
  /** Collections the files created or modified */
  touched: string[];
  /** Collections the files deleted */
  deleted: string[];
  errors: { file: string; error: string }[];
}

/** Result of diffing a real database against the engine's simulation */
export interface StateComparison {
  equivalent: boolean;
  score: number;
  differences: string[];
}

interface WorkspaceRun {
  /** Combined output of `pocketbase migrate up` */
  output: string;
  appliedFiles: string[];
  failures: { file: string; error: string }[];
  /** Non-system collections after the run; empty when a migration failed */
  collections: RawCollection[];
}

/** PocketBase applies migrations in filename order; both sides must agree */
function inApplyOrder(files: string[]): string[] {
  return [...files].sort((a, b) => basename(a).localeCompare(basename(b)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Serialized state per collection, for detecting what a migration touched */
function fingerprint(store: CollectionStore): Map<string, string> {
  return new Map(store.list().map((collection) => [collection.name, JSON.stringify(collection.serialize())]));
}

/**
 * Parse `pocketbase migrate up` output.
 *
 * Success lines read `Applied 1769385981_created_Projects.js`; failures read
 * `Error: failed to apply migration <file>: <reason>` — and the command
 * still exits 0, so its output is the only signal.
 */
export function parseMigrateOutput(output: string): {
  appliedFiles: string[];
  failures: { file: string; error: string }[];
} {
  const appliedFiles: string[] = [];
  const failures: { file: string; error: string }[] = [];

  for (const line of output.split('\n')) {
    const applied = line.match(/^Applied\s+(\S+)/);
    if (applied) {
      appliedFiles.push(applied[1]);
      continue;
    }

    const failed = line.match(/failed to apply migration\s+([^\s:]+):\s*(.*)$/);
    if (failed) {
      failures.push({ file: failed[1], error: failed[2].trim() });
    }
  }

  return { appliedFiles, failures };
}

/**
 * Replay files through the engine from the same baseline real PocketBase
 * starts from, recording which collections they touched — the scope the two
 * states are compared over.
 */
export function simulateApply(
  baseline: RawCollection[],
  files: string[],
  options: RealApplyOptions = {}
): SimulatedApply {
  const store = new CollectionStore();
  const errors: { file: string; error: string }[] = [];

  for (const raw of baseline) {
    store.upsert(new Collection(structuredClone(raw)));
  }

  const execute = (file: string) => {
    try {
      executeMigrationFile(file, store);
    } catch (error) {
      errors.push({ file, error: errorMessage(error) });
    }
  };

  inApplyOrder(options.baselineFiles ?? []).forEach(execute);
  const before = fingerprint(store);

  inApplyOrder(files).forEach(execute);
  const after = fingerprint(store);

  return {
    store,
    touched: [...after.keys()].filter((name) => after.get(name) !== before.get(name)),
    deleted: [...before.keys()].filter((name) => !after.has(name)),
    errors,
  };
}

/**
 * Diff the collections a real PocketBase ended up with against the state the
 * engine simulated, over the collections the migrations actually touched.
 */
export function compareRealState(realCollections: RawCollection[], simulated: SimulatedApply): StateComparison {
  const scope = simulated.touched;
  const [real, simulation] = alignOptionDefaults(
    scopeSnapshot(rawCollectionsToSnapshot(realCollections), scope),
    scopeSnapshot(simulated.store.toSnapshot(), scope)
  );

  const diff = diffStates(real, simulation);
  const differences = describeDiff(diff, { current: 'real PocketBase', previous: 'engine' });

  // Deletions never show up in that diff: neither state has the collection
  const leftovers = simulated.deleted.filter((name) =>
    realCollections.some((collection) => collection.name === name)
  );
  for (const name of leftovers) {
    differences.push(`collection "${name}" was deleted by the migration but still exists in real PocketBase`);
  }

  return {
    equivalent: differences.length === 0,
    score: Math.max(0, scoreDiff(diff) - leftovers.length * LEFTOVER_COLLECTION_PENALTY),
    differences,
  };
}

class RealApplyVerifierImpl implements RealApplyVerifier {
  private readonly workspaceManager: WorkspaceManager;
  private baselineCollections: RawCollection[] | null = null;

  constructor(workspaceManager?: WorkspaceManager) {
    this.workspaceManager = workspaceManager || createWorkspaceManager();
  }

  async getBaselineCollections(): Promise<RawCollection[]> {
    if (!this.baselineCollections) {
      logger.debug('Capturing the baseline collections of a fresh PocketBase instance');
      const run = await this.runWorkspace([]);
      this.baselineCollections = run.collections;
    }

    return this.baselineCollections;
  }

  async applyMigrations(files: string[], options: RealApplyOptions = {}): Promise<RealApplyOutcome> {
    const ordered = inApplyOrder([...(options.baselineFiles ?? []), ...files]);
    const run = await this.runWorkspace(ordered);
    const failures = [...run.failures];

    // A file PocketBase silently skipped is as broken as one that errored
    for (const file of ordered) {
      const name = basename(file);
      if (!run.appliedFiles.includes(name) && !failures.some((failure) => failure.file === name)) {
        failures.push({ file: name, error: 'PocketBase did not report the migration as applied' });
      }
    }

    return {
      applied: failures.length === 0,
      appliedFiles: run.appliedFiles,
      applyFailures: failures,
      output: run.output,
      collections: run.collections,
    };
  }

  async applyAndCompare(files: string[], options: RealApplyOptions = {}): Promise<RealApplyComparison> {
    const baseline = await this.getBaselineCollections();
    const outcome = await this.applyMigrations(files, options);
    const simulated = simulateApply(baseline, files, options);

    const blockers = [
      ...outcome.applyFailures.map((failure) => `real apply failed for ${failure.file}: ${failure.error}`),
      ...simulated.errors.map((failure) => `engine execution failed for ${basename(failure.file)}: ${failure.error}`),
    ];

    // With either side incomplete the state diff is noise, not signal
    const comparison: StateComparison =
      blockers.length > 0
        ? { equivalent: false, score: 0, differences: blockers }
        : compareRealState(outcome.collections, simulated);

    return {
      ...outcome,
      equivalent: comparison.equivalent,
      realApplyScore: comparison.score,
      differences: comparison.differences,
      comparedCollections: simulated.touched,
      simulationErrors: simulated.errors,
    };
  }

  /**
   * Create a workspace, apply the given files with the real binary, and read
   * the resulting non-system collections back over the REST API.
   */
  private async runWorkspace(files: string[]): Promise<WorkspaceRun> {
    const workspace = await this.workspaceManager.createWorkspace();

    try {
      for (const file of files) {
        await copyFile(file, join(workspace.migrationDir, basename(file)));
      }

      const output = await this.migrateUp(workspace);
      const { appliedFiles, failures } = parseMigrateOutput(output);

      // A failed migration stays pending, so `serve` would retry it and exit;
      // there is no state worth reading back either way
      if (failures.length > 0) {
        logger.warn(
          `Skipping state capture for workspace ${workspace.workspaceId}: ${failures.length} migration(s) failed to apply`
        );
        return { output, appliedFiles, failures, collections: [] };
      }

      await this.workspaceManager.createSuperuserBeforeStart(workspace);
      await this.workspaceManager.startPocketBase(workspace);

      const adminUrl = adminUrlForPort(workspace.pocketbasePort);
      const token = await authenticateSuperuser(adminUrl);
      const collections = await fetchCollections(adminUrl, token);

      return {
        output,
        appliedFiles,
        failures,
        collections: collections.filter((collection) => collection.system !== true),
      };
    } finally {
      await this.workspaceManager.stopPocketBase(workspace);
      await this.workspaceManager.cleanupWorkspace(workspace);
    }
  }

  /** Run `pocketbase migrate up`, returning its combined output */
  private async migrateUp(workspace: TestWorkspace): Promise<string> {
    const args = ['migrate', 'up', '--dir', workspace.dataDir];

    try {
      const { stdout, stderr } = await execFileAsync(workspace.pocketbasePath, args, {
        cwd: workspace.workspaceDir,
        timeout: MIGRATE_TIMEOUT,
        maxBuffer: 32 * 1024 * 1024,
      });
      return `${stdout}\n${stderr}`;
    } catch (error: any) {
      // A non-zero exit still carries the output naming the file that failed
      const output = `${error?.stdout ?? ''}\n${error?.stderr ?? ''}`;
      if (!output.trim()) {
        throw error;
      }
      logger.warn(`pocketbase migrate up exited non-zero for workspace ${workspace.workspaceId}`);
      return output;
    }
  }
}

export function createRealApplyVerifier(workspaceManager?: WorkspaceManager): RealApplyVerifier {
  return new RealApplyVerifierImpl(workspaceManager);
}
