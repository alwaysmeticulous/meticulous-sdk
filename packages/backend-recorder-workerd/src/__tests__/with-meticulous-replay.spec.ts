import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type MeticulousExecutionContext,
  getMeticulousSessionId,
  withMeticulous,
} from "../index";
import {
  METICULOUS_PASSTHROUGH_HEADER,
  type OutboundFetchLookupRequest,
  type OutboundFetchLookupResponse,
  REPLAY_ID_HEADER,
  WORKERD_SHIM_VERSION_HEADER,
} from "../protocol";
import { WORKERD_SHIM_VERSION } from "../version";
import { UNANCHORED_BASE_TIME_MS } from "../virtual-clock";

/**
 * In-Node integration test for replay mode: a local HTTP server stands in for the replay
 * sidecar and a separate-origin server for the real upstream, so a test can tell "served
 * from the recording" from "reached the real service" by whether the upstream was hit.
 *
 * Node 20 supplies fetch/Request/Response/AsyncLocalStorage, so the whole shim runs
 * unmodified. Real workerd is covered separately; the point here is the decision logic.
 */

const SESSION = "fs-replay-1";
const ANCHOR_MS = 1_785_230_474_662;
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

let sidecarServer: http.Server;
let upstreamServer: http.Server;
let sidecarUrl: string;
let upstreamUrl: string;

let upstreamHits = 0;
let lookups: OutboundFetchLookupRequest[] = [];
let sessionInfoRequests: string[] = [];
/** Per-test override of how the fake sidecar answers lookups. */
let lookupHandler: (
  payload: OutboundFetchLookupRequest,
) => OutboundFetchLookupResponse;
/** Per-test override of the session handshake; null means "unknown session". */
let sessionInfoHandler: () => { clockAnchorMs?: number } | null;
/** Routes the fake sidecar should 404, to emulate an older record-only sidecar. */
let unavailableRoutes = new Set<string>();
/** How many handshakes should 503 first, to emulate a transient sidecar failure. */
let sessionInfoFailuresRemaining = 0;

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
      const path = (req.url ?? "").split("?")[0];
      if (unavailableRoutes.has(path)) {
        res.writeHead(404).end('{"error":"not found"}');
        return;
      }
      if (req.method === "GET" && path === "/v1/replay/session") {
        sessionInfoRequests.push(req.url ?? "");
        if (sessionInfoFailuresRemaining > 0) {
          sessionInfoFailuresRemaining -= 1;
          res.writeHead(503).end('{"error":"still warming up"}');
          return;
        }
        const info = sessionInfoHandler();
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(
            JSON.stringify(
              info === null ? { found: false } : { found: true, ...info },
            ),
          );
        return;
      }
      if (req.method === "POST" && path === "/v1/replay/outbound-fetch") {
        const payload = JSON.parse(
          Buffer.concat(chunks).toString("utf-8"),
        ) as OutboundFetchLookupRequest;
        lookups.push(payload);
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify(lookupHandler(payload)));
        return;
      }
      res.writeHead(404).end();
    });
  });
  upstreamServer = http.createServer((req, res) => {
    upstreamHits += 1;
    req.resume();
    req.on("end", () => {
      res
        .writeHead(201, { "content-type": "application/json" })
        .end(JSON.stringify({ from: "real-upstream" }));
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
  upstreamHits = 0;
  lookups = [];
  sessionInfoRequests = [];
  unavailableRoutes = new Set();
  sessionInfoFailuresRemaining = 0;
  sessionInfoHandler = () => ({ clockAnchorMs: ANCHOR_MS });
  lookupHandler = () => ({
    outcome: "mock",
    statusCode: 200,
    body: '{"from":"recording"}',
    headers: { "content-type": "application/json" },
  });
});

const makeCtx = (): MeticulousExecutionContext => ({
  waitUntil: () => {},
});

/**
 * Drives a worker that makes one outbound call, and reports what the app saw. Each call uses
 * a fresh session id by default so the shim's per-isolate handshake cache does not leak
 * between tests.
 */
const callWorker = async ({
  sidecarUrlHeader = sidecarUrl,
  sessionId = SESSION,
  replayId = "replay-1",
  omitSessionId = false,
  omitReplayId = false,
  requestBody,
  readClock = false,
  passthroughHeader = false,
}: {
  sidecarUrlHeader?: string;
  sessionId?: string;
  replayId?: string;
  /** A separate flag, not `sessionId: undefined` — that would trigger the default above. */
  omitSessionId?: boolean;
  omitReplayId?: boolean;
  requestBody?: string;
  readClock?: boolean;
  /** Marks the app's outbound call as one that must stay live during replay. */
  passthroughHeader?: boolean;
} = {}): Promise<{
  status: number;
  body: string;
  clockNow: number;
  shimVersion: string | null;
}> => {
  const handler = withMeticulous({
    fetch: async () => {
      const upstream = await fetch(`${upstreamUrl}/items`, {
        method: requestBody === undefined ? "GET" : "POST",
        ...(requestBody === undefined ? {} : { body: requestBody }),
        ...(passthroughHeader
          ? { headers: { [METICULOUS_PASSTHROUGH_HEADER]: "true" } }
          : {}),
      });
      const text = await upstream.text();
      return new Response(
        // The Response constructor refuses a body on these statuses, so the harness must
        // not re-attach one when echoing the app's view back to the test.
        NULL_BODY_STATUSES.has(upstream.status) ? null : text,
        {
          status: upstream.status,
          headers: {
            "x-clock-now": readClock ? String(Date.now()) : "0",
            "x-upstream-content-type":
              upstream.headers.get("content-type") ?? "none",
          },
        },
      );
    },
  });

  const headers: Record<string, string> = {};
  if (!omitSessionId) {
    headers["x-meticulous-session-id"] = sessionId;
  }
  if (!omitReplayId) {
    headers[REPLAY_ID_HEADER] = replayId;
  }
  headers["x-meticulous-backend-replay-sidecar-url"] = sidecarUrlHeader;

  const response = await handler.fetch(
    new Request("http://worker.local/page", { headers }),
    undefined as never,
    makeCtx(),
  );
  return {
    status: response.status,
    body: await response.text(),
    clockNow: Number(response.headers.get("x-clock-now")),
    shimVersion: response.headers.get(WORKERD_SHIM_VERSION_HEADER),
  };
};

describe("withMeticulous in replay mode", () => {
  it("serves the recorded response without touching the real upstream", async () => {
    const result = await callWorker({ sessionId: "serve-1" });

    expect(result.status).toBe(200);
    expect(result.body).toBe('{"from":"recording"}');
    expect(upstreamHits).toBe(0);
    expect(lookups).toHaveLength(1);
    expect(lookups[0]).toMatchObject({
      frontendSessionId: "serve-1",
      replayId: "replay-1",
      method: "GET",
      url: `${upstreamUrl}/items`,
    });
  });

  it("sends the request body for hashing, as captured", async () => {
    await callWorker({ sessionId: "body-1", requestBody: '{"name":"widget"}' });

    expect(lookups[0].requestBody).toEqual({
      body: '{"name":"widget"}',
      truncated: false,
    });
  });

  it("forwards the inbound virtual-time header on outbound lookups", async () => {
    const handler = withMeticulous({
      fetch: async () => {
        const response = await fetch(`${upstreamUrl}/items`);
        await response.text();
        return new Response("ok");
      },
    });

    await handler.fetch(
      new Request("http://worker.local/page", {
        headers: {
          "x-meticulous-session-id": "virtual-time-1",
          [REPLAY_ID_HEADER]: "replay-1",
          "x-meticulous-backend-replay-sidecar-url": sidecarUrl,
          "x-meticulous-virtual-time": "1500",
        },
      }),
      undefined as never,
      makeCtx(),
    );

    expect(lookups).toHaveLength(1);
    expect(lookups[0].virtualTimeMs).toBe(1500);
  });

  it("fails the call on a miss instead of reaching the real service", async () => {
    lookupHandler = () => ({ outcome: "no-mock" });

    await expect(callWorker({ sessionId: "miss-1" })).rejects.toThrow(
      /no recorded response for GET .*\/items \(session miss-1\)/,
    );
    expect(upstreamHits).toBe(0);
  });

  it("lets a call marked with the passthrough header stay live", async () => {
    lookupHandler = () => ({ outcome: "no-mock" });

    const result = await callWorker({
      sessionId: "passthrough-1",
      passthroughHeader: true,
    });

    // The escape hatch for a call the recording can never cover: not looked up, not failed.
    expect(result.status).toBe(201);
    expect(result.body).toBe('{"from":"real-upstream"}');
    expect(upstreamHits).toBe(1);
    expect(lookups).toHaveLength(0);
  });

  it("fails the call when the sidecar cannot answer the lookup", async () => {
    // An unanswered lookup is not evidence that a real call is safe.
    unavailableRoutes = new Set(["/v1/replay/outbound-fetch"]);

    await expect(callWorker({ sessionId: "lookup-dead-1" })).rejects.toThrow(
      /did not answer a mock lookup/,
    );
    expect(upstreamHits).toBe(0);
  });

  it("fails on an unrecognised outcome instead of reaching the real service", async () => {
    // A failure to stub, whatever its shape, is hermetic: an outcome this shim does not
    // recognise fails the request rather than falling back to a real call.
    lookupHandler = () =>
      ({ outcome: "something-new" }) as unknown as OutboundFetchLookupResponse;

    await expect(
      callWorker({ sessionId: "unknown-outcome-1" }),
    ).rejects.toThrow(/unrecognised sidecar outcome/);
    expect(upstreamHits).toBe(0);
  });

  it("fails on a legacy `passthrough` outcome instead of reaching the real service", async () => {
    // `passthrough` is no longer a valid outcome — an older sidecar could still answer a miss
    // with it. Replay is hermetic, so the shim fails the call rather than falling back to the
    // old pass-through behaviour, exactly as it does for any unrecognised outcome.
    lookupHandler = () =>
      ({ outcome: "passthrough" }) as unknown as OutboundFetchLookupResponse;

    await expect(
      callWorker({ sessionId: "old-passthrough-1" }),
    ).rejects.toThrow(/unrecognised sidecar outcome/);
    expect(upstreamHits).toBe(0);
  });

  it("freezes the clock at the session anchor", async () => {
    const result = await callWorker({ sessionId: "clock-1", readClock: true });

    expect(result.clockNow).toBe(ANCHOR_MS);
  });

  it("freezes at the fixed fallback date when the sidecar reports no anchor", async () => {
    // Live time here would be non-deterministic across two replays of the same session,
    // which is the whole thing the clock exists to remove — so an anchorless replayed
    // request still gets a frozen time, just a fixed one (13 May 2026).
    sessionInfoHandler = () => ({});

    const result = await callWorker({ sessionId: "clock-2", readClock: true });

    expect(result.clockNow).toBe(UNANCHORED_BASE_TIME_MS);
    // Deliberately a literal too: the shim ships standalone, so its fallback is a second copy
    // of the Node recorder's by design, and the two must stay in step.
    expect(new Date(UNANCHORED_BASE_TIME_MS).toISOString()).toBe(
      "2026-05-13T00:00:00.000Z",
    );
  });

  it("handshakes once per session, not once per request", async () => {
    await callWorker({ sessionId: "cached-1" });
    await callWorker({ sessionId: "cached-1" });
    await callWorker({ sessionId: "cached-1" });

    expect(sessionInfoRequests).toHaveLength(1);
    expect(lookups).toHaveLength(3);
  });

  it("does not replay a session the sidecar does not know", async () => {
    sessionInfoHandler = () => null;

    const result = await callWorker({ sessionId: "unknown-1" });

    expect(result.status).toBe(201);
    expect(upstreamHits).toBe(1);
    expect(lookups).toHaveLength(0);
  });

  it("retries the handshake after a transient failure", async () => {
    // Caching a blip would disable mocking for the rest of the isolate's life, silently
    // sending every later call to the real service.
    sessionInfoFailuresRemaining = 1;

    const failed = await callWorker({ sessionId: "transient-1" });
    expect(failed.status).toBe(201);
    expect(upstreamHits).toBe(1);

    const recovered = await callWorker({ sessionId: "transient-1" });
    expect(recovered.status).toBe(200);
    expect(recovered.body).toBe('{"from":"recording"}');
    expect(upstreamHits).toBe(1);
    expect(sessionInfoRequests).toHaveLength(2);
  });

  it("does not re-handshake after a settled negative answer", async () => {
    // A sidecar that says "no mocks for this session" will keep saying it, so asking again
    // on every request would just add a round trip to each one.
    sessionInfoHandler = () => null;

    await callWorker({ sessionId: "settled-1" });
    await callWorker({ sessionId: "settled-1" });

    expect(upstreamHits).toBe(2);
    expect(sessionInfoRequests).toHaveLength(1);
  });

  it("degrades to pass-through against a record-only sidecar", async () => {
    // An older sidecar has no replay routes at all.
    unavailableRoutes = new Set([
      "/v1/replay/session",
      "/v1/replay/outbound-fetch",
    ]);

    const result = await callWorker({ sessionId: "old-sidecar-1" });

    expect(result.status).toBe(201);
    expect(upstreamHits).toBe(1);
  });

  it("ignores a sidecar URL that is not host-local", async () => {
    const result = await callWorker({
      sessionId: "bad-url-1",
      sidecarUrlHeader: "https://evil.example.com",
    });

    expect(result.status).toBe(201);
    expect(upstreamHits).toBe(1);
    expect(sessionInfoRequests).toHaveLength(0);
  });

  it("does not replay without a session id", async () => {
    const result = await callWorker({ omitSessionId: true });

    // Mocks are per-session, so no session id could only ever miss.
    expect(result.status).toBe(201);
    expect(upstreamHits).toBe(1);
    expect(sessionInfoRequests).toHaveLength(0);
  });

  it("does not replay without a replay id", async () => {
    const result = await callWorker({ omitReplayId: true });

    expect(result.status).toBe(201);
    expect(upstreamHits).toBe(1);
    expect(sessionInfoRequests).toHaveLength(0);
  });

  it("drops recorded framing headers that no longer describe the body", async () => {
    lookupHandler = () => ({
      outcome: "mock",
      statusCode: 200,
      body: '{"from":"recording"}',
      headers: {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": "99999",
      },
    });

    const result = await callWorker({ sessionId: "headers-1" });

    // A stale content-encoding would make the caller try to gunzip plain JSON.
    expect(result.body).toBe('{"from":"recording"}');
    expect(result.status).toBe(200);
  });

  it("fails rather than passing through on an unrepresentable mock", async () => {
    lookupHandler = () => ({
      outcome: "mock",
      statusCode: 999,
      body: "nope",
      headers: {},
    });

    await expect(callWorker({ sessionId: "bad-status-1" })).rejects.toThrow(
      /recorded response \(status 999\) cannot be represented/,
    );
    expect(upstreamHits).toBe(0);
  });

  it("serves a null-body status without a body", async () => {
    lookupHandler = () => ({
      outcome: "mock",
      statusCode: 204,
      body: "",
      headers: {},
    });

    const result = await callWorker({ sessionId: "no-content-1" });

    expect(result.status).toBe(204);
    expect(upstreamHits).toBe(0);
  });

  /**
   * An app that renders the session id into its HTML must render the same bytes on a replay
   * as it did when recording, or every server-rendered page it produces is a permanent diff.
   * It does, because the id the runner injects here is the one the page adopted then.
   */
  it("reports the replayed session's id to an app that renders it", async () => {
    const handler = withMeticulous({
      fetch: () => Promise.resolve(new Response(getMeticulousSessionId())),
    });

    const response = await handler.fetch(
      new Request("http://worker.local/page", {
        headers: {
          "sec-fetch-dest": "document",
          "x-meticulous-session-id": "rendered-1",
          [REPLAY_ID_HEADER]: "replay-rendered-1",
          "x-meticulous-backend-replay-sidecar-url": sidecarUrl,
        },
      }),
      undefined as never,
      makeCtx(),
    );

    expect(await response.text()).toBe("rendered-1");
    // Nothing is minted or published in replay: the runner already named the session.
    expect(response.headers.get("server-timing")).toBeNull();
    expect(response.headers.get(WORKERD_SHIM_VERSION_HEADER)).toBe(
      WORKERD_SHIM_VERSION,
    );
  });

  it("stamps the bundled shim version on every replayed response", async () => {
    const result = await callWorker({ sessionId: "shim-version-1" });

    expect(result.status).toBe(200);
    expect(result.shimVersion).toBe(WORKERD_SHIM_VERSION);
  });
});
