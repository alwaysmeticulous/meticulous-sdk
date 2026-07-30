import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type MeticulousExecutionContext, withMeticulous } from "../index";
import type { CaptureEvent, CaptureEventsPayload } from "../protocol";

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

    expect(receivedProtocolVersions).toEqual(["1", "1"]);
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
    expect(outbound.error).toBeTruthy();
    expect(outbound.statusCode).toBeUndefined();

    const [inbound] = eventsOfKind("inbound");
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
