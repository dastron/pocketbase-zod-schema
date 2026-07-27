/**
 * Runner — executes one migration file against a CollectionStore
 *
 * Evaluation happens in a vm context built from the sandbox globals; the
 * file's migrate(up, down) call registers its closures. The requested
 * direction then runs transactionally: the store is cloned, the closure is
 * applied to the clone, and the clone replaces the store only on success.
 * The closure is invoked from inside the context (not host code) so the vm
 * timeout also bounds infinite loops within migration bodies.
 *
 * State reconstruction only ever runs `up`, which structurally rules out the
 * static parser's failure mode of replaying rollback statements as forward
 * operations. `down` is executed on request (`executeMigrationDownSource`),
 * for rollback verification — see `verify.ts`. Downs run in reverse
 * registration order, mirroring how PocketBase rolls back.
 */

import * as fs from "fs";
import * as vm from "vm";
import { MigrationExecutionError } from "../errors";
import { createSimulatedApp } from "./app";
import { buildSandbox } from "./globals";
import type { CollectionStore } from "./store";
import type { EngineOptions, EngineWarning, MigrationDirection, MigrationExecutionResult } from "./types";

const DEFAULT_TIMEOUT_MS = 5000;

export function executeMigrationSource(
  source: string,
  store: CollectionStore,
  options: EngineOptions & { filename?: string } = {}
): MigrationExecutionResult {
  return runMigrationSource(source, store, options, "up");
}

export function executeMigrationFile(
  filePath: string,
  store: CollectionStore,
  options: EngineOptions = {}
): MigrationExecutionResult {
  const source = fs.readFileSync(filePath, "utf-8");
  return executeMigrationSource(source, store, { ...options, filename: filePath });
}

/**
 * Runs the file's `down()` closures against the store, newest registration
 * first. A file that registers no `down` leaves the store untouched and
 * reports `applied: false`.
 */
export function executeMigrationDownSource(
  source: string,
  store: CollectionStore,
  options: EngineOptions & { filename?: string } = {}
): MigrationExecutionResult {
  return runMigrationSource(source, store, options, "down");
}

export function executeMigrationDownFile(
  filePath: string,
  store: CollectionStore,
  options: EngineOptions = {}
): MigrationExecutionResult {
  const source = fs.readFileSync(filePath, "utf-8");
  return executeMigrationDownSource(source, store, { ...options, filename: filePath });
}

function runMigrationSource(
  source: string,
  store: CollectionStore,
  options: EngineOptions & { filename?: string },
  direction: MigrationDirection
): MigrationExecutionResult {
  const filename = options.filename ?? "<migration>";
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const warnings: EngineWarning[] = [];
  const warn = (warning: EngineWarning) => {
    const withFile = { ...warning, file: warning.file ?? filename };
    warnings.push(withFile);
    options.onWarning?.(withFile);
  };

  const { sandbox, registrations, setCurrentApp } = buildSandbox(options, warn);
  const context = vm.createContext(sandbox);

  try {
    new vm.Script(source, { filename }).runInContext(context, { timeout });
  } catch (error) {
    throw new MigrationExecutionError(
      `Failed to evaluate migration file: ${error instanceof Error ? error.message : String(error)}`,
      filename,
      "evaluate",
      error instanceof Error ? error : undefined
    );
  }

  sandbox.__engineRegistrations__ = registrations;

  // Rollback undoes the most recent registration first
  const order = registrations.map((_, index) => index);
  if (direction === "down") {
    order.reverse();
  }

  let applied = false;
  for (const index of order) {
    const closure = registrations[index]?.[direction];
    if (typeof closure !== "function") {
      continue;
    }

    const tx = store.clone();
    const app = createSimulatedApp(tx, options, warn);
    sandbox.__engineApp__ = app;
    setCurrentApp(app);

    try {
      vm.runInContext(`__engineRegistrations__[${index}].${direction}(__engineApp__)`, context, { timeout });
    } catch (error) {
      throw new MigrationExecutionError(
        `Migration ${direction}() failed: ${error instanceof Error ? error.message : String(error)}`,
        filename,
        direction,
        error instanceof Error ? error : undefined
      );
    } finally {
      setCurrentApp(null);
      delete sandbox.__engineApp__;
    }

    store.replaceWith(tx);
    applied = true;
  }

  return { file: filename, direction, applied, warnings };
}
