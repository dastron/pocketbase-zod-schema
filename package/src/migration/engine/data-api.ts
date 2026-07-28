/**
 * The data-layer half of `app` — record finders and `app.db()`
 *
 * Installed on the simulated app only when `records: "simulate"` is set.
 * Without it these names fall through to the inert stubs, which is what
 * schema-only replay wants: a data migration should not be able to fail a
 * `generate` run over rows nobody is tracking.
 *
 * Finder semantics follow PocketBase: "by id" and "first by ..." throw
 * `sql: no rows in result set` on a miss, list finders return an empty array.
 * A migration that guards with try/catch behaves the same here as in
 * production.
 */

import type { Collection } from "./collection";
import {
  UnsupportedQueryError,
  executeStatement,
  isDbxExpression,
  matchCondition,
  parseStatement,
  readField,
  type DbxExpression,
  type StatementResult,
} from "./dbx";
import { compareForSort, ExpressionError, parseCondition } from "./expression";
import { RecordModel } from "./records";
import type { CollectionStore } from "./store";
import type { EngineOptions, EngineWarning } from "./types";

export interface WarningSink {
  (warning: EngineWarning): void;
}

/** PocketBase's error text for a lookup that matched nothing */
export const NO_ROWS_ERROR = "sql: no rows in result set";

export interface DataApi {
  /** Methods to install on the simulated app */
  methods: Record<string, (...args: any[]) => unknown>;
  /**
   * Points `runInTransaction`'s callback argument at the app these methods
   * are installed on. Called once the proxy exists.
   */
  bindApp: (app: unknown) => void;
}

export function createDataApi(store: CollectionStore, options: EngineOptions, warn: WarningSink): DataApi {
  const strict = options.strictness === "strict";

  /**
   * Accepts what PocketBase's finders accept: a name, an id, or a Collection.
   * A Collection is re-resolved through the store so the rows come from the
   * transaction's copy rather than whatever instance the caller held on to.
   */
  const resolveCollection = (target: unknown): Collection => {
    if (typeof target === "string") {
      const collection = store.getByNameOrId(target);
      if (collection) {
        return collection;
      }
      throw new Error(`${NO_ROWS_ERROR} (collection "${target}" not found)`);
    }

    if (target && typeof target === "object") {
      const candidate = target as Collection;
      const known =
        (typeof candidate.id === "string" ? store.getById(candidate.id) : undefined) ??
        (typeof candidate.name === "string" && candidate.name !== "" ? store.getByNameOrId(candidate.name) : undefined);
      if (known) {
        return known;
      }
      throw new Error(`${NO_ROWS_ERROR} (collection "${candidate.name ?? candidate.id}" not found)`);
    }

    throw new Error("[engine] expected a collection name, id, or Collection");
  };

  const rowsOf = (target: unknown): RecordModel[] => store.records.list(resolveCollection(target).id);

  const applyExpressions = (records: RecordModel[], expressions: unknown[]): RecordModel[] => {
    const predicates = expressions.filter(isDbxExpression) as DbxExpression[];
    const ignored = expressions.length - predicates.length;
    if (ignored > 0) {
      warn({
        kind: "unsupported-api",
        api: "$dbx",
        message: `${ignored} query expression(s) were not built by $dbx and could not be evaluated; they were ignored`,
      });
    }
    return records.filter((record) => predicates.every((predicate) => predicate.matches(record)));
  };

  /**
   * PocketBase's `sort` string: comma-separated field names, `-` for
   * descending. An unknown field simply compares as undefined, the way a
   * missing column sorts in SQLite. Ordering is `compareForSort` — the same
   * comparator SQL `ORDER BY` uses, so numbers sort numerically.
   */
  const applySort = (records: RecordModel[], sort: unknown): RecordModel[] => {
    if (typeof sort !== "string" || sort.trim() === "") {
      return records;
    }
    const terms = sort
      .split(",")
      .map((term) => term.trim())
      .filter((term) => term !== "")
      .map((term) => ({ field: term.replace(/^[-+]/, ""), descending: term.startsWith("-") }));

    return [...records].sort((a, b) => {
      for (const term of terms) {
        const result = compareForSort(readField(a, term.field), readField(b, term.field));
        if (result !== 0) {
          return term.descending ? -result : result;
        }
      }
      return 0;
    });
  };

  const filterRecords = (
    target: unknown,
    filter: unknown,
    sort?: unknown,
    limit?: unknown,
    offset?: unknown,
    params?: unknown
  ): RecordModel[] => {
    let records = rowsOf(target);

    if (typeof filter === "string" && filter.trim() !== "") {
      try {
        const condition = parseCondition(filter);
        const bound = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
        records = records.filter((record) => matchCondition(condition, record, bound));
      } catch (error) {
        if (!(error instanceof ExpressionError)) {
          throw error;
        }
        reportUnsupported(`filter ${JSON.stringify(filter)}: ${error.message}`);
        return [];
      }
    }

    records = applySort(records, sort);

    const start = typeof offset === "number" && offset > 0 ? offset : 0;
    const count = typeof limit === "number" && limit > 0 ? limit : undefined;
    records = records.slice(start, count === undefined ? undefined : start + count);

    return records;
  };

  function reportUnsupported(message: string): void {
    if (strict) {
      throw new UnsupportedQueryError(`[engine] ${message}`);
    }
    warn({ kind: "unsupported-api", api: "app.db", message: `${message}; the query was skipped` });
  }

  /** `app.db().newQuery(sql)` */
  const createQuery = (sql: unknown) => {
    let params: Record<string, unknown> = {};

    const run = (): StatementResult => {
      if (typeof sql !== "string") {
        reportUnsupported("newQuery() expects a SQL string");
        return { rows: [], affected: 0 };
      }
      try {
        const statement = parseStatement(sql);
        const collection = resolveCollection(statement.table);
        return executeStatement(
          statement,
          {
            rows: () => store.records.list(collection.id),
            insert: (values) => store.records.save(new RecordModel(collection, values)),
            remove: (record) => store.records.delete(record),
            persist: (record) => store.records.save(record),
          },
          params
        );
      } catch (error) {
        if (error instanceof UnsupportedQueryError || error instanceof ExpressionError) {
          reportUnsupported(error.message);
          return { rows: [], affected: 0 };
        }
        throw error;
      }
    };

    const assignTo = (target: unknown, value: unknown): unknown => {
      if (target && typeof target === "object" && value && typeof value === "object") {
        Object.assign(target as Record<string, unknown>, value as Record<string, unknown>);
        return target;
      }
      return value;
    };

    const query = {
      bind(values: Record<string, unknown>) {
        params = { ...params, ...(values ?? {}) };
        return query;
      },
      execute() {
        const result = run();
        return { rowsAffected: () => result.affected, lastInsertId: () => 0 };
      },
      all(target?: unknown) {
        const rows = run().rows;
        return target === undefined ? rows : assignTo(target, rows);
      },
      one(target?: unknown) {
        const rows = run().rows;
        if (rows.length === 0) {
          throw new Error(NO_ROWS_ERROR);
        }
        return target === undefined ? rows[0] : assignTo(target, rows[0]);
      },
      row(target?: unknown) {
        return query.one(target);
      },
    };

    return query;
  };

  const methods: Record<string, (...args: any[]) => unknown> = {
    findRecordById(target: unknown, id: unknown) {
      const collection = resolveCollection(target);
      const record = store.records.getById(collection.id, String(id));
      if (!record) {
        throw new Error(`${NO_ROWS_ERROR} (record "${String(id)}" in "${collection.name}")`);
      }
      return record;
    },

    findRecordsByIds(target: unknown, ids: unknown, ...expressions: unknown[]) {
      const collection = resolveCollection(target);
      const wanted = Array.isArray(ids) ? ids.map((id) => String(id)) : [String(ids)];
      const found = wanted
        .map((id) => store.records.getById(collection.id, id))
        .filter((record): record is RecordModel => record !== undefined);
      return applyExpressions(found, expressions);
    },

    findAllRecords(target: unknown, ...expressions: unknown[]) {
      return applyExpressions(rowsOf(target), expressions);
    },

    findFirstRecordByData(target: unknown, key: unknown, value: unknown) {
      const match = rowsOf(target).find((record) =>
        matchCondition(
          {
            kind: "compare",
            operator: "=",
            left: { kind: "field", name: String(key) },
            right: { kind: "value", value },
          },
          record
        )
      );
      if (!match) {
        throw new Error(`${NO_ROWS_ERROR} (${String(key)}=${String(value)})`);
      }
      return match;
    },

    findRecordsByFilter(
      target: unknown,
      filter: unknown,
      sort?: unknown,
      limit?: unknown,
      offset?: unknown,
      params?: unknown
    ) {
      return filterRecords(target, filter, sort, limit, offset, params);
    },

    findFirstRecordByFilter(target: unknown, filter: unknown, params?: unknown) {
      const [first] = filterRecords(target, filter, undefined, 1, 0, params);
      if (!first) {
        throw new Error(`${NO_ROWS_ERROR} (${String(filter)})`);
      }
      return first;
    },

    findAuthRecordByEmail(target: unknown, email: unknown) {
      return methods.findFirstRecordByData(target, "email", email);
    },

    countRecords(target: unknown, ...expressions: unknown[]) {
      return applyExpressions(rowsOf(target), expressions).length;
    },

    db() {
      return { newQuery: (sql: unknown) => createQuery(sql) };
    },

    /**
     * PocketBase hands the callback a transactional app. Everything the
     * runner executes is already inside one transaction, so the callback
     * receives the same app; a throw still rolls the whole migration back.
     */
    runInTransaction(callback: unknown) {
      if (typeof callback === "function") {
        return (callback as (app: unknown) => unknown)(boundApp);
      }
      return undefined;
    },
  };

  let boundApp: unknown;

  return {
    methods,
    bindApp: (app: unknown) => {
      boundApp = app;
    },
  };
}
