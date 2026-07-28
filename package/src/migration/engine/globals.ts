/**
 * Sandbox globals for the migration execution context
 *
 * Recreates the PocketBase JSVM global surface a migration file sees:
 * migrate(), the Collection/Field constructors, unmarshal(), and the Go
 * binding globals ($app, $os, $dbx, ...). The sandbox contains NO Node
 * globals — no require, process, or fs — approximating goja, where none
 * of those exist either.
 */

import { Collection } from "./collection";
import { createInertStub, type SimulatedApp, type WarningSink } from "./app";
import { createDbx } from "./dbx";
import { FIELD_CONSTRUCTORS } from "./fields";
import { RecordModel } from "./records";
import { unmarshal } from "./unmarshal";
import type { EngineOptions } from "./types";

export interface MigrationRegistration {
  up?: (app: SimulatedApp) => unknown;
  down?: (app: SimulatedApp) => unknown;
}

export interface SandboxHandles {
  sandbox: Record<string, any>;
  registrations: MigrationRegistration[];
  /** The runner points this at the current transactional app during up() */
  setCurrentApp: (app: SimulatedApp | null) => void;
}

const STUBBED_GLOBALS = ["$os", "$dbx", "$security", "$filesystem", "$http", "$mails", "$template", "Record", "DateTime"];

export function buildSandbox(options: EngineOptions, warn: WarningSink): SandboxHandles {
  const registrations: MigrationRegistration[] = [];
  let currentApp: SimulatedApp | null = null;

  const consoleMethod =
    (level: string) =>
    (...args: unknown[]) => {
      warn({
        kind: "console",
        message: `console.${level}: ${args.map((arg) => stringifyArg(arg)).join(" ")}`,
      });
    };

  const sandbox: Record<string, any> = {
    migrate(up?: MigrationRegistration["up"], down?: MigrationRegistration["down"]) {
      registrations.push({ up, down });
    },
    Collection,
    unmarshal,
    ...FIELD_CONSTRUCTORS,
    console: {
      log: consoleMethod("log"),
      info: consoleMethod("info"),
      warn: consoleMethod("warn"),
      error: consoleMethod("error"),
      debug: consoleMethod("debug"),
    },
  };

  // Record and $dbx become real when record simulation is on; they hold no
  // state of their own, so the sandbox can own them for the whole file while
  // the store-bound half lives on the per-run app (see data-api.ts)
  const simulatesRecords = options.records === "simulate";

  for (const name of STUBBED_GLOBALS) {
    if (simulatesRecords && (name === "Record" || name === "$dbx")) {
      continue;
    }
    sandbox[name] = createInertStub(name, options, warn);
  }

  if (simulatesRecords) {
    sandbox.Record = RecordModel;
    sandbox.$dbx = createDbx();
  }

  // Some migrations use the global $app instead of the up() callback
  // argument; bind it to the same transactional app while up() runs
  Object.defineProperty(sandbox, "$app", {
    enumerable: true,
    get() {
      return currentApp ?? createInertStub("$app", options, warn);
    },
  });

  return {
    sandbox,
    registrations,
    setCurrentApp(app) {
      currentApp = app;
    },
  };
}

function stringifyArg(arg: unknown): string {
  if (typeof arg === "string") {
    return arg;
  }
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}
