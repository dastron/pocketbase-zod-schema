/**
 * Runner — executes one migration file against a CollectionStore
 *
 * Evaluation happens in a vm context built from the sandbox globals; the
 * file's migrate(up, down) call registers its closures. Each up() then runs
 * transactionally: the store is cloned, up() is applied to the clone, and
 * the clone replaces the store only on success. up() is invoked from inside
 * the context (not host code) so the vm timeout also bounds infinite loops
 * within migration bodies. down() closures are captured but never executed,
 * which structurally rules out the static parser's failure mode of replaying
 * rollback statements as forward operations.
 */

import * as fs from "fs";
import * as vm from "vm";
import { MigrationExecutionError } from "../errors";
import { createSimulatedApp } from "./app";
import { buildSandbox } from "./globals";
import type { CollectionStore } from "./store";
import type { EngineOptions, EngineWarning, MigrationExecutionResult } from "./types";

const DEFAULT_TIMEOUT_MS = 5000;

export function executeMigrationSource(
  source: string,
  store: CollectionStore,
  options: EngineOptions & { filename?: string } = {}
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

  let applied = false;
  for (let i = 0; i < registrations.length; i++) {
    const registration = registrations[i];
    if (typeof registration?.up !== "function") {
      continue;
    }

    const tx = store.clone();
    const app = createSimulatedApp(tx, options, warn);
    sandbox.__engineApp__ = app;
    setCurrentApp(app);

    try {
      vm.runInContext(`__engineRegistrations__[${i}].up(__engineApp__)`, context, { timeout });
    } catch (error) {
      throw new MigrationExecutionError(
        `Migration up() failed: ${error instanceof Error ? error.message : String(error)}`,
        filename,
        "up",
        error instanceof Error ? error : undefined
      );
    } finally {
      setCurrentApp(null);
      delete sandbox.__engineApp__;
    }

    store.replaceWith(tx);
    applied = true;
  }

  return { file: filename, applied, warnings };
}

export function executeMigrationFile(
  filePath: string,
  store: CollectionStore,
  options: EngineOptions = {}
): MigrationExecutionResult {
  const source = fs.readFileSync(filePath, "utf-8");
  return executeMigrationSource(source, store, { ...options, filename: filePath });
}
