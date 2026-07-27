/**
 * goja-compatibility lint
 *
 * The engine executes migrations with Node's JavaScript, a superset of the
 * goja dialect PocketBase actually runs. That gap is silent: a migration can
 * replay perfectly here, pass verification, and still fail the moment
 * `pocketbase migrate up` reaches it — because it referenced a Node global,
 * used class fields, or awaited a promise in a runtime with no event loop.
 *
 * This pass closes the gap statically. It parses the file with acorn and
 * reports:
 *
 * - `unknown-global` — a free identifier that is neither declared in the file
 *   nor part of the PocketBase JSVM surface (the sandbox globals) or the
 *   ECMAScript library goja implements. `require`, `process`, `Buffer`,
 *   `fetch`, `setTimeout` all land here.
 * - `unsupported-syntax` — constructs goja's parser rejects: class fields,
 *   private members, static blocks, BigInt literals, `import.meta`.
 * - `module-syntax` — `import`/`export`; migrations are scripts.
 * - `async` — `async`/`await`/`Promise`. goja runs migrations synchronously,
 *   so an awaited promise never settles.
 * - `unsupported-api` — folded in from execution warnings: a call that
 *   resolved to an inert stub did nothing here and will do something (or
 *   throw) in production.
 */

import * as acorn from "acorn";
import * as fs from "fs";
import { buildSandbox } from "./globals";
import type { EngineWarning } from "./types";

export type GojaLintRule =
  | "syntax"
  | "unsupported-syntax"
  | "module-syntax"
  | "async"
  | "unknown-global"
  | "unsupported-api";

export type GojaLintSeverity = "error" | "warning";

export interface GojaLintFinding {
  rule: GojaLintRule;
  severity: GojaLintSeverity;
  message: string;
  file?: string;
  line?: number;
  column?: number;
}

export interface GojaLintResult {
  file: string;
  findings: GojaLintFinding[];
  /** No error-severity findings */
  ok: boolean;
}

export interface GojaLintOptions {
  /** Path or name used in messages */
  file?: string;
  /**
   * Extra globals to treat as available — for a PocketBase build that
   * registers its own JSVM bindings.
   */
  allowedGlobals?: string[];
  /**
   * Engine warnings from executing the same file. `unsupported-api` entries
   * become findings, which is how a stubbed call gets surfaced prominently
   * instead of being buried in replay output.
   */
  warnings?: EngineWarning[];
}

/**
 * The ECMAScript library goja implements. Deliberately excludes the ones it
 * does not: BigInt, WeakRef, FinalizationRegistry, Atomics,
 * SharedArrayBuffer, Intl.
 */
const ECMASCRIPT_GLOBALS = [
  "Array",
  "ArrayBuffer",
  "Boolean",
  "DataView",
  "Date",
  "Error",
  "EvalError",
  "Float32Array",
  "Float64Array",
  "Function",
  "Infinity",
  "Int16Array",
  "Int32Array",
  "Int8Array",
  "JSON",
  "Map",
  "Math",
  "NaN",
  "Number",
  "Object",
  "Proxy",
  "RangeError",
  "ReferenceError",
  "Reflect",
  "RegExp",
  "Set",
  "String",
  "Symbol",
  "SyntaxError",
  "TypeError",
  "URIError",
  "Uint16Array",
  "Uint32Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "WeakMap",
  "WeakSet",
  "decodeURI",
  "decodeURIComponent",
  "encodeURI",
  "encodeURIComponent",
  "escape",
  "eval",
  "globalThis",
  "isFinite",
  "isNaN",
  "parseFloat",
  "parseInt",
  "undefined",
  "unescape",
];

/**
 * PocketBase JSVM bindings that exist at runtime but are not part of the
 * simulation's sandbox, so referencing them is valid even though the engine
 * would stub them.
 */
const POCKETBASE_GLOBALS = [
  "$apis",
  "$tokens",
  "__hooks",
  "arrayOf",
  "readerToString",
  "sleep",
  "toString",
  "Cookie",
  "DynamicModel",
  "FieldsList",
  "MailerMessage",
  "RequestInfo",
  "SubscriptionMessage",
  "ValidationError",
];

/**
 * `Promise` is real in goja but useless in a migration: nothing drains the
 * job queue, so a `.then` never runs. Reported by the async rule rather than
 * as an unknown global.
 */
const ASYNC_GLOBALS = new Set(["Promise"]);

/** Node/browser globals absent from goja, named so the message can say why */
const KNOWN_FOREIGN_GLOBALS: Record<string, string> = {
  Buffer: "Node.js",
  TextDecoder: "Node.js",
  TextEncoder: "Node.js",
  URL: "Node.js/browser",
  URLSearchParams: "Node.js/browser",
  __dirname: "Node.js (CommonJS)",
  __filename: "Node.js (CommonJS)",
  atob: "browser",
  btoa: "browser",
  clearInterval: "Node.js/browser",
  clearTimeout: "Node.js/browser",
  document: "browser",
  exports: "Node.js (CommonJS)",
  fetch: "Node.js/browser",
  global: "Node.js",
  localStorage: "browser",
  module: "Node.js (CommonJS)",
  process: "Node.js",
  queueMicrotask: "Node.js/browser",
  require: "Node.js (CommonJS)",
  setInterval: "Node.js/browser",
  setTimeout: "Node.js/browser",
  structuredClone: "Node.js/browser",
  window: "browser",
};

/** The globals the simulation itself installs — the PocketBase JSVM surface */
let sandboxGlobalsCache: string[] | null = null;

function sandboxGlobals(): string[] {
  if (!sandboxGlobalsCache) {
    const { sandbox } = buildSandbox({}, () => {});
    sandboxGlobalsCache = Object.keys(sandbox);
  }
  return sandboxGlobalsCache;
}

/** The identifiers a migration may reference without declaring them */
export function availableGlobals(extra: string[] = []): Set<string> {
  return new Set([...ECMASCRIPT_GLOBALS, ...POCKETBASE_GLOBALS, ...sandboxGlobals(), ...extra]);
}

export function lintMigrationSource(source: string, options: GojaLintOptions = {}): GojaLintResult {
  const file = options.file ?? "<migration>";
  const findings: GojaLintFinding[] = [];
  const at = (node: { loc?: acorn.SourceLocation | null }) => ({
    file,
    line: node.loc?.start.line,
    column: node.loc?.start.column,
  });

  const parsed = parseForLint(source);
  if (parsed.kind === "failed") {
    findings.push({
      rule: "syntax",
      severity: "error",
      message: `Not valid JavaScript: ${parsed.message}`,
      file,
      line: parsed.line,
      column: parsed.column,
    });
    return finish(file, findings, options.warnings);
  }

  if (parsed.kind === "module") {
    findings.push({
      rule: "module-syntax",
      severity: "error",
      message:
        "import/export are not available in PocketBase migrations — they run as scripts in goja, not as ES modules",
      file,
    });
  }

  if (parsed.kind === "beyond-target") {
    findings.push({
      rule: "unsupported-syntax",
      severity: "error",
      message: `Syntax beyond what goja parses: ${parsed.message}`,
      file,
      line: parsed.line,
      column: parsed.column,
    });
  }

  const program = parsed.program;
  const declared = collectDeclaredNames(program);
  const allowed = availableGlobals(options.allowedGlobals);

  walk(program, (node, parent, key) => {
    switch (node.type) {
      case "PropertyDefinition":
        findings.push({
          rule: "unsupported-syntax",
          severity: "error",
          message: "Class fields are not supported by goja",
          ...at(node),
        });
        break;
      case "PrivateIdentifier":
        findings.push({
          rule: "unsupported-syntax",
          severity: "error",
          message: "Private class members (#name) are not supported by goja",
          ...at(node),
        });
        break;
      case "StaticBlock":
        findings.push({
          rule: "unsupported-syntax",
          severity: "error",
          message: "Class static initialization blocks are not supported by goja",
          ...at(node),
        });
        break;
      case "ImportExpression":
        findings.push({
          rule: "module-syntax",
          severity: "error",
          message: "Dynamic import() is not available in PocketBase migrations",
          ...at(node),
        });
        break;
      case "MetaProperty":
        findings.push({
          rule: "unsupported-syntax",
          severity: "error",
          message: "import.meta is not available in PocketBase migrations",
          ...at(node),
        });
        break;
      case "AwaitExpression":
        findings.push({
          rule: "async",
          severity: "error",
          message: "await never settles in PocketBase migrations — goja runs them synchronously",
          ...at(node),
        });
        break;
      case "Literal":
        if (typeof (node as acorn.Literal & { bigint?: string }).bigint === "string") {
          findings.push({
            rule: "unsupported-syntax",
            severity: "error",
            message: "BigInt literals are not supported by goja",
            ...at(node),
          });
        }
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        if ((node as acorn.Function).async) {
          findings.push({
            rule: "async",
            severity: "error",
            message: "async functions do not work in PocketBase migrations — goja runs them synchronously",
            ...at(node),
          });
        }
        break;
      case "ForOfStatement":
        if ((node as acorn.ForOfStatement).await) {
          findings.push({
            rule: "async",
            severity: "error",
            message: "for await...of is not supported by goja",
            ...at(node),
          });
        }
        break;
      case "Identifier": {
        if (!isReference(parent, key)) {
          break;
        }
        const name = (node as acorn.Identifier).name;
        if (declared.has(name) || allowed.has(name)) {
          break;
        }
        if (ASYNC_GLOBALS.has(name)) {
          findings.push({
            rule: "async",
            severity: "error",
            message: `${name} is unusable in a PocketBase migration — nothing drains the job queue, so callbacks never run`,
            ...at(node),
          });
          break;
        }
        const origin = KNOWN_FOREIGN_GLOBALS[name];
        findings.push({
          rule: "unknown-global",
          severity: "error",
          message: origin
            ? `${name} is a ${origin} global and does not exist in PocketBase's JavaScript runtime`
            : `${name} is not declared in this file and is not part of the PocketBase JSVM surface`,
          ...at(node),
        });
        break;
      }
      default:
        break;
    }
  });

  return finish(file, dedupe(findings), options.warnings);
}

export function lintMigrationFile(filePath: string, options: GojaLintOptions = {}): GojaLintResult {
  return lintMigrationSource(fs.readFileSync(filePath, "utf-8"), { ...options, file: options.file ?? filePath });
}

export function lintMigrationFiles(files: string[], options: GojaLintOptions = {}): GojaLintResult[] {
  return files.map((file) => lintMigrationFile(file, { ...options, file }));
}

/** Turns engine execution warnings into findings */
export function gojaFindingsFromWarnings(warnings: EngineWarning[] = []): GojaLintFinding[] {
  return warnings
    .filter((warning) => warning.kind === "unsupported-api")
    .map((warning) => ({
      rule: "unsupported-api" as const,
      // The call did nothing in the simulation; in production it does
      // something the simulation did not model, which is worth reading but
      // is not by itself a goja incompatibility
      severity: "warning" as const,
      message: warning.message,
      file: warning.file,
    }));
}

export function formatGojaLintFinding(finding: GojaLintFinding): string {
  const location = finding.line !== undefined ? `:${finding.line}:${(finding.column ?? 0) + 1}` : "";
  return `${finding.file ?? "<migration>"}${location} [${finding.rule}] ${finding.message}`;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * goja's parser tracks ES2022 minus the class-member additions, which the
 * walk reports individually — so parsing at that level yields an AST for
 * almost everything and leaves genuinely newer syntax to fail here.
 */
const GOJA_ECMA_VERSION = 2022;

type ParseOutcome =
  | {
      kind: "script" | "module" | "beyond-target";
      program: acorn.Program;
      message?: string;
      line?: number;
      column?: number;
    }
  | { kind: "failed"; message: string; line?: number; column?: number };

function parseForLint(source: string): ParseOutcome {
  const base: acorn.Options = { ecmaVersion: GOJA_ECMA_VERSION, locations: true, allowHashBang: true };

  try {
    return { kind: "script", program: acorn.parse(source, { ...base, sourceType: "script" }) };
  } catch (scriptError) {
    // import/export only parse as a module — reporting that specifically is
    // far more useful than "unexpected token"
    try {
      return { kind: "module", program: acorn.parse(source, { ...base, sourceType: "module" }) };
    } catch {
      // Fall through: not a module problem
    }

    try {
      const program = acorn.parse(source, { ecmaVersion: "latest", locations: true, sourceType: "script" });
      return { kind: "beyond-target", program, ...describeParseError(scriptError) };
    } catch (latestError) {
      return { kind: "failed", ...describeParseError(latestError) };
    }
  }
}

function describeParseError(error: unknown): { message: string; line?: number; column?: number } {
  const syntaxError = error as { message?: string; loc?: { line: number; column: number } };
  return {
    message: syntaxError?.message ?? String(error),
    line: syntaxError?.loc?.line,
    column: syntaxError?.loc?.column,
  };
}

// ---------------------------------------------------------------------------
// AST traversal
// ---------------------------------------------------------------------------

type AnyNode = acorn.Node & Record<string, any>;

function walk(node: AnyNode, visit: (node: AnyNode, parent: AnyNode | null, key: string | null) => void): void {
  const stack: { node: AnyNode; parent: AnyNode | null; key: string | null }[] = [{ node, parent: null, key: null }];

  while (stack.length > 0) {
    const current = stack.pop()!;
    visit(current.node, current.parent, current.key);

    for (const [key, value] of Object.entries(current.node)) {
      if (key === "loc" || key === "range" || value === null || typeof value !== "object") {
        continue;
      }
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (isNode(entry)) {
            stack.push({ node: entry, parent: current.node, key });
          }
        }
        continue;
      }
      if (isNode(value)) {
        stack.push({ node: value, parent: current.node, key });
      }
    }
  }
}

function isNode(value: unknown): value is AnyNode {
  return typeof value === "object" && value !== null && typeof (value as AnyNode).type === "string";
}

/**
 * Whether an Identifier is a variable reference rather than a name in some
 * other position — a non-computed property, an object key, a label.
 */
function isReference(parent: AnyNode | null, key: string | null): boolean {
  if (!parent) {
    return true;
  }

  switch (parent.type) {
    case "MemberExpression":
      return key !== "property" || parent.computed === true;
    case "Property":
      return key !== "key" || parent.computed === true;
    case "MethodDefinition":
    case "PropertyDefinition":
      return key !== "key" || parent.computed === true;
    case "LabeledStatement":
    case "BreakStatement":
    case "ContinueStatement":
      return key !== "label";
    case "ExportSpecifier":
    case "ImportSpecifier":
      return false;
    default:
      return true;
  }
}

/**
 * Every name bound anywhere in the file.
 *
 * Scopes are deliberately collapsed: over-approximating what is declared
 * cannot produce a false "unknown global", and the alternative — a scope
 * chain — would only matter for a migration that shadows a global in one
 * function and expects the real one in another.
 */
function collectDeclaredNames(program: acorn.Program): Set<string> {
  const names = new Set<string>();

  const bindPattern = (pattern: AnyNode | null | undefined): void => {
    if (!pattern) {
      return;
    }
    switch (pattern.type) {
      case "Identifier":
        names.add(pattern.name);
        break;
      case "ObjectPattern":
        for (const property of pattern.properties ?? []) {
          bindPattern(property.type === "RestElement" ? property.argument : property.value);
        }
        break;
      case "ArrayPattern":
        for (const element of pattern.elements ?? []) {
          bindPattern(element);
        }
        break;
      case "AssignmentPattern":
        bindPattern(pattern.left);
        break;
      case "RestElement":
        bindPattern(pattern.argument);
        break;
      default:
        break;
    }
  };

  walk(program as AnyNode, (node) => {
    switch (node.type) {
      case "VariableDeclarator":
        bindPattern(node.id);
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        bindPattern(node.id);
        for (const param of node.params ?? []) {
          bindPattern(param);
        }
        break;
      case "ClassDeclaration":
      case "ClassExpression":
        bindPattern(node.id);
        break;
      case "CatchClause":
        bindPattern(node.param);
        break;
      case "ImportDefaultSpecifier":
      case "ImportNamespaceSpecifier":
      case "ImportSpecifier":
        bindPattern(node.local);
        break;
      default:
        break;
    }
  });

  return names;
}

/**
 * One finding per issue. A missing global is usually referenced many times;
 * reporting it once, at its first use, is what a reader needs. Syntax
 * findings keep their location, because each occurrence is a separate edit.
 */
function dedupe(findings: GojaLintFinding[]): GojaLintFinding[] {
  const seen = new Set<string>();
  const unique: GojaLintFinding[] = [];
  const collapsedRules = new Set<GojaLintRule>(["unknown-global", "async"]);

  // Sorted before collapsing so a rule reported once keeps its earliest use;
  // the AST walk does not visit nodes in source order
  const ordered = [...findings].sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0));

  for (const finding of ordered) {
    const key = collapsedRules.has(finding.rule)
      ? `${finding.rule}|${finding.message}`
      : `${finding.rule}|${finding.message}|${finding.line ?? ""}|${finding.column ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(finding);
  }

  return unique;
}

function finish(file: string, findings: GojaLintFinding[], warnings?: EngineWarning[]): GojaLintResult {
  const all = [...findings, ...gojaFindingsFromWarnings(warnings)];
  return { file, findings: all, ok: all.every((finding) => finding.severity !== "error") };
}
