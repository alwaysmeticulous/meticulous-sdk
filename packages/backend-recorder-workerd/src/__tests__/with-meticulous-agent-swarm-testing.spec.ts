import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type MeticulousExecutionContext, withMeticulous } from "../index";
import {
  AGENT_SWARM_TESTING_RUN_ID_ENV_KEY,
  AGENT_SWARM_TESTING_SIDECAR_URL_ENV_KEY,
  FRONTEND_SESSION_ID_HEADER,
  type OutboundFetchAgentSwarmTestingRequest,
  type OutboundFetchAgentSwarmTestingResponse,
  METICULOUS_PASSTHROUGH_HEADER,
  REPLAY_ID_HEADER,
  REPLAY_SIDECAR_URL_HEADER,
  WORKERD_SHIM_VERSION_HEADER,
} from "../protocol";
import { WORKERD_SHIM_VERSION } from "../version";

/**
 * In-Node integration test for agent-swarm-testing mode, mirroring
 * with-meticulous-replay.spec.ts: a local HTTP server stands in for the interceptor and a
 * separate-origin server for the real upstream, so a test can tell "served by the
 * interceptor" from "reached the real service".
 *
 * The mode activates on the two deployment env vars, so the harness passes them as the
 * worker `env` object rather than stamping request headers.
 */

const RUN_ID = "agent-swarm-run-1";

let interceptorServer: http.Server;
let upstreamServer: http.Server;
let interceptorUrl: string;
let upstreamUrl: string;

let upstreamHits: number;
let intercepts: OutboundFetchAgentSwarmTestingRequest[];
/** Per-test override of how the fake interceptor answers. */
let interceptHandler: (
  payload: OutboundFetchAgentSwarmTestingRequest,
) => OutboundFetchAgentSwarmTestingResponse;
/** When set, the fake interceptor answers with this HTTP status instead of a body. */
let interceptResponseStatus: number | null;
/** When true, the fake interceptor also answers the replay session/lookup routes. */
let replayRoutesAvailable = false;

const listen = async (server: http.Server): Promise<string> => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

const close = (server: http.Server): Promise<void> =>
  new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );

beforeAll(async () => {
  interceptorServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const path = (req.url ?? "").split("?")[0];
      if (
        replayRoutesAvailable &&
        req.method === "GET" &&
        path === "/v1/replay/session"
      ) {
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ found: true }));
        return;
      }
      if (
        replayRoutesAvailable &&
        req.method === "POST" &&
        path === "/v1/replay/outbound-fetch"
      ) {
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ outcome: "no-mock" }));
        return;
      }
      if (
        req.method === "POST" &&
        path === "/v1/agent-swarm-testing/outbound-fetch"
      ) {
        const payload = JSON.parse(
          Buffer.concat(chunks).toString("utf-8"),
        ) as OutboundFetchAgentSwarmTestingRequest;
        intercepts.push(payload);
        if (interceptResponseStatus !== null) {
          res.writeHead(interceptResponseStatus).end();
          return;
        }
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify(interceptHandler(payload)));
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
  [interceptorUrl, upstreamUrl] = await Promise.all([
    listen(interceptorServer),
    listen(upstreamServer),
  ]);
});

afterAll(async () => {
  await Promise.all([close(interceptorServer), close(upstreamServer)]);
});

beforeEach(() => {
  upstreamHits = 0;
  intercepts = [];
  replayRoutesAvailable = false;
  interceptResponseStatus = null;
  interceptHandler = () => ({
    outcome: "mock",
    statusCode: 200,
    body: '{"from":"interceptor"}',
    headers: { "content-type": "application/json" },
  });
});

const makeCtx = (): MeticulousExecutionContext => ({
  waitUntil: () => {},
});

/**
 * Drives a worker that makes one outbound call, and reports what the app saw.
 */
const callWorker = async ({
  interceptorUrlEnv = interceptorUrl,
  runIdEnv = RUN_ID,
  omitRunId = false,
  omitSessionId = false,
  sessionId = "fs-swarm-1",
  requestBody,
  passthroughHeader = false,
}: {
  /** The env var's value; a separate flag, `omitRunId`, leaves it unset. */
  interceptorUrlEnv?: string;
  runIdEnv?: string;
  omitRunId?: boolean;
  omitSessionId?: boolean;
  sessionId?: string;
  requestBody?: string;
  /** Marks the app's outbound call as one that must stay live. */
  passthroughHeader?: boolean;
} = {}): Promise<{
  status: number;
  body: string;
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
      return new Response(text, {
        status: upstream.status,
        headers: {
          "x-upstream-content-type":
            upstream.headers.get("content-type") ?? "none",
        },
      });
    },
  });

  const env: Record<string, string> = {
    [AGENT_SWARM_TESTING_SIDECAR_URL_ENV_KEY]: interceptorUrlEnv,
  };
  if (!omitRunId) {
    env[AGENT_SWARM_TESTING_RUN_ID_ENV_KEY] = runIdEnv;
  }

  const headers: Record<string, string> = {};
  if (!omitSessionId) {
    headers[FRONTEND_SESSION_ID_HEADER] = sessionId;
  }

  const response = await handler.fetch(
    new Request("http://worker.local/page", { headers }),
    env,
    makeCtx(),
  );
  return {
    status: response.status,
    body: await response.text(),
    shimVersion: response.headers.get(WORKERD_SHIM_VERSION_HEADER),
  };
};

describe("withMeticulous in agent-swarm-testing mode", () => {
  it("serves the interceptor's mock without touching the real upstream", async () => {
    const result = await callWorker();

    expect(result.status).toBe(200);
    expect(result.body).toBe('{"from":"interceptor"}');
    expect(upstreamHits).toBe(0);
    expect(intercepts).toHaveLength(1);
  });

  it("sends the run identity, session, method, url and captured body on the intercept", async () => {
    await callWorker({
      sessionId: "session-42",
      runIdEnv: "run-42",
      requestBody: '{"name":"widget"}',
    });

    expect(intercepts[0]).toEqual({
      runId: "run-42",
      frontendSessionId: "session-42",
      method: "POST",
      url: `${upstreamUrl}/items`,
      requestBody: { body: '{"name":"widget"}', truncated: false },
    });
  });

  it("omits the session id entirely when the inbound request carried none", async () => {
    await callWorker({ omitSessionId: true });

    expect(intercepts[0].frontendSessionId).toBeUndefined();
    expect("frontendSessionId" in intercepts[0]).toBe(false);
  });

  it("passes the call through when the interceptor answers passthrough", async () => {
    interceptHandler = () => ({ outcome: "passthrough" });

    const result = await callWorker();

    expect(result.status).toBe(201);
    expect(result.body).toBe('{"from":"real-upstream"}');
    expect(upstreamHits).toBe(1);
  });

  it("passes the call through when the interceptor is unreachable", async () => {
    // A port nothing listens on: connection refused, the cheapest unreachable answer.
    const result = await callWorker({
      interceptorUrlEnv: "http://127.0.0.1:1",
    });

    expect(result.status).toBe(201);
    expect(result.body).toBe('{"from":"real-upstream"}');
    expect(upstreamHits).toBe(1);
  });

  it("passes the call through when the interceptor rejects the request", async () => {
    interceptResponseStatus = 500;

    const result = await callWorker();

    expect(result.status).toBe(201);
    expect(result.body).toBe('{"from":"real-upstream"}');
    expect(upstreamHits).toBe(1);
  });

  it("passes the call through when the interceptor does not answer the route", async () => {
    interceptResponseStatus = 404;

    const result = await callWorker();

    expect(result.status).toBe(201);
    expect(result.body).toBe('{"from":"real-upstream"}');
    expect(upstreamHits).toBe(1);
  });

  it("skips the interceptor for a call marked meticulous-passthrough", async () => {
    const result = await callWorker({ passthroughHeader: true });

    expect(result.body).toBe('{"from":"real-upstream"}');
    expect(upstreamHits).toBe(1);
    expect(intercepts).toHaveLength(0);
  });

  it("ignores an interceptor URL that is not a private http origin", async () => {
    const result = await callWorker({
      interceptorUrlEnv: "https://interceptor.example.com",
    });

    expect(result.body).toBe('{"from":"real-upstream"}');
    expect(upstreamHits).toBe(1);
    expect(intercepts).toHaveLength(0);
  });

  it("stays out of the mode without a run id", async () => {
    const result = await callWorker({ omitRunId: true });

    expect(result.body).toBe('{"from":"real-upstream"}');
    expect(upstreamHits).toBe(1);
    expect(intercepts).toHaveLength(0);
  });

  it("publishes the shim version on the response", async () => {
    const result = await callWorker();

    expect(result.shimVersion).toBe(WORKERD_SHIM_VERSION);
  });

  it("prefers replay when the replay header and the agent-swarm env vars are both set", async () => {
    // The fake interceptor also answers the replay handshake (found: true) and the replay
    // lookup (no-mock), so replay mode is fully available and must win.
    replayRoutesAvailable = true;
    const handler = withMeticulous({
      fetch: async () => {
        const upstream = await fetch(`${upstreamUrl}/items`);
        const text = await upstream.text();
        return new Response(text);
      },
    });

    await expect(
      handler.fetch(
        new Request("http://worker.local/page", {
          headers: {
            [FRONTEND_SESSION_ID_HEADER]: "both-1",
            [REPLAY_ID_HEADER]: "replay-1",
            [REPLAY_SIDECAR_URL_HEADER]: interceptorUrl,
          },
        }),
        {
          [AGENT_SWARM_TESTING_SIDECAR_URL_ENV_KEY]: interceptorUrl,
          [AGENT_SWARM_TESTING_RUN_ID_ENV_KEY]: RUN_ID,
        },
        makeCtx(),
      ),
    ).rejects.toThrow(/no recorded response/);

    // Replay won: the call failed on its no-mock — it never reached the upstream, and the
    // agent-swarm-testing route was never asked.
    expect(upstreamHits).toBe(0);
    expect(intercepts).toHaveLength(0);
  });
});
