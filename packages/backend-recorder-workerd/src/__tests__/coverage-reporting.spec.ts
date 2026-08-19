import * as http from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type * as Shim from "../index";
import type { MeticulousWorkerHandler } from "../index";
import type { CoverageReportRequest } from "../protocol";

/**
 * What the shim reports to the replay sidecar's coverage route, driven through a
 * real request rather than by calling the reporter directly.
 *
 * Every test imports the module graph fresh (`vi.resetModules()`), because the
 * pieces under test are deliberately per-isolate module state: the registered id
 * space, which files have been acknowledged, and the latch that stops reporting
 * against a sidecar that will never take coverage.
 */

const SIDECAR_PROTOCOL = { found: true, clockAnchorMs: 1_785_230_474_662 };

let server: http.Server;
let sidecarUrl: string;
let reports: CoverageReportRequest[];
/** Status the coverage route answers with, so a test can emulate 404 / 5xx. */
let coverageStatus: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const path = (req.url ?? "").split("?")[0];
      if (req.method === "GET" && path === "/v1/replay/session") {
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify(SIDECAR_PROTOCOL));
        return;
      }
      if (req.method === "POST" && path === "/v1/replay/coverage") {
        if (coverageStatus === 200) {
          reports.push(
            JSON.parse(
              Buffer.concat(chunks).toString("utf-8"),
            ) as CoverageReportRequest,
          );
        }
        res.writeHead(coverageStatus).end();
        return;
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  sidecarUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(
  async () =>
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ),
);

beforeEach(() => {
  reports = [];
  coverageStatus = 200;
  vi.resetModules();
});

const FIRST_FILE = {
  path: "src/root.ts",
  firstId: 0,
  lineRanges: [1, 1, 4, 6],
};
/** A module whose chunk is only imported once a request calls into it. */
const LAZY_FILE = {
  path: "src/route/server.ts",
  firstId: 2,
  lineRanges: [9, 9],
};

/**
 * Drives one replayed request whose handler marks `hitId` (as instrumented code
 * would) after running `onRequest`, then waits for the reporting the shim handed
 * to `waitUntil`.
 */
const replayRequest = async (
  shim: typeof Shim,
  {
    sessionId,
    hitId,
    onRequest,
  }: { sessionId: string; hitId?: number; onRequest?: () => void },
): Promise<void> => {
  const pending: Promise<unknown>[] = [];
  // Widened to the declared handler shape so the call below is typed: the
  // inferred literal type has a zero-argument `fetch`.
  const handler: MeticulousWorkerHandler<never> = shim.withMeticulous({
    fetch: () => {
      onRequest?.();
      if (hitId !== undefined) {
        shim.__mcHit(hitId);
      }
      return new Response("ok");
    },
  });
  await handler.fetch(
    new Request("http://worker.local/page", {
      headers: {
        "x-meticulous-session-id": sessionId,
        "x-meticulous-replay-id": "replay-1",
        "x-meticulous-backend-replay-sidecar-url": sidecarUrl,
      },
    }),
    undefined as never,
    { waitUntil: (promise) => pending.push(promise) },
  );
  await Promise.all(pending);
};

describe("line coverage reporting", () => {
  it("sends the id→line map of a module that registers after the first report", async () => {
    const shim = await import("../index");
    shim.registerCoverageFile(FIRST_FILE);

    await replayRequest(shim, { sessionId: "session-a", hitId: 0 });
    // A route's server module registers when its chunk is first imported, which
    // is long after the isolate's first report.
    shim.registerCoverageFile(LAZY_FILE);
    await replayRequest(shim, { sessionId: "session-b", hitId: 2 });

    expect(reports).toHaveLength(2);
    expect(reports[0].files).toEqual([FIRST_FILE]);
    expect(reports[0].hitIds).toEqual([0]);
    // Only the new block: the first one has already been acknowledged.
    expect(reports[1].files).toEqual([LAZY_FILE]);
    expect(reports[1].hitIds).toEqual([2]);
  });

  it("does not resend a map the sidecar already has", async () => {
    const shim = await import("../index");
    shim.registerCoverageFile(FIRST_FILE);

    await replayRequest(shim, { sessionId: "session-a", hitId: 0 });
    await replayRequest(shim, { sessionId: "session-a", hitId: 1 });

    expect(reports[0].files).toEqual([FIRST_FILE]);
    expect(reports[1].files).toBeUndefined();
  });

  it("retries a map whose report failed, rather than losing it", async () => {
    const shim = await import("../index");
    shim.registerCoverageFile(FIRST_FILE);

    coverageStatus = 503;
    await replayRequest(shim, { sessionId: "session-a", hitId: 0 });
    expect(reports).toHaveLength(0);

    coverageStatus = 200;
    await replayRequest(shim, { sessionId: "session-a", hitId: 1 });
    expect(reports).toHaveLength(1);
    expect(reports[0].files).toEqual([FIRST_FILE]);
  });

  it("stops reporting once the sidecar says it does not collect coverage", async () => {
    const shim = await import("../index");
    shim.registerCoverageFile(FIRST_FILE);

    coverageStatus = 404;
    await replayRequest(shim, { sessionId: "session-a", hitId: 0 });

    coverageStatus = 200;
    await replayRequest(shim, { sessionId: "session-a", hitId: 1 });
    expect(reports).toHaveLength(0);
  });

  it("reports a newly registered map on a request that marked nothing", async () => {
    const shim = await import("../index");
    shim.registerCoverageFile(FIRST_FILE);

    // A module can be imported without any of its lines running yet — its
    // functions may only be called by a later request.
    await replayRequest(shim, { sessionId: "session-a" });

    expect(reports).toHaveLength(1);
    expect(reports[0].files).toEqual([FIRST_FILE]);
    expect(reports[0].hitIds).toEqual([]);
  });

  it("covers a module the request itself imported", async () => {
    // The sink is sized before the handler runs, so a module registering while it
    // runs has to grow it — otherwise the request that brings a chunk in is the
    // one request whose coverage of it is lost.
    const shim = await import("../index");
    shim.registerCoverageFile(FIRST_FILE);

    await replayRequest(shim, {
      sessionId: "session-a",
      hitId: 2,
      onRequest: () => shim.registerCoverageFile(LAZY_FILE),
    });

    expect(reports[0].files).toEqual([FIRST_FILE, LAZY_FILE]);
    expect(reports[0].hitIds).toEqual([2]);
  });

  it("collects on a cold isolate, where nothing has registered yet", async () => {
    // What a real replay looks like: every request is replayed, and the first one
    // arrives before any code-split module has been imported. Latching coverage
    // off here would mean a run reports nothing at all.
    const shim = await import("../index");

    await replayRequest(shim, {
      sessionId: "session-a",
      hitId: 0,
      onRequest: () => shim.registerCoverageFile(FIRST_FILE),
    });

    expect(reports).toHaveLength(1);
    expect(reports[0].files).toEqual([FIRST_FILE]);
    expect(reports[0].hitIds).toEqual([0]);
  });

  it("says nothing to the sidecar when the bundle is not instrumented", async () => {
    const shim = await import("../index");

    await replayRequest(shim, { sessionId: "session-a" });

    expect(reports).toHaveLength(0);
  });
});
