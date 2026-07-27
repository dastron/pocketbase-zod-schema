/**
 * `$dbx` and `app.db()` simulation
 *
 * PocketBase exposes two query surfaces to a migration: `$dbx` expression
 * builders passed to the record finders, and `app.db().newQuery(sql)` for raw
 * SQL. Both are simulated against the in-memory record store (`records.ts`).
 *
 * The SQL support is a deliberate subset — SELECT / INSERT / UPDATE / DELETE
 * against a single collection table, with the condition grammar from
 * `expression.ts`. Anything beyond it raises `UnsupportedQueryError`, which
 * the caller turns into a warning (lenient) or a throw (strict): reporting
 * "this query is not simulated" is useful, quietly matching the wrong rows is
 * not.
 */

import {
  ExpressionError,
  evaluateCondition,
  parseCondition,
  parseValueOperand,
  resolveOperand,
  type Condition,
  type Operand,
} from "./expression";
import type { RecordModel } from "./records";

export class UnsupportedQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedQueryError";
    Object.setPrototypeOf(this, UnsupportedQueryError.prototype);
  }
}

/** Marks the objects `$dbx.*` returns so the finders can recognize them */
const DBX_EXPRESSION = Symbol.for("pocketbase-zod-schema.dbxExpression");

export interface DbxExpression {
  [DBX_EXPRESSION]: true;
  /** The SQL fragment, as `$dbx` would build it (for messages and debugging) */
  build(): string;
  matches(record: RecordModel): boolean;
}

export function isDbxExpression(value: unknown): value is DbxExpression {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[DBX_EXPRESSION] === true;
}

function expression(sql: string, matches: (record: RecordModel) => boolean): DbxExpression {
  return { [DBX_EXPRESSION]: true, build: () => sql, matches };
}

/** Evaluates a parsed condition against one record */
export function matchCondition(condition: Condition, record: RecordModel, params?: Record<string, unknown>): boolean {
  return evaluateCondition(condition, { field: (name) => readField(record, name), params });
}

/**
 * Column references may be qualified (`posts.status`) or quoted; the record
 * only knows the bare name.
 */
export function readField(record: RecordModel, name: string): unknown {
  const bare = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : name;
  return record.get(bare);
}

function quoteLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// $dbx
// ---------------------------------------------------------------------------

export function createDbx(): Record<string, unknown> {
  const exp = (raw: string, params: Record<string, unknown> = {}): DbxExpression => {
    const condition = parseCondition(raw);
    return expression(raw, (record) => matchCondition(condition, record, params));
  };

  const hashExp = (pairs: Record<string, unknown>): DbxExpression => {
    const entries = Object.entries(pairs ?? {});
    const sql = entries.map(([key, value]) => `${key}=${quoteLiteral(value)}`).join(" AND ") || "1=1";
    return expression(sql, (record) => entries.every(([key, value]) => looseMatch(readField(record, key), value)));
  };

  const combine = (keyword: "AND" | "OR", operands: unknown[]): DbxExpression => {
    const expressions = operands.filter(isDbxExpression);
    const sql = expressions.map((operand) => `(${operand.build()})`).join(` ${keyword} `) || "1=1";
    return expression(sql, (record) =>
      keyword === "AND"
        ? expressions.every((operand) => operand.matches(record))
        : expressions.some((operand) => operand.matches(record))
    );
  };

  const inList = (column: string, values: unknown[], negated: boolean): DbxExpression => {
    const flat = values.flat();
    const sql = `${column} ${negated ? "NOT IN" : "IN"} (${flat.map(quoteLiteral).join(", ")})`;
    return expression(sql, (record) => {
      const matched = flat.some((value) => looseMatch(readField(record, column), value));
      return negated ? !matched : matched;
    });
  };

  const like = (column: string, values: unknown[], negated: boolean, anyOf: boolean): DbxExpression => {
    const terms = values.flat().map((value) => String(value));
    const keyword = negated ? "NOT LIKE" : "LIKE";
    const sql = terms.map((term) => `${column} ${keyword} '%${term}%'`).join(anyOf ? " OR " : " AND ") || "1=1";
    return expression(sql, (record) => {
      const text = String(readField(record, column) ?? "").toLowerCase();
      const test = (term: string) => text.includes(term.toLowerCase());
      const matched = anyOf ? terms.some(test) : terms.every(test);
      return negated ? !matched : matched;
    });
  };

  return {
    exp,
    hashExp,
    and: (...operands: unknown[]) => combine("AND", operands),
    or: (...operands: unknown[]) => combine("OR", operands),
    not: (operand: unknown) => {
      const inner = isDbxExpression(operand) ? operand : null;
      return expression(inner ? `NOT (${inner.build()})` : "1=0", (record) => !inner || !inner.matches(record));
    },
    in: (column: string, ...values: unknown[]) => inList(column, values, false),
    notIn: (column: string, ...values: unknown[]) => inList(column, values, true),
    like: (column: string, ...values: unknown[]) => like(column, values, false, false),
    notLike: (column: string, ...values: unknown[]) => like(column, values, true, false),
    orLike: (column: string, ...values: unknown[]) => like(column, values, false, true),
    between: (column: string, from: unknown, to: unknown) =>
      expression(`${column} BETWEEN ${quoteLiteral(from)} AND ${quoteLiteral(to)}`, (record) => {
        const value = readField(record, column);
        return compare(value, from) >= 0 && compare(value, to) <= 0;
      }),
    notBetween: (column: string, from: unknown, to: unknown) =>
      expression(`${column} NOT BETWEEN ${quoteLiteral(from)} AND ${quoteLiteral(to)}`, (record) => {
        const value = readField(record, column);
        return !(compare(value, from) >= 0 && compare(value, to) <= 0);
      }),
  };
}

function looseMatch(left: unknown, right: unknown): boolean {
  return evaluateCondition(
    { kind: "compare", operator: "=", left: { kind: "value", value: left }, right: { kind: "value", value: right } },
    { field: () => undefined }
  );
}

function compare(left: unknown, right: unknown): number {
  if (looseMatch(left, right)) {
    return 0;
  }
  return evaluateCondition(
    { kind: "compare", operator: "<", left: { kind: "value", value: left }, right: { kind: "value", value: right } },
    { field: () => undefined }
  )
    ? -1
    : 1;
}

// ---------------------------------------------------------------------------
// SQL subset
// ---------------------------------------------------------------------------

export type ParsedStatement =
  | {
      kind: "select";
      table: string;
      columns: string[];
      where?: Condition;
      order?: OrderTerm[];
      limit?: number;
      offset?: number;
    }
  | { kind: "update"; table: string; assignments: { column: string; value: Operand }[]; where?: Condition }
  | { kind: "delete"; table: string; where?: Condition }
  | { kind: "insert"; table: string; columns: string[]; values: Operand[] };

export interface OrderTerm {
  column: string;
  descending: boolean;
}

const SELECT_PATTERN = /^SELECT\s+(?<columns>[\s\S]+?)\s+FROM\s+(?<table>[`"[\]\w.]+)(?<rest>[\s\S]*)$/i;
const UPDATE_PATTERN = /^UPDATE\s+(?<table>[`"[\]\w.]+)\s+SET\s+(?<rest>[\s\S]+)$/i;
const DELETE_PATTERN = /^DELETE\s+FROM\s+(?<table>[`"[\]\w.]+)(?<rest>[\s\S]*)$/i;
const INSERT_PATTERN =
  /^INSERT\s+INTO\s+(?<table>[`"[\]\w.]+)\s*\((?<columns>[^)]*)\)\s*VALUES\s*\((?<values>[\s\S]*)\)\s*$/i;

/**
 * Parses one statement of the supported subset.
 *
 * @throws UnsupportedQueryError for anything outside it
 */
export function parseStatement(sql: string): ParsedStatement {
  const trimmed = sql.trim().replace(/;\s*$/, "");

  const insert = INSERT_PATTERN.exec(trimmed);
  if (insert?.groups) {
    const columns = splitTopLevel(insert.groups.columns).map(unquoteIdentifier);
    const values = splitTopLevel(insert.groups.values).map((value) => parseOperandOrThrow(value, trimmed));
    if (columns.length !== values.length) {
      throw new UnsupportedQueryError(`INSERT column/value count mismatch: ${trimmed}`);
    }
    return { kind: "insert", table: unquoteIdentifier(insert.groups.table), columns, values };
  }

  const update = UPDATE_PATTERN.exec(trimmed);
  if (update?.groups) {
    const { clause, where } = splitWhere(update.groups.rest, trimmed);
    const assignments = splitTopLevel(clause).map((assignment) => {
      const separator = assignment.indexOf("=");
      if (separator === -1) {
        throw new UnsupportedQueryError(`Unsupported SET assignment ${JSON.stringify(assignment)} in: ${trimmed}`);
      }
      return {
        column: unquoteIdentifier(assignment.slice(0, separator)),
        value: parseOperandOrThrow(assignment.slice(separator + 1), trimmed),
      };
    });
    return { kind: "update", table: unquoteIdentifier(update.groups.table), assignments, where };
  }

  const remove = DELETE_PATTERN.exec(trimmed);
  if (remove?.groups) {
    const { clause, where } = splitWhere(remove.groups.rest, trimmed);
    if (clause.trim() !== "") {
      throw new UnsupportedQueryError(`Unsupported DELETE clause ${JSON.stringify(clause.trim())} in: ${trimmed}`);
    }
    return { kind: "delete", table: unquoteIdentifier(remove.groups.table), where };
  }

  const select = SELECT_PATTERN.exec(trimmed);
  if (select?.groups) {
    const { clause, where, order, limit, offset } = splitSelectTail(select.groups.rest, trimmed);
    if (clause.trim() !== "") {
      throw new UnsupportedQueryError(`Unsupported SELECT clause ${JSON.stringify(clause.trim())} in: ${trimmed}`);
    }
    return {
      kind: "select",
      table: unquoteIdentifier(select.groups.table),
      columns: splitTopLevel(select.groups.columns).map((column) => unquoteIdentifier(stripAlias(column))),
      where,
      order,
      limit,
      offset,
    };
  }

  throw new UnsupportedQueryError(`Only single-table SELECT/INSERT/UPDATE/DELETE are simulated. Got: ${trimmed}`);
}

/** Runs a parsed statement over a collection's rows */
export interface StatementTarget {
  /** Records of the statement's table, in insertion order */
  rows: () => RecordModel[];
  insert: (values: Record<string, unknown>) => RecordModel;
  remove: (record: RecordModel) => void;
  persist: (record: RecordModel) => void;
}

export interface StatementResult {
  /** Rows a SELECT produced, as plain objects */
  rows: Record<string, unknown>[];
  /** Rows an INSERT/UPDATE/DELETE touched */
  affected: number;
}

export function executeStatement(
  statement: ParsedStatement,
  target: StatementTarget,
  params: Record<string, unknown>
): StatementResult {
  const matching = (where?: Condition) =>
    target.rows().filter((record) => (where ? matchCondition(where, record, params) : true));

  switch (statement.kind) {
    case "select": {
      let rows = matching(statement.where);
      const order = statement.order;
      if (order?.length) {
        rows = [...rows].sort((a, b) => {
          for (const term of order) {
            const result = compare(readField(a, term.column), readField(b, term.column));
            if (result !== 0) {
              return term.descending ? -result : result;
            }
          }
          return 0;
        });
      }
      if (statement.offset !== undefined) {
        rows = rows.slice(statement.offset);
      }
      if (statement.limit !== undefined) {
        rows = rows.slice(0, statement.limit);
      }

      const selectAll = statement.columns.length === 0 || statement.columns.includes("*");
      return {
        rows: rows.map((record) => {
          if (selectAll) {
            return record.export();
          }
          const projected: Record<string, unknown> = {};
          for (const column of statement.columns) {
            projected[column] = readField(record, column);
          }
          return projected;
        }),
        affected: 0,
      };
    }

    case "update": {
      const rows = matching(statement.where);
      for (const record of rows) {
        for (const assignment of statement.assignments) {
          record.set(
            assignment.column,
            resolveOperand(assignment.value, { field: (name) => readField(record, name), params })
          );
        }
        target.persist(record);
      }
      return { rows: [], affected: rows.length };
    }

    case "delete": {
      const rows = matching(statement.where);
      for (const record of rows) {
        target.remove(record);
      }
      return { rows: [], affected: rows.length };
    }

    case "insert": {
      const values: Record<string, unknown> = {};
      statement.columns.forEach((column, index) => {
        values[column] = resolveOperand(statement.values[index], { field: () => undefined, params });
      });
      target.insert(values);
      return { rows: [], affected: 1 };
    }
  }
}

function parseOperandOrThrow(source: string, sql: string): Operand {
  try {
    return parseValueOperand(source);
  } catch (error) {
    if (error instanceof ExpressionError) {
      throw new UnsupportedQueryError(`Unsupported value ${JSON.stringify(source.trim())} in: ${sql}`);
    }
    throw error;
  }
}

function parseConditionOrThrow(source: string, sql: string): Condition {
  try {
    return parseCondition(source);
  } catch (error) {
    if (error instanceof ExpressionError) {
      throw new UnsupportedQueryError(`Unsupported WHERE clause in ${sql}: ${error.message}`);
    }
    throw error;
  }
}

function splitWhere(rest: string, sql: string): { clause: string; where?: Condition } {
  const index = indexOfKeyword(rest, "WHERE");
  if (index === -1) {
    return { clause: rest };
  }
  return {
    clause: rest.slice(0, index),
    where: parseConditionOrThrow(rest.slice(index + "WHERE".length), sql),
  };
}

function splitSelectTail(
  rest: string,
  sql: string
): { clause: string; where?: Condition; order?: OrderTerm[]; limit?: number; offset?: number } {
  let remainder = rest;
  let offset: number | undefined;
  let limit: number | undefined;
  let order: OrderTerm[] | undefined;

  const offsetIndex = indexOfKeyword(remainder, "OFFSET");
  if (offsetIndex !== -1) {
    offset = parseCount(remainder.slice(offsetIndex + "OFFSET".length), sql);
    remainder = remainder.slice(0, offsetIndex);
  }

  const limitIndex = indexOfKeyword(remainder, "LIMIT");
  if (limitIndex !== -1) {
    limit = parseCount(remainder.slice(limitIndex + "LIMIT".length), sql);
    remainder = remainder.slice(0, limitIndex);
  }

  const orderIndex = indexOfKeyword(remainder, "ORDER BY");
  if (orderIndex !== -1) {
    order = splitTopLevel(remainder.slice(orderIndex + "ORDER BY".length)).map((term) => {
      const parts = term.trim().split(/\s+/);
      return {
        column: unquoteIdentifier(parts[0]),
        descending: (parts[1] ?? "").toUpperCase() === "DESC",
      };
    });
    remainder = remainder.slice(0, orderIndex);
  }

  const { clause, where } = splitWhere(remainder, sql);
  return { clause, where, order, limit, offset };
}

function parseCount(source: string, sql: string): number {
  const value = Number(source.trim());
  if (!Number.isInteger(value) || value < 0) {
    throw new UnsupportedQueryError(`Unsupported LIMIT/OFFSET ${JSON.stringify(source.trim())} in: ${sql}`);
  }
  return value;
}

/** Finds a keyword outside of quotes and parentheses */
function indexOfKeyword(source: string, keyword: string): number {
  const upper = source.toUpperCase();
  const target = keyword.toUpperCase();
  let depth = 0;
  let quote: string | null = null;

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === "\\") {
        index++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") {
      depth++;
      continue;
    }
    if (char === ")") {
      depth--;
      continue;
    }
    if (depth !== 0) {
      continue;
    }
    if (upper.startsWith(target, index) && isBoundary(source, index - 1) && isBoundary(source, index + target.length)) {
      return index;
    }
  }

  return -1;
}

function isBoundary(source: string, index: number): boolean {
  if (index < 0 || index >= source.length) {
    return true;
  }
  return !/[A-Za-z0-9_]/.test(source[index]);
}

/** Splits on commas that are not inside quotes or parentheses */
function splitTopLevel(source: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      current += char;
      if (char === "\\" && index + 1 < source.length) {
        current += source[++index];
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth--;
    }
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim() !== "") {
    parts.push(current);
  }
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

function stripAlias(column: string): string {
  return column.replace(/\s+AS\s+[\s\S]+$/i, "").trim();
}

function unquoteIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  const unquoted = trimmed.replace(/^[`"[]/, "").replace(/[`"\]]$/, "");
  // Qualified names (`posts.status`) reduce to the column
  return unquoted.includes(".") ? unquoted.slice(unquoted.lastIndexOf(".") + 1) : unquoted;
}
