import { z } from "zod";
import type { RuleExpression } from "../utils/permissions";
import { defineCollection } from "./base";

/**
 * Permission rules that apply to a view collection
 *
 * View collections are read-only: PocketBase rejects createRule, updateRule,
 * deleteRule and manageRule on them, so only the two read rules are accepted.
 */
export interface ViewPermissionSchema {
  /** Controls who can list/query the view's rows */
  listRule?: RuleExpression;

  /** Controls who can view an individual row */
  viewRule?: RuleExpression;
}

/**
 * Configuration options for defining a view collection
 */
export interface ViewCollectionConfig {
  /**
   * The name of the PocketBase collection
   */
  collectionName: string;

  /**
   * The Zod schema describing the shape of a row
   *
   * For views this is used for TypeScript type generation and application-side
   * parsing only - PocketBase derives the collection's actual fields from the
   * SQL query when the collection is saved.
   */
  schema: z.ZodObject<any>;

  /**
   * The SQL SELECT statement backing the view
   *
   * Use the `sql` tagged template for consistent formatting.
   */
  viewQuery: string;

  /**
   * Optional read permissions (listRule / viewRule)
   */
  permissions?: ViewPermissionSchema;
}

/**
 * Removes the common leading indentation from a multi-line string and trims
 * blank leading/trailing lines
 *
 * Keeps generated migrations stable when a query is re-indented in the source
 * file, since only the relative indentation is preserved. Also used when
 * reading a query back out of a migration file, where the generator has
 * indented it to fit the surrounding code.
 *
 * @param value - Raw multi-line string
 * @returns Dedented string
 */
export function dedentSql(value: string): string {
  const lines = value.replace(/\r\n/g, "\n").split("\n");

  // Drop leading and trailing blank lines
  while (lines.length > 0 && lines[0].trim() === "") {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  if (lines.length === 0) {
    return "";
  }

  // Find the smallest indentation across all non-blank lines
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const indent = line.length - line.trimStart().length;
    if (indent < minIndent) {
      minIndent = indent;
    }
  }

  if (!Number.isFinite(minIndent) || minIndent === 0) {
    return lines.map((line) => line.trimEnd()).join("\n");
  }

  return lines.map((line) => line.slice(minIndent).trimEnd()).join("\n");
}

/**
 * Tagged template for SQL view queries
 *
 * Interpolates values, strips the common leading indentation and trims blank
 * leading/trailing lines. Returns a plain string, so a regular string literal
 * works anywhere `sql` does.
 *
 * @example
 * const query = sql`
 *   SELECT p.id AS id, p.title AS title
 *     FROM Projects p
 * `;
 * // "SELECT p.id AS id, p.title AS title\n  FROM Projects p"
 */
export function sql(strings: TemplateStringsArray, ...values: Array<string | number>): string {
  let result = "";

  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += String(values[i]);
    }
  }

  return dedentSql(result);
}

/**
 * Strips SQL comments and leading whitespace so the first real token can be checked
 *
 * @param query - The SQL query
 * @returns The query with leading comments and whitespace removed
 */
function stripLeadingComments(query: string): string {
  let remaining = query.trim();

  // Repeatedly strip line comments (-- ...) and block comments (/* ... */)
  while (remaining.length > 0) {
    if (remaining.startsWith("--")) {
      const newline = remaining.indexOf("\n");
      remaining = newline === -1 ? "" : remaining.slice(newline + 1).trim();
      continue;
    }

    if (remaining.startsWith("/*")) {
      const end = remaining.indexOf("*/");
      remaining = end === -1 ? "" : remaining.slice(end + 2).trim();
      continue;
    }

    break;
  }

  return remaining;
}

/**
 * Validates a view query, throwing with an actionable message when it can't work
 *
 * @param collectionName - Collection name, used in error messages
 * @param viewQuery - The SQL query to validate
 */
export function validateViewQuery(collectionName: string, viewQuery: unknown): asserts viewQuery is string {
  if (typeof viewQuery !== "string" || viewQuery.trim() === "") {
    throw new Error(
      `View collection "${collectionName}" requires a non-empty viewQuery. ` +
        `Provide the SQL SELECT statement backing the view.`
    );
  }

  const body = stripLeadingComments(viewQuery);
  if (!/^(select|with)\b/i.test(body)) {
    throw new Error(
      `View collection "${collectionName}" has an invalid viewQuery: it must start with SELECT or WITH. ` +
        `Received: ${body.slice(0, 40)}${body.length > 40 ? "..." : ""}`
    );
  }
}

/**
 * Defines a read-only PocketBase view collection backed by a SQL query
 *
 * PocketBase derives the collection's fields by running the query, so the Zod
 * schema only describes the shape for TypeScript types and application-side
 * parsing. Views cannot have indexes and only support listRule / viewRule.
 *
 * The generated migration creates the collection with `type: "view"` and the
 * query; changing the SQL later produces an in-place `viewQuery` update, which
 * keeps the collection id stable.
 *
 * @param config - View collection configuration
 * @returns The schema with view metadata attached
 *
 * @example
 * export default defineView({
 *   collectionName: "ProjectStats",
 *   schema: ProjectStatsSchema,
 *   viewQuery: sql`
 *     SELECT p.OwnerUser AS id,
 *            p.OwnerUser AS OwnerUser,
 *            COUNT(*)    AS projectCount
 *       FROM Projects p
 *      GROUP BY p.OwnerUser
 *   `,
 *   permissions: {
 *     listRule: "OwnerUser = @request.auth.id",
 *     viewRule: "OwnerUser = @request.auth.id",
 *   },
 * });
 *
 * @example
 * // Requirements PocketBase places on the query:
 * // - the outermost SELECT must expose an `id` column
 * // - a relation column must be selected bare (e.g. `p.OwnerUser AS OwnerUser`)
 * //   from the outer table for PocketBase to infer it as a relation field
 * // - no top-level UNION (wrap unions in a subquery)
 */
export function defineView(config: ViewCollectionConfig): z.ZodObject<any> {
  const { collectionName, schema, viewQuery, permissions } = config;

  validateViewQuery(collectionName, viewQuery);

  return defineCollection({
    collectionName,
    schema,
    type: "view",
    viewQuery,
    // Write rules are always locked for views - PocketBase rejects anything else
    permissions: {
      listRule: permissions?.listRule ?? null,
      viewRule: permissions?.viewRule ?? null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    },
  });
}
