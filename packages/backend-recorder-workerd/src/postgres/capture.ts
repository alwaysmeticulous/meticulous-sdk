import { serializeCapturedError } from "../error-capture";

/**
 * The record-side contract for postgres.js (the `postgres` npm package), shared by the Node
 * recorder's `met-postgres-js-instrumentation/` and the in-worker `withMeticulousPostgres`.
 *
 * It lives in this package for the same reason `kv-capture.ts` does: a query recorded from a
 * deployed Worker has to produce the byte-identical span a Node-recorded one does, because
 * `PostgresJsMockStore` derives its match key from those attributes at load time. Get the
 * serialization subtly wrong on one surface and every replay of a Worker recording misses.
 * `packages/backend-recorder-js/src/postgres-js-capture-shared.ts` re-exports everything here
 * and keeps the replay half (key building, result/error reconstruction) to itself — that half
 * needs a synchronous SHA-256 and never runs inside a Worker.
 */

// Custom Meticulous span attributes carrying the query input + result. Kept distinct from the
// `pg` attributes (`meticulous.pg.*`) so the two stores can never match each other's spans,
// even though both talk to Postgres.
export const POSTGRES_JS_QUERY_TEXT_ATTR = "meticulous.postgresjs.query.text";
export const POSTGRES_JS_QUERY_PARAMS_ATTR =
  "meticulous.postgresjs.query.params";
export const POSTGRES_JS_ROW_MODE_ATTR = "meticulous.postgresjs.row_mode";
export const POSTGRES_JS_RESULT_ATTR = "meticulous.postgresjs.result";
export const POSTGRES_JS_RESULT_TRUNCATED_ATTR =
  "meticulous.postgresjs.result.truncated";
// Set instead of `result` when the query rejected, so a query that legitimately errors (a
// constraint violation, a missing relation) replays as the same error rather than as a "no
// recorded result" miss.
export const POSTGRES_JS_ERROR_ATTR = "meticulous.postgresjs.error";

// Cap the captured result to bound span size, matching the HTTP/undici/pg 256 KB cap.
export const MAX_POSTGRES_JS_RESULT_SIZE = 256 * 1024;

/**
 * How the rows of a result are shaped: objects keyed by column name by default, or arrays under
 * `.values()` / `.raw()`. postgres.js records this on the query as `isRaw` (`undefined` |
 * `true` | `"values"`).
 *
 * This belongs in the match key because the SAME sql text returns different row shapes
 * depending on it — Drizzle's postgres-js driver calls `.values()` for typed selects but awaits
 * the query directly for `db.execute`, so both shapes occur for identical text.
 */
export type PostgresJsRowMode = "" | "raw" | "values";

export const resolveRowMode = (isRaw: unknown): PostgresJsRowMode => {
  if (isRaw === "values") {
    return "values";
  }
  return isRaw ? "raw" : "";
};

/**
 * Rebuilds the SQL text from a tagged template's literal chunks, with `$1`, `$2`… where the
 * interpolated values went.
 *
 * The SQL text does not exist at interception time: postgres.js builds `query.string` only once
 * a query reaches a connection, and replay never executes, so both sides must derive the text
 * from `query.strings` instead.
 */
export const reconstructQueryText = (strings: unknown): string | undefined => {
  if (!Array.isArray(strings) || strings.length === 0) {
    return undefined;
  }
  let text = "";
  for (let i = 0; i < strings.length; i++) {
    const chunk = strings[i];
    if (typeof chunk !== "string") {
      return undefined;
    }
    text += i === 0 ? chunk : `$${i}${chunk}`;
  }
  return text;
};

/**
 * Canonical serialization of the query's interpolated values.
 *
 * Read from `query.args` (the raw JS values), never `query.parameters`: the latter does not
 * exist until postgres.js builds the statement, and its `Bind` step then mutates it in place
 * into wire-format strings — so it differs between the two sides.
 *
 * `args` is heterogeneous: postgres.js' dynamic helpers put `Builder` / `Identifier` /
 * `Parameter` instances in there alongside plain values. JSON-encoding them is stable across
 * calls, which is all the match key needs.
 */
export const serializePostgresJsArgs = (args: unknown): string => {
  try {
    return JSON.stringify(Array.isArray(args) ? args : []);
  } catch {
    return "[]";
  }
};

/** The leading SQL keyword, for the span name only. */
export const postgresJsCommandOf = (text: string): string =>
  /^\s*([a-z]+)/i.exec(text)?.[1]?.toLowerCase() ?? "query";

interface SerializedPostgresJsResult {
  rows: unknown[];
  count: number | null;
  command: string | null;
  columns: { name: string; type: number; table: number; number: number }[];
  statement: { string: string; types: number[]; name: string } | null;
}

/**
 * The metadata postgres.js hangs off a `Result`. Declared with `unknown` values so the
 * serializer below narrows every field rather than trusting the shape.
 */
interface PostgresJsResultLike {
  count?: unknown;
  command?: unknown;
  columns?: unknown;
  statement?: unknown;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" ? value : null;

/**
 * postgres.js resolves a query with a `Result` — an `Array` subclass whose metadata lives in
 * five non-enumerable own properties, so `JSON.stringify` would capture only the rows. Pull them
 * out explicitly.
 *
 * Two fields are dropped on purpose: each column's `parser` (a function, so it can't survive
 * JSON, and consumers never call it on an already-parsed row) and `state` (a live
 * per-connection `{pid, secret}` handle used only for query cancellation, which is meaningless
 * without a connection).
 */
const serializeOneResult = (res: unknown): SerializedPostgresJsResult => {
  const meta = res as PostgresJsResultLike | null | undefined;
  const statement = asRecord(meta?.statement);
  return {
    rows: Array.isArray(res) ? [...(res as unknown[])] : [],
    count: numberOrNull(meta?.count),
    command: typeof meta?.command === "string" ? meta.command : null,
    columns: Array.isArray(meta?.columns)
      ? meta.columns.map((column) => {
          const c = asRecord(column);
          return {
            name: String(c.name ?? ""),
            type: numberOrNull(c.type) ?? 0,
            table: numberOrNull(c.table) ?? 0,
            number: numberOrNull(c.number) ?? 0,
          };
        })
      : [],
    statement:
      meta?.statement != null
        ? {
            string: String(statement.string ?? ""),
            types: Array.isArray(statement.types)
              ? (statement.types as number[])
              : [],
            name: String(statement.name ?? ""),
          }
        : null,
  };
};

/**
 * Serializes a postgres.js result (or the array form a multi-statement / `simple` query resolves
 * to) to a JSON string for storage as a span attribute.
 */
export const serializePostgresJsResult = (result: unknown): string => {
  // A Result IS an Array, so an array-of-Results is only distinguishable by its elements. The
  // `length > 0` guard matters: `[].every(...)` is true, so without it every zero-row result (a
  // SELECT that matched nothing, an INSERT without RETURNING, BEGIN/COMMIT) would be mistaken
  // for an empty list of results and lose its `count`/`command`.
  const isMultiple =
    Array.isArray(result) &&
    result.length > 0 &&
    result.every((r) => isResultLike(r));
  const serialized = isMultiple
    ? (result as unknown[]).map(serializeOneResult)
    : serializeOneResult(result);
  return JSON.stringify(serialized);
};

// A `Result` carries `command`/`count` own properties; a plain row object or scalar does not.
const isResultLike = (value: unknown): boolean =>
  Array.isArray(value) &&
  Object.prototype.hasOwnProperty.call(value, "command") &&
  Object.prototype.hasOwnProperty.call(value, "count");

// Own properties postgres.js attaches to a query error for debugging. Excluded from the
// captured error: they are large, redundant with the query attributes we already record, and
// only enumerable when the app enabled postgres.js' `debug` option.
const ERROR_DEBUG_PROPS = new Set([
  "stack",
  "query",
  "parameters",
  "args",
  "types",
]);

/**
 * Captures a rejected query's error as a JSON string. postgres.js surfaces server errors as
 * `PostgresError` (`extends Error`, with the server's `code`/`severity`/`detail`/… fields
 * `Object.assign`ed on) and transport/validation failures as plain `Error`s carrying `code`. All
 * of those live in own enumerable properties, so copying those plus `message` (own but
 * non-enumerable, from the `Error` constructor) captures everything a consumer inspects.
 */
export const serializePostgresJsError = (error: unknown): string =>
  serializeCapturedError(error, ERROR_DEBUG_PROPS);

/**
 * The shape of postgres.js' internal `Query` that both sides rely on. Declared structurally (no
 * `postgres` dependency).
 */
export interface PostgresJsQueryLike {
  /** Template chunks: the literal parts of a tagged template, or `[text]` for `unsafe`. */
  strings: unknown;
  /** The interpolated values, still raw JS values at interception time. */
  args: unknown;
  /** `undefined` by default, `true` after `.raw()`, `"values"` after `.values()`. */
  isRaw?: unknown;
  /** Set once `handle()` has run; guards against double-instrumenting one query. */
  executed?: boolean;
  /** Set by `.describe()` — resolves with a Statement, not a Result. */
  onlyDescribe?: boolean;
  /** Set by `.cursor()` / `.forEach()` / `.readable()` — streaming, not a single Result. */
  cursorFn?: unknown;
  cursorRows?: unknown;
  forEachFn?: unknown;
  streaming?: unknown;
  options?: {
    /**
     * Present only on the implicit `begin` query `sql.begin()` issues. postgres.js needs it
     * called with the serving connection before the transaction body runs.
     */
    onexecute?: (connection: unknown) => void;
    [key: string]: unknown;
  };
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
}

/**
 * Whether a query resolves with a single `Result` we can capture and replay. Cursors,
 * `.forEach()`, `.readable()`/`.writable()` (COPY streams) and `.describe()` resolve with
 * something else, and `sql.file()` is constructed with no template chunks at all (its text is
 * only read from disk later). All of those pass straight through, unrecorded and unmocked.
 */
export const isSupportedPostgresJsQuery = (
  query: PostgresJsQueryLike,
): boolean =>
  reconstructQueryText(query.strings) != null &&
  !query.onlyDescribe &&
  !query.streaming &&
  query.cursorFn == null &&
  query.cursorRows == null &&
  query.forEachFn == null;
