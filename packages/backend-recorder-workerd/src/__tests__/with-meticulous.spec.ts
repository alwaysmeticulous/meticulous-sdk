import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type MeticulousExecutionContext,
  getMeticulousSessionId,
  withMeticulous,
} from "../index";
import {
  type CaptureEvent,
  type CaptureEventsPayload,
  SIDECAR_PROTOCOL_VERSION,
  WORKERD_SHIM_VERSION_HEADER,
} from "../protocol";
import { WORKERD_SHIM_VERSION } from "../version";

/**
 * In-Node integration test: one local HTTP server acts as the fake sidecar
 * (collecting /v1/events POSTs) and a second, separate-origin server as the
 * fake upstream API — separate because the shim's self-capture guard skips
 * anything on the sidecar's own origin. Node 20 provides
 * fetch/Request/Response/AsyncLocalStorage, so the whole shim runs unmodified.
 */

let sidecarServer: http.Server;
let upstreamServer: http.Server;
let sidecarUrl: string;
let upstreamUrl: string;
let receivedEvents: CaptureEvent[] = [];
let receivedProtocolVersions: (string | string[] | undefined)[] = [];
/** Events per POST, so batching can be asserted rather than only its side effects. */
let receivedBatchSizes: number[] = [];

const listen = async (server: http.Server): Promise<string> => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

const close = (server: http.Server): Promise<void> =>
  new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );

beforeAll(async () => {
  sidecarServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/v1/events") {
        receivedProtocolVersions.push(
          req.headers["x-meticulous-sidecar-protocol-version"],
        );
        const payload = JSON.parse(
          Buffer.concat(chunks).toString("utf-8"),
        ) as CaptureEventsPayload;
        receivedEvents.push(...payload.events);
        receivedBatchSizes.push(payload.events.length);
        res.writeHead(204).end();
        return;
      }
      if (req.url === "/v1/health") {
        res.writeHead(200).end('{"ok":true}');
        return;
      }
      res.writeHead(404).end();
    });
  });
  upstreamServer = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res
        .writeHead(201, { "content-type": "application/json" })
        .end(JSON.stringify({ created: true }));
    });
  });
  [sidecarUrl, upstreamUrl] = await Promise.all([
    listen(sidecarServer),
    listen(upstreamServer),
  ]);
});

afterAll(async () => {
  await Promise.all([close(sidecarServer), close(upstreamServer)]);
});

beforeEach(() => {
  receivedEvents = [];
  receivedProtocolVersions = [];
  receivedBatchSizes = [];
});

/** ExecutionContext stub that lets tests await all background capture work. */
const makeCtx = (): MeticulousExecutionContext & {
  drain: () => Promise<void>;
} => {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    },
    drain: async () => {
      // Draining can enqueue more work (e.g. the outbound body read posts an
      // event), so loop until stable.
      let settled = 0;
      while (settled < pending.length) {
        const batch = pending.slice(settled);
        settled = pending.length;
        await Promise.allSettled(batch);
      }
    },
  };
};

const eventsOfKind = (kind: CaptureEvent["kind"]): CaptureEvent[] =>
  receivedEvents.filter((event) => event.kind === kind);

describe("withMeticulous", () => {
  it("captures inbound and outbound requests with session correlation", async () => {
    const handler = withMeticulous({
      fetch: async (request: Request) => {
        const upstream = await fetch(`${upstreamUrl}/items`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer super-secret",
          },
          body: '{"name":"widget"}',
        });
        const data = (await upstream.json()) as Record<string, unknown>;
        void request;
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    const ctx = makeCtx();
    const response = await handler.fetch(
      new Request("http://worker.local/page?tab=1", {
        headers: {
          "x-meticulous-session-id": "fs-123",
          cookie: "session=abc123",
        },
      }),
      { METICULOUS_SIDECAR_URL: sidecarUrl } as never,
      ctx,
    );
    await ctx.drain();

    expect(response.status).toBe(200);
    expect(response.headers.get(WORKERD_SHIM_VERSION_HEADER)).toBe(
      WORKERD_SHIM_VERSION,
    );
    expect(await response.json()).toEqual({ created: true });

    const [inbound] = eventsOfKind("inbound");
    expect(inbound).toMatchObject({
      kind: "inbound",
      frontendSessionId: "fs-123",
      method: "GET",
      url: "http://worker.local/page?tab=1",
      statusCode: 200,
    });
    expect(inbound.endTimeMs).toBeGreaterThanOrEqual(inbound.startTimeMs);
    expect(inbound).not.toHaveProperty("requestBody");

    const [outbound] = eventsOfKind("outbound");
    expect(outbound).toMatchObject({
      kind: "outbound",
      frontendSessionId: "fs-123",
      requestId: inbound.requestId,
      method: "POST",
      url: `${upstreamUrl}/items`,
      statusCode: 201,
    });
    if (outbound.kind !== "outbound") {
      throw new Error("expected outbound event");
    }
    expect(outbound.requestBody).toEqual({
      body: '{"name":"widget"}',
      truncated: false,
    });
    expect(outbound.responseBody).toEqual({
      body: '{"created":true}',
      truncated: false,
    });
    expect(outbound.requestHeaders["content-type"]).toEqual([
      "application/json",
    ]);
    // Sensitive headers are dropped at capture time, before leaving the worker.
    expect(outbound.requestHeaders).not.toHaveProperty("authorization");
    expect(inbound.requestHeaders).not.toHaveProperty("cookie");
    expect(inbound.requestHeaders["x-meticulous-session-id"]).toEqual([
      "fs-123",
    ]);

    // One POST, carrying both events: a request's captures are batched into a single report,
    // so an SSR request making many calls costs one round trip rather than one per call.
    expect(receivedProtocolVersions).toEqual([SIDECAR_PROTOCOL_VERSION]);
    expect(receivedBatchSizes).toEqual([2]);
  });

  it("does not intercept anything without a sidecar URL", async () => {
    const handler = withMeticulous({
      fetch: () => Promise.resolve(new Response("plain", { status: 200 })),
    });
    const ctx = makeCtx();
    const response = await handler.fetch(
      new Request("http://worker.local/"),
      {} as never,
      ctx,
    );
    await ctx.drain();

    expect(await response.text()).toBe("plain");
    expect(receivedEvents).toHaveLength(0);
  });

  it("does not capture the shim's own requests to the sidecar", async () => {
    const handler = withMeticulous({
      fetch: async () => {
        // An app request straight to the sidecar origin must not recurse.
        const health = await fetch(`${sidecarUrl}/v1/health`);
        void health;
        return new Response("ok");
      },
    });
    const ctx = makeCtx();
    await handler.fetch(
      new Request("http://worker.local/"),
      { METICULOUS_SIDECAR_URL: sidecarUrl } as never,
      ctx,
    );
    await ctx.drain();

    expect(eventsOfKind("outbound")).toHaveLength(0);
    expect(eventsOfKind("inbound")).toHaveLength(1);
  });

  it("reports failed outbound fetches and rethrows", async () => {
    const handler = withMeticulous({
      fetch: async () => {
        await fetch("http://127.0.0.1:1/unreachable");
        return new Response("unreachable ok");
      },
    });
    const ctx = makeCtx();
    await expect(
      handler.fetch(
        new Request("http://worker.local/failing"),
        { METICULOUS_SIDECAR_URL: sidecarUrl } as never,
        ctx,
      ),
    ).rejects.toThrow();
    await ctx.drain();

    const [outbound] = eventsOfKind("outbound");
    expect(outbound).toMatchObject({
      kind: "outbound",
      url: "http://127.0.0.1:1/unreachable",
    });
    if (outbound.kind !== "outbound") {
      throw new Error("expected outbound event");
    }
    expect(outbound.error).toBeTruthy();
    expect(outbound.statusCode).toBeUndefined();

    const [inbound] = eventsOfKind("inbound");
    if (inbound.kind !== "inbound") {
      throw new Error("expected inbound event");
    }
    expect(inbound.error).toBeTruthy();
  });

  it("reports inbound requests even when the app makes no outbound calls", async () => {
    const handler = withMeticulous({
      fetch: () => Promise.resolve(new Response("static", { status: 203 })),
    });
    const ctx = makeCtx();
    await handler.fetch(
      new Request("http://worker.local/static"),
      { METICULOUS_SIDECAR_URL: sidecarUrl } as never,
      ctx,
    );
    await ctx.drain();

    const [inbound] = eventsOfKind("inbound");
    expect(inbound.statusCode).toBe(203);
    expect(inbound.frontendSessionId).toBeUndefined();
    expect(eventsOfKind("outbound")).toHaveLength(0);
  });
});

/**
 * A top-level document navigation is the one request that can never carry
 * `x-meticulous-session-id`, so the shim mints one and hands it to the page — otherwise the
 * server-side render it triggers is recorded against no session at all.
 */
describe("withMeticulous provisional session ids", () => {
  /** The app the SSR render of a page would be: one upstream call, then HTML. */
  const documentHandler = (options?: Parameters<typeof withMeticulous>[1]) =>
    withMeticulous(
      {
        fetch: async () => {
          await fetch(`${upstreamUrl}/items`);
          return new Response(
            `<html><body>${getMeticulousSessionId() ?? "none"}</body></html>`,
            { headers: { "content-type": "text/html" } },
          );
        },
      },
      options,
    );

  const navigate = (headers: Record<string, string> = {}) =>
    new Request("http://worker.local/", {
      headers: { "sec-fetch-dest": "document", ...headers },
    });

  it("mints an id for a document navigation and puts the whole request under it", async () => {
    const ctx = makeCtx();
    const response = await documentHandler().fetch(
      navigate(),
      { METICULOUS_SIDECAR_URL: sidecarUrl } as never,
      ctx,
    );
    const body = await response.text();
    await ctx.drain();

    const [inbound] = eventsOfKind("inbound");
    const sessionId = inbound.frontendSessionId;
    expect(sessionId).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[A-Za-z0-9_-]{21}$/,
    );
    // Marks the id as one the page may never adopt, which ingestion has to tell apart from
    // one the browser sent us.
    expect(inbound).toMatchObject({ sessionIdOrigin: "backend" });

    // The render's own outbound call lands on the same session — the point of the exercise.
    const [outbound] = eventsOfKind("outbound");
    expect(outbound.frontendSessionId).toBe(sessionId);

    // Channel 1: readable by the page from the navigation's serverTiming entries.
    expect(response.headers.get("server-timing")).toBe(
      `metsession;desc="${sessionId}"`,
    );
    // Channel 2: the app rendered the same id via getMeticulousSessionId().
    expect(body).toBe(`<html><body>${sessionId}</body></html>`);
  });

  it("leaves an id the browser supplied alone", async () => {
    const ctx = makeCtx();
    const response = await documentHandler().fetch(
      navigate({ "x-meticulous-session-id": "fs-123" }),
      { METICULOUS_SIDECAR_URL: sidecarUrl } as never,
      ctx,
    );
    await ctx.drain();

    const [inbound] = eventsOfKind("inbound");
    expect(inbound.frontendSessionId).toBe("fs-123");
    expect(inbound).not.toHaveProperty("sessionIdOrigin");
    expect(response.headers.get("server-timing")).toBeNull();
  });

  it("declines an in-page fetch, which is how an RSC navigation arrives", async () => {
    const ctx = makeCtx();
    const response = await documentHandler().fetch(
      new Request("http://worker.local/api", {
        headers: { "sec-fetch-dest": "empty" },
      }),
      { METICULOUS_SIDECAR_URL: sidecarUrl } as never,
      ctx,
    );
    await ctx.drain();

    const [inbound] = eventsOfKind("inbound");
    expect(inbound.frontendSessionId).toBeUndefined();
    expect(response.headers.get("server-timing")).toBeNull();
  });

  it("can be opted out of with the option", async () => {
    const ctx = makeCtx();
    await documentHandler({ mintProvisionalSessionIds: false }).fetch(
      navigate(),
      { METICULOUS_SIDECAR_URL: sidecarUrl } as never,
      ctx,
    );
    await ctx.drain();

    expect(eventsOfKind("inbound")[0].frontendSessionId).toBeUndefined();
  });

  it("can be opted out of with the worker var", async () => {
    const ctx = makeCtx();
    await documentHandler().fetch(
      navigate(),
      {
        METICULOUS_SIDECAR_URL: sidecarUrl,
        METICULOUS_BACKEND_PROVISIONAL_SESSION_IDS: "false",
      } as never,
      ctx,
    );
    await ctx.drain();

    expect(eventsOfKind("inbound")[0].frontendSessionId).toBeUndefined();
  });

  it("mints nothing when there is no sidecar, so a deployed worker is untouched", async () => {
    const ctx = makeCtx();
    const response = await documentHandler().fetch(
      navigate(),
      {} as never,
      ctx,
    );
    await ctx.drain();

    expect(response.headers.get("server-timing")).toBeNull();
    expect(await response.text()).toBe("<html><body>none</body></html>");
    expect(receivedEvents).toHaveLength(0);
  });
  it("records nothing for a health probe, including what it fans out to", async () => {
    let handlerRan = false;
    const handler = withMeticulous({
      fetch: async () => {
        handlerRan = true;
        // A probe that does reach an upstream must not be recorded either: outside the
        // capture context the fetch patch is a pure pass-through.
        await fetch(`${upstreamUrl}/db-ping`, { method: "POST" });
        return new Response("ok");
      },
    });

    const ctx = makeCtx();
    const response = await handler.fetch(
      new Request("http://worker.local/health", {
        headers: { "user-agent": "kube-probe/1.31" },
      }),
      { METICULOUS_SIDECAR_URL: sidecarUrl } as never,
      ctx,
    );
    await ctx.drain();

    expect(response.status).toBe(200);
    expect(handlerRan).toBe(true);
    expect(receivedEvents).toHaveLength(0);
  });

  it("still records a session-tagged request on a probe path", async () => {
    const handler = withMeticulous({
      fetch: (): Promise<Response> =>
        Promise.resolve(new Response('{"ok":true}')),
    });

    const ctx = makeCtx();
    await handler.fetch(
      new Request("http://worker.local/api/health", {
        headers: { "x-meticulous-session-id": "fs-health" },
      }),
      { METICULOUS_SIDECAR_URL: sidecarUrl } as never,
      ctx,
    );
    await ctx.drain();

    expect(eventsOfKind("inbound")).toMatchObject([
      { frontendSessionId: "fs-health", url: "http://worker.local/api/health" },
    ]);
  });
});
