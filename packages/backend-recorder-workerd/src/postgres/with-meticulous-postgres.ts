import { type RequestCaptureContext, requestCaptureContext } from "../context";
import { warnOnce } from "../log";
import type { PostgresQueryEvent } from "../protocol";
import {
  isSupportedPostgresJsQuery,
  MAX_POSTGRES_JS_RESULT_SIZE,
  type PostgresJsQueryLike,
  reconstructQueryText,
  resolveRowMode,
  serializePostgresJsArgs,
  serializePostgresJsError,
  serializePostgresJsResult,
} from "./capture";

/**
 * Records postgres.js queries a deployed Worker makes — typically over Hyperdrive, which is the
 * only way a Worker reaches Postgres.
 *
 * There is no seam to patch automatically here. The Node recorder can hook Node's module loader
 * to patch `postgres/{src,cjs/src,cf/src}/query.js`, but a Worker is a single bundle: `postgres`
 * was inlined at build time and never passes through a loader. So the app hands us its client:
 *
 *   const sql = withMeticulousPostgres(postgres(env.HYPERDRIVE.connectionString));
 *
 * Every postgres.js query funnels through one internal method, `Query.prototype.handle`, and this
 * reaches that shared prototype *through the instance* — via a throwaway query, which is free
 * because postgres.js queries are lazy and nothing executes until awaited. One call therefore also
 * covers read-replica clients and any other client in the isolate.
 *
 * Apply it **outermost** if something else also wraps the client (Sentry's
 * `instrumentPostgresJsSql`, a logging proxy): those wrappers return a proxy whose `handle` is
 * still the shared prototype's, so ordering does not change what is captured — but keeping ours
 * outermost matches the Node recorder's contract and stays correct if that ever changes.
 *
 * Record-only, deliberately. A Worker recording is replayed against the app running under Node,
 * where `@alwaysmeticulous/backend-recorder-js` serves these queries from its own mock store —
 * which is why the captured attributes here are exactly the ones that store reads. Outside a
 * recorded request this is a complete pass-through, so it is safe to leave in deployed code.
 *
 * Returns the client unchanged; the patch is on the prototype.
 */
export const withMeticulousPostgres = <Sql>(sql: Sql): Sql => {
  try {
    const prototype = findQueryPrototype(sql);
    if (prototype === undefined) {
      warnOnce(
        "postgres-wrapper-unsupported",
        "withMeticulousPostgres could not reach postgres.js' Query prototype — queries will not be recorded.",
      );
      return sql;
    }
    patchHandle(prototype);
  } catch (error) {
    warnOnce(
      "postgres-wrapper-failed",
      "withMeticulousPostgres failed — queries will not be recorded.",
      error,
    );
  }
  return sql;
};

// Symbol.for so a second copy of the shim (e.g. bundled twice) still detects the patch.
const HANDLE_PATCHED = Symbol.for("meticulous.workerd.postgresJsPatched");

type HandleFn = (this: PostgresJsQueryLike) => unknown;

/**
 * The `Query` prototype, reached by building a query and reading its prototype.
 *
 * `sql.unsafe` is used rather than a tagged template because it takes the text as a plain
 * argument: no interpolation, and postgres.js does not touch a connection until the query is
 * awaited, which nothing here does. The query is discarded.
 */
const findQueryPrototype = (sql: unknown): object | undefined => {
  const unsafe = (sql as { unsafe?: unknown } | null)?.unsafe;
  if (typeof unsafe !== "function") {
    return undefined;
  }
  const probe: unknown = (unsafe as (text: string) => unknown).call(
    sql,
    "select 1",
  );
  if (probe === null || typeof probe !== "object") {
    return undefined;
  }
  const prototype = Object.getPrototypeOf(probe) as object | null;
  if (prototype === null) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "handle");
  return descriptor !== undefined &&
    typeof descriptor.value === "function" &&
    descriptor.configurable === true
    ? prototype
    : undefined;
};

const patchHandle = (prototype: object): void => {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "handle");
  const original = descriptor?.value as HandleFn | undefined;
  if (
    original === undefined ||
    (original as unknown as Record<symbol, unknown>)[HANDLE_PATCHED] === true
  ) {
    return;
  }

  const patched = function (this: PostgresJsQueryLike): unknown {
    // `handle` is reachable from then/catch/finally/execute, so it can be called more than once
    // for one query; postgres.js itself no-ops on the repeats via `executed`. Bail before
    // instrumenting so a query is never captured twice.
    if (this.executed || !isSupportedPostgresJsQuery(this)) {
      return original.call(this);
    }
    const ctx = requestCaptureContext.getStore();
    if (!ctx || ctx.mode !== "record") {
      return original.call(this);
    }
    try {
      captureQuery(ctx, this);
    } catch (error) {
      warnOnce(
        "postgres-capture",
        "Failed to capture a postgres.js query.",
        error,
      );
    }
    return original.call(this);
  };
  Object.defineProperty(patched, HANDLE_PATCHED, {
    value: true,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(prototype, "handle", {
    value: patched,
    writable: true,
    enumerable: false,
    configurable: true,
  });
};

/**
 * Wraps the query's own `resolve`/`reject` so the outcome is captured without the query being
 * awaited here — the same trick the Node instrumentation uses, and the only place a query's input
 * and its result are both visible.
 */
const captureQuery = (
  ctx: RequestCaptureContext,
  query: PostgresJsQueryLike,
): void => {
  const queryText = reconstructQueryText(query.strings);
  if (queryText === undefined) {
    return;
  }
  const startTimeMs = Date.now();
  const base = {
    kind: "postgres" as const,
    requestId: ctx.requestId,
    ...(ctx.frontendSessionId !== undefined
      ? { frontendSessionId: ctx.frontendSessionId }
      : {}),
    traceId: ctx.traceId,
    serverSpanId: ctx.serverSpanId,
    queryText,
    params: serializePostgresJsArgs(query.args),
    rowMode: resolveRowMode(query.isRaw),
    startTimeMs,
  };

  const report = (outcome: Partial<PostgresQueryEvent>): void => {
    try {
      ctx.buffer.add({ ...base, ...outcome, endTimeMs: Date.now() });
    } catch (error) {
      warnOnce(
        "postgres-report",
        "Failed to report a postgres.js query.",
        error,
      );
    }
  };

  const originalResolve = query.resolve;
  const originalReject = query.reject;
  query.resolve = (result: unknown) => {
    // A result that cannot be serialized is simply not captured → it misses during replay and
    // errors hermetically, rather than serving something wrong.
    let json: string | undefined;
    try {
      json = serializePostgresJsResult(result);
    } catch {
      json = undefined;
    }
    report(
      json === undefined
        ? {}
        : {
            result: {
              body:
                json.length > MAX_POSTGRES_JS_RESULT_SIZE
                  ? json.slice(0, MAX_POSTGRES_JS_RESULT_SIZE)
                  : json,
              truncated: json.length > MAX_POSTGRES_JS_RESULT_SIZE,
            },
          },
    );
    return originalResolve.call(query, result);
  };
  query.reject = (error: unknown) => {
    let errorJson: string | undefined;
    try {
      errorJson = serializePostgresJsError(error);
    } catch {
      errorJson = undefined;
    }
    report(errorJson === undefined ? {} : { errorJson });
    return originalReject.call(query, error);
  };
};
