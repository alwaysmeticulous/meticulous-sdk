import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type MeticulousExecutionContext,
  withMeticulous,
  withMeticulousPagesFunction,
} from "../index";
import type { CaptureEvent, CaptureEventsPayload } from "../protocol";

/**
 * How a **deployed** Worker records: the sidecar is reached through a service binding rather than
 * a URL, since there is no sidecar process at the edge.
 *
 * The fake binding below is what a Cloudflare service binding is from the shim's point of view —
 * an object with a `fetch` — so these tests exercise the real transport path. The upstream API is
 * a real local server, so the capture tee, the body clones and the batching all run unmodified.
 */

let upstreamServer: http.Server;
let upstreamUrl: string;

interface FakeSidecarBinding {
  fetch: (...args: unknown[]) => Promise<Response>;
  batches: CaptureEvent[][];
  urls: string[];
}

const makeSidecarBinding = (): FakeSidecarBinding => {
  const batches: CaptureEvent[][] = [];
  const urls: string[] = [];
  return {
    batches,
    urls,
    fetch: async (...args: unknown[]) => {
      const request = args[0] as Request;
      urls.push(request.url);
      const payload = (await request.json()) as CaptureEventsPayload;
      batches.push(payload.events);
      return new Response(null, { status: 204 });
    },
  };
};

const makeCtx = (): MeticulousExecutionContext & {
  drain: () => Promise<void>;
} => {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    },
    drain: async () => {
      let settled = 0;
      while (settled < pending.length) {
        const batch = pending.slice(settled);
        settled = pending.length;
        await Promise.allSettled(batch);
      }
    },
  };
};

beforeAll(async () => {
  upstreamServer = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) =>
    upstreamServer.listen(0, "127.0.0.1", resolve),
  );
  upstreamUrl = `http://127.0.0.1:${
    (upstreamServer.address() as AddressInfo).port
  }`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    upstreamServer.close((err) => (err ? reject(err) : resolve())),
  );
});

let sidecar: FakeSidecarBinding;

beforeEach(() => {
  sidecar = makeSidecarBinding();
});

describe("recording through a sidecar service binding", () => {
  it("reports a request's events in one batch through the binding", async () => {
    const handler = withMeticulous({
      fetch: async (
        _request: Request,
        _env: never,
        _ctx: MeticulousExecutionContext,
      ) => {
        await fetch(`${upstreamUrl}/a`);
        await fetch(`${upstreamUrl}/b`);
        return new Response("done", { status: 200 });
      },
    });

    const ctx = makeCtx();
    const response = await handler.fetch(
      new Request("http://worker.local/page", {
        headers: { "x-meticulous-session-id": "fs-binding" },
      }),
      { METICULOUS_SIDECAR: sidecar } as never,
      ctx,
    );
    await ctx.drain();

    expect(await response.text()).toBe("done");
    // Three events (one inbound, two outbound) in a single binding call.
    expect(sidecar.batches).toHaveLength(1);
    expect(sidecar.batches[0]).toHaveLength(3);
    expect(sidecar.urls[0]).toBe(
      "https://meticulous-sidecar.invalid/v1/events",
    );
  });

  it("stamps every event of a request with one trace and server span id", async () => {
    const handler = withMeticulous({
      fetch: async (
        _request: Request,
        _env: never,
        _ctx: MeticulousExecutionContext,
      ) => {
        await fetch(`${upstreamUrl}/a`);
        return new Response("done");
      },
    });

    const ctx = makeCtx();
    await handler.fetch(
      new Request("http://worker.local/page"),
      { METICULOUS_SIDECAR: sidecar } as never,
      ctx,
    );
    await ctx.drain();

    const events = sidecar.batches.flat();
    expect(events).toHaveLength(2);
    const traceIds = new Set(events.map((event) => event.traceId));
    const serverSpanIds = new Set(events.map((event) => event.serverSpanId));
    // One trace per request, shared by the SERVER span and every CLIENT span under it. Minted
    // here rather than by the sidecar so a sidecar evicted mid-request cannot split the trace.
    expect(traceIds.size).toBe(1);
    expect(serverSpanIds.size).toBe(1);
    expect([...traceIds][0]).toMatch(/^[0-9a-f]{32}$/);
    expect([...serverSpanIds][0]).toMatch(/^[0-9a-f]{16}$/);
  });

  it("gives two requests different traces", async () => {
    const handler = withMeticulous({
      fetch: (
        _request: Request,
        _env: never,
        _ctx: MeticulousExecutionContext,
      ) => Promise.resolve(new Response("ok")),
    });

    for (const path of ["/one", "/two"]) {
      const ctx = makeCtx();
      await handler.fetch(
        new Request(`http://worker.local${path}`),
        { METICULOUS_SIDECAR: sidecar } as never,
        ctx,
      );
      await ctx.drain();
    }

    const traceIds = sidecar.batches.flat().map((event) => event.traceId);
    expect(traceIds).toHaveLength(2);
    expect(new Set(traceIds).size).toBe(2);
  });

  it("never records the sidecar binding's own traffic", async () => {
    // The sidecar binding is Fetcher-shaped and sits on `env`, so the binding patch would
    // discover it and record every report — an infinite regress. It is excluded by identity.
    const handler = withMeticulous({
      fetch: (
        _request: Request,
        _env: never,
        _ctx: MeticulousExecutionContext,
      ) => Promise.resolve(new Response("ok")),
    });

    const ctx = makeCtx();
    await handler.fetch(
      new Request("http://worker.local/page"),
      { METICULOUS_SIDECAR: sidecar } as never,
      ctx,
    );
    await ctx.drain();
    // Draining the report can enqueue more work if the report itself was captured.
    await ctx.drain();

    const kinds = sidecar.batches.flat().map((event) => event.kind);
    expect(kinds).toEqual(["inbound"]);
  });

  it("excludes the sidecar binding even under a non-default name", async () => {
    const handler = withMeticulous(
      {
        fetch: (
          _request: Request,
          _env: never,
          _ctx: MeticulousExecutionContext,
        ) => Promise.resolve(new Response("ok")),
      },
      { sidecarBinding: sidecar },
    );

    const ctx = makeCtx();
    await handler.fetch(
      new Request("http://worker.local/page"),
      { OUR_TELEMETRY: sidecar } as never,
      ctx,
    );
    await ctx.drain();
    await ctx.drain();

    expect(sidecar.batches.flat().map((event) => event.kind)).toEqual([
      "inbound",
    ]);
  });

  it("records a Pages Functions handler the same way", async () => {
    // A Pages project's worker exports onRequest(context), not { fetch }, so it needs its own
    // adapter — every Pages app is in this shape.
    const onRequest = withMeticulousPagesFunction(
      async (context: {
        request: Request;
        env: { METICULOUS_SIDECAR: FakeSidecarBinding };
        waitUntil: (promise: Promise<unknown>) => void;
        params: Record<string, string>;
      }) => {
        await fetch(`${upstreamUrl}/from-pages`);
        return new Response(`params:${Object.keys(context.params).length}`);
      },
    );

    const ctx = makeCtx();
    const response = await onRequest({
      request: new Request("http://pages.local/page", {
        headers: { "x-meticulous-session-id": "fs-pages" },
      }),
      env: { METICULOUS_SIDECAR: sidecar },
      waitUntil: (promise) => ctx.waitUntil(promise),
      // Passed through untouched: the adapter only reads request/env/waitUntil.
      params: { path: "page" },
    });
    await ctx.drain();

    expect(await response.text()).toBe("params:1");
    const events = sidecar.batches.flat();
    expect(events.map((event) => event.kind).sort()).toEqual([
      "inbound",
      "outbound",
    ]);
    expect(
      events.every((event) => event.frontendSessionId === "fs-pages"),
    ).toBe(true);
  });

  it("is a pass-through when no sidecar is configured", async () => {
    const handler = withMeticulous({
      fetch: (
        _request: Request,
        _env: never,
        _ctx: MeticulousExecutionContext,
      ) => Promise.resolve(new Response("plain")),
    });

    const ctx = makeCtx();
    const response = await handler.fetch(
      new Request("http://worker.local/"),
      {} as never,
      ctx,
    );
    await ctx.drain();

    expect(await response.text()).toBe("plain");
    expect(sidecar.batches).toHaveLength(0);
  });

  it("does not let an unreachable sidecar binding affect the app", async () => {
    const broken: FakeSidecarBinding = {
      batches: [],
      urls: [],
      fetch: () => Promise.reject(new Error("binding is down")),
    };
    const handler = withMeticulous({
      fetch: (
        _request: Request,
        _env: never,
        _ctx: MeticulousExecutionContext,
      ) => Promise.resolve(new Response("still fine", { status: 201 })),
    });

    const ctx = makeCtx();
    const response = await handler.fetch(
      new Request("http://worker.local/"),
      { METICULOUS_SIDECAR: broken } as never,
      ctx,
    );
    // A rejection escaping into waitUntil would surface as an unhandled rejection in the app.
    await expect(ctx.drain()).resolves.toBeUndefined();

    expect(response.status).toBe(201);
    expect(await response.text()).toBe("still fine");
  });
});
