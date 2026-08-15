import postgres from "postgres";
import { beforeEach, describe, expect, it } from "vitest";
import { CaptureBuffer } from "../capture-buffer";
import { type RequestCaptureContext, requestCaptureContext } from "../context";
import type { CaptureEvent, PostgresQueryEvent } from "../protocol";
import { withMeticulousPostgres } from "../postgres/with-meticulous-postgres";
import type { SidecarFetcher, SidecarTransport } from "../sidecar-transport";

/**
 * Drives the real `postgres` package — never connecting, only building queries and settling them
 * by hand. That matters: `withMeticulousPostgres` reaches `Query.prototype` *through an instance*,
 * so a hand-rolled fake would not prove the one thing that can break when postgres.js changes.
 *
 * A query is settled by calling the `resolve`/`reject` the wrapper installed, which is exactly
 * what postgres.js' connection handling does once rows arrive.
 */

interface CapturedBatch {
  events: CaptureEvent[];
}

const makeSidecar = (): SidecarFetcher & { batches: CapturedBatch[] } => {
  const batches: CapturedBatch[] = [];
  return {
    batches,
    fetch: async (...args: unknown[]) => {
      batches.push((await (args[0] as Request).json()) as CapturedBatch);
      return new Response(null, { status: 204 });
    },
  };
};

let sidecar: ReturnType<typeof makeSidecar>;
let transport: SidecarTransport;
let pending: Promise<unknown>[];
let ctx: RequestCaptureContext;

const drain = async (): Promise<void> => {
  await ctx.buffer.close();
  await Promise.allSettled(pending);
};

const postgresEvents = (): PostgresQueryEvent[] =>
  sidecar.batches
    .flatMap((batch) => batch.events)
    .filter((event): event is PostgresQueryEvent => event.kind === "postgres");

beforeEach(() => {
  sidecar = makeSidecar();
  transport = { kind: "binding", fetcher: sidecar, instance: sidecar };
  pending = [];
  const waitUntil = (promise: Promise<unknown>): void => {
    pending.push(promise);
  };
  ctx = {
    mode: "record",
    requestId: "req-pg",
    frontendSessionId: "fs-pg",
    transport,
    buffer: new CaptureBuffer(transport, waitUntil),
    traceId: "0".repeat(32),
    serverSpanId: "1".repeat(16),
    waitUntil,
  };
});

/**
 * A `sql` client that never connects. `host` is a path that cannot resolve, and no query here is
 * ever awaited, so postgres.js never opens a socket.
 */
const makeSql = (): postgres.Sql => postgres({ host: "/nonexistent" });

/** Settles a query the way postgres.js' connection would, then flushes the buffer. */
const settle = async (
  query: unknown,
  outcome: { resolve: unknown } | { reject: unknown },
): Promise<void> => {
  const settleable = query as {
    handle: () => unknown;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
    executed?: boolean;
  };
  // `handle` is what the wrapper patched; postgres.js calls it when the query is awaited.
  settleable.handle();
  if ("resolve" in outcome) {
    settleable.resolve(outcome.resolve);
  } else {
    settleable.reject(outcome.reject);
  }
  await drain();
};

/** A postgres.js `Result`: an Array subclass carrying its metadata as own properties. */
const makeResult = (
  rows: unknown[],
  meta: { count: number; command: string },
): unknown[] => {
  const result = [...rows];
  Object.defineProperties(result, {
    count: { value: meta.count },
    command: { value: meta.command },
    columns: { value: [{ name: "id", type: 23, table: 1, number: 1 }] },
    statement: { value: null },
    state: { value: { pid: 1, secret: 2 } },
  });
  return result;
};

describe("withMeticulousPostgres", () => {
  it("records a query's text, params and result", async () => {
    const sql = withMeticulousPostgres(makeSql());

    await requestCaptureContext.run(ctx, async () => {
      const query = sql`select * from users where id = ${42} and org = ${"acme"}`;
      await settle(query, {
        resolve: makeResult([{ id: 42 }], { count: 1, command: "SELECT" }),
      });
    });

    const [event] = postgresEvents();
    expect(event).toMatchObject({
      kind: "postgres",
      frontendSessionId: "fs-pg",
      traceId: "0".repeat(32),
      serverSpanId: "1".repeat(16),
      // Placeholders, not the values: postgres.js only builds the real SQL once a query reaches a
      // connection, and replay never gets that far, so both sides derive the text this way.
      queryText: "select * from users where id = $1 and org = $2",
      params: '[42,"acme"]',
      rowMode: "",
    });
    // The five non-enumerable metadata fields survive; `state` (a live connection handle) and
    // each column's `parser` are dropped on purpose.
    const result = JSON.parse(event.result?.body ?? "null") as Record<
      string,
      unknown
    >;
    expect(result).toMatchObject({
      rows: [{ id: 42 }],
      count: 1,
      command: "SELECT",
    });
    expect(result).not.toHaveProperty("state");
    expect(event.result?.truncated).toBe(false);
    expect(event.errorJson).toBeUndefined();
  });

  it("records the row mode a typed select asks for", async () => {
    const sql = withMeticulousPostgres(makeSql());

    await requestCaptureContext.run(ctx, async () => {
      // Drizzle's postgres-js driver calls `.values()` for typed selects, and the same SQL then
      // returns arrays rather than objects — which is why the mode is part of the match key.
      const query = sql`select id from users`.values();
      await settle(query, {
        resolve: makeResult([[1]], { count: 1, command: "SELECT" }),
      });
    });

    expect(postgresEvents()[0].rowMode).toBe("values");
  });

  it("records a rejection so it replays as the same failure", async () => {
    const sql = withMeticulousPostgres(makeSql());

    await requestCaptureContext.run(ctx, async () => {
      const query = sql`insert into users (id) values (${1})`;
      // A postgres.js query is itself a promise, so the rejection needs a consumer or it
      // surfaces as an unhandled rejection.
      const awaited = expect(query).rejects.toThrow("duplicate key value");
      const error = Object.assign(new Error("duplicate key value"), {
        name: "PostgresError",
        code: "23505",
        severity: "ERROR",
      });
      await settle(query, { reject: error });
      await awaited;
    });

    const [event] = postgresEvents();
    expect(event.result).toBeUndefined();
    // Without this the query would replay as a hermetic miss, rendering a different page.
    const captured = JSON.parse(event.errorJson ?? "null") as Record<
      string,
      unknown
    >;
    expect(captured).toMatchObject({
      name: "PostgresError",
      message: "duplicate key value",
      code: "23505",
      severity: "ERROR",
    });
    // Recorded-process-specific and misleading replayed elsewhere.
    expect(captured).not.toHaveProperty("stack");
  });

  it("records nothing outside a recorded request", async () => {
    const sql = withMeticulousPostgres(makeSql());

    const query = sql`select 1`;
    await settle(query, {
      resolve: makeResult([], { count: 0, command: "SELECT" }),
    });

    expect(postgresEvents()).toHaveLength(0);
  });

  it("captures a query once even though handle can be called repeatedly", async () => {
    const sql = withMeticulousPostgres(makeSql());

    await requestCaptureContext.run(ctx, async () => {
      const query = sql`select 1` as unknown as {
        handle: () => unknown;
        resolve: (value: unknown) => void;
      };
      // then/catch/finally/execute all route through `handle`; postgres.js no-ops the repeats via
      // `executed`, and the wrapper has to bail on them too or the query records twice.
      query.handle();
      query.handle();
      query.resolve(makeResult([], { count: 0, command: "SELECT" }));
      await drain();
    });

    expect(postgresEvents()).toHaveLength(1);
  });

  it("leaves the query's own resolution untouched", async () => {
    const sql = withMeticulousPostgres(makeSql());
    const rows = makeResult([{ id: 7 }], { count: 1, command: "SELECT" });

    await requestCaptureContext.run(ctx, async () => {
      const query = sql`select id from users`;
      const awaited = (query as unknown as Promise<unknown>).then((v) => v);
      await settle(query, { resolve: rows });
      // Capture must be a pure tee: the app still receives the identical Result instance.
      await expect(awaited).resolves.toBe(rows);
    });
  });

  it("returns the client unchanged and survives a client it cannot patch", () => {
    const sql = makeSql();
    expect(withMeticulousPostgres(sql)).toBe(sql);
    // A non-client must not throw — recording is best-effort, never load-bearing.
    expect(withMeticulousPostgres({})).toEqual({});
    expect(withMeticulousPostgres(undefined)).toBeUndefined();
  });
});
