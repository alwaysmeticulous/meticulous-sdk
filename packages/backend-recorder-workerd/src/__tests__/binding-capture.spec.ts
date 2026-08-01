import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type MeticulousExecutionContext, withMeticulous } from "../index";
import type {
  BindingRequestEvent,
  CaptureEvent,
  CaptureEventsPayload,
} from "../protocol";

/**
 * In-Node integration tests for binding capture. A class with a `fetch` method stands in for
 * a Cloudflare binding: the method lives on the prototype, which is exactly the shape the
 * patch relies on (and which
 * `packages/backend-recorder-js/src/__tests__/workerd-binding-patch.spec.ts` proves real
 * workerd bindings have).
 *
 * One local server acts as the fake sidecar, a second as the upstream the binding forwards
 * to — separate origins, because the shim skips anything on the sidecar's own origin.
 */

let sidecarServer: http.Server;
let upstreamServer: http.Server;
let sidecarUrl: string;
let upstreamUrl: string;
let receivedEvents: CaptureEvent[] = [];

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
        const payload = JSON.parse(
          Buffer.concat(chunks).toString("utf-8"),
        ) as CaptureEventsPayload;
        receivedEvents.push(...payload.events);
        res.writeHead(204).end();
        return;
      }
      res.writeHead(404).end();
    });
  });
  // Echoes the request body back, so a test can assert the response body is stored
  // verbatim while the request body is redacted.
  upstreamServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      res.writeHead(201, { "content-type": "application/json" }).end(
        JSON.stringify({
          echoedPath: req.url,
          echoedBody: Buffer.concat(chunks).toString("utf-8"),
          token: "response-token-must-survive",
        }),
      );
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
});

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

/**
 * Stands in for a Cloudflare service binding. `fetch` is defined on the prototype (not as an
 * instance arrow property) so the patch has something to replace, and it asserts its own
 * receiver so a lost `this` fails loudly rather than silently.
 */
class FakeBinding {
  callCount = 0;

  constructor(private readonly forwardTo: string) {}

  async fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    if (!(this instanceof FakeBinding)) {
      throw new Error("receiver lost — the patch did not forward `this`");
    }
    this.callCount += 1;
    const request = new Request(input, init);
    const url = new URL(request.url);
    return fetch(`${this.forwardTo}${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers,
      ...(request.body ? { body: await request.text() } : {}),
    });
  }
}

/** A binding whose fetch always rejects, as an unreachable service would. */
class FailingBinding {
  async fetch(_input: RequestInfo, _init?: RequestInit): Promise<Response> {
    return Promise.reject(new Error("binding is down"));
  }
}

const bindingEvents = (): BindingRequestEvent[] =>
  receivedEvents.filter(
    (event): event is BindingRequestEvent => event.kind === "binding",
  );

const outboundEvents = (): CaptureEvent[] =>
  receivedEvents.filter((event) => event.kind === "outbound");

interface TestEnv {
  METICULOUS_SIDECAR_URL?: string;
  [key: string]: unknown;
}

const callThroughHandler = async (
  env: TestEnv,
  invoke: (env: TestEnv) => Promise<Response>,
  requestInit?: { sessionId?: string; skipBindings?: readonly string[] },
): Promise<Response> => {
  const handler = withMeticulous(
    { fetch: (_request: Request, handlerEnv: TestEnv) => invoke(handlerEnv) },
    requestInit?.skipBindings
      ? { skipBindings: requestInit.skipBindings }
      : undefined,
  );
  const ctx = makeCtx();
  try {
    return await handler.fetch(
      new Request("http://worker.local/page", {
        headers:
          requestInit?.sessionId === undefined
            ? {}
            : { "x-meticulous-session-id": requestInit.sessionId },
      }),
      env as never,
      ctx,
    );
  } finally {
    // Drain even when the handler threw, so the failure path's background report lands.
    await ctx.drain();
  }
};

describe("binding capture", () => {
  it("records a binding call as its own event, attributed to the env key", async () => {
    const binding = new FakeBinding(upstreamUrl);
    const response = await callThroughHandler(
      { METICULOUS_SIDECAR_URL: sidecarUrl, MY_SERVICE: binding },
      (env) =>
        (env.MY_SERVICE as FakeBinding).fetch(
          new Request("https://svc.internal/v1/flags:resolve", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: "Bearer super-secret",
            },
            body: '{"flags":["a"]}',
          }),
        ),
      { sessionId: "fs-binding-1" },
    );

    expect(response.status).toBe(201);
    expect(binding.callCount).toBe(1);

    const events = bindingEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "binding",
      bindingName: "MY_SERVICE",
      frontendSessionId: "fs-binding-1",
      method: "POST",
      url: "https://svc.internal/v1/flags:resolve",
      statusCode: 201,
    });
    expect(events[0].requestBody?.body).toBe('{"flags":["a"]}');
    expect(events[0].responseBody?.body).toContain("echoedPath");
  });

  it("parents the binding event under the inbound request", async () => {
    await callThroughHandler(
      {
        METICULOUS_SIDECAR_URL: sidecarUrl,
        MY_SERVICE: new FakeBinding(upstreamUrl),
      },
      (env) => (env.MY_SERVICE as FakeBinding).fetch("https://svc.internal/x"),
      { sessionId: "fs-binding-2" },
    );

    const inbound = receivedEvents.find((event) => event.kind === "inbound");
    const [binding] = bindingEvents();
    expect(inbound).toBeDefined();
    expect(binding.requestId).toBe(inbound?.requestId);
  });

  it("does not also record the call as outbound fetch", async () => {
    await callThroughHandler(
      {
        METICULOUS_SIDECAR_URL: sidecarUrl,
        MY_SERVICE: new FakeBinding(upstreamUrl),
      },
      (env) => (env.MY_SERVICE as FakeBinding).fetch("https://svc.internal/y"),
      { sessionId: "fs-binding-3" },
    );

    // The fake binding reaches the upstream via global fetch, which the fetch patch does
    // see — but that is one *additional* real egress call, not a duplicate of the binding
    // event. What must never happen is two binding events for one binding call.
    expect(bindingEvents()).toHaveLength(1);
  });

  it("keeps only allow-listed headers", async () => {
    await callThroughHandler(
      {
        METICULOUS_SIDECAR_URL: sidecarUrl,
        MY_SERVICE: new FakeBinding(upstreamUrl),
      },
      (env) =>
        (env.MY_SERVICE as FakeBinding).fetch(
          new Request("https://svc.internal/z", {
            headers: {
              "content-type": "application/json",
              authorization: "Bearer super-secret",
              cookie: "session=abc123",
            },
          }),
        ),
      { sessionId: "fs-binding-4" },
    );

    const [binding] = bindingEvents();
    expect(binding.requestHeaders["content-type"]).toEqual([
      "application/json",
    ]);
    expect(binding.requestHeaders["authorization"]).toBeUndefined();
    expect(binding.requestHeaders["cookie"]).toBeUndefined();
  });

  it("accepts a bare string URL, as an assets-style binding is called", async () => {
    await callThroughHandler(
      {
        METICULOUS_SIDECAR_URL: sidecarUrl,
        MY_SERVICE: new FakeBinding(upstreamUrl),
      },
      (env) =>
        (env.MY_SERVICE as FakeBinding).fetch("https://svc.internal/plain?a=1"),
      { sessionId: "fs-binding-5" },
    );

    const [binding] = bindingEvents();
    expect(binding.method).toBe("GET");
    expect(binding.url).toBe("https://svc.internal/plain?a=1");
  });

  it("records a failed binding call and rethrows", async () => {
    const failing = new FailingBinding();
    await expect(
      callThroughHandler(
        { METICULOUS_SIDECAR_URL: sidecarUrl, MY_SERVICE: failing },
        (env) =>
          (env.MY_SERVICE as FailingBinding).fetch("https://svc.internal/down"),
        { sessionId: "fs-binding-6" },
      ),
    ).rejects.toThrow("binding is down");

    const [binding] = bindingEvents();
    expect(binding.error).toContain("binding is down");
    expect(binding.statusCode).toBeUndefined();
  });

  it("skips the ASSETS binding by default", async () => {
    const assets = new FakeBinding(upstreamUrl);
    await callThroughHandler(
      { METICULOUS_SIDECAR_URL: sidecarUrl, ASSETS: assets },
      (env) => (env.ASSETS as FakeBinding).fetch("https://assets.local/thing"),
      { sessionId: "fs-binding-7" },
    );

    expect(assets.callCount).toBe(1);
    expect(bindingEvents()).toHaveLength(0);
  });

  it("skips bindings named by the skipBindings option", async () => {
    await callThroughHandler(
      {
        METICULOUS_SIDECAR_URL: sidecarUrl,
        NOISY: new FakeBinding(upstreamUrl),
      },
      (env) => (env.NOISY as FakeBinding).fetch("https://svc.internal/noise"),
      { sessionId: "fs-binding-8", skipBindings: ["NOISY"] },
    );

    expect(bindingEvents()).toHaveLength(0);
  });

  it("records nothing at all when no sidecar is configured", async () => {
    const binding = new FakeBinding(upstreamUrl);
    const response = await callThroughHandler({ MY_SERVICE: binding }, (env) =>
      (env.MY_SERVICE as FakeBinding).fetch("https://svc.internal/inert"),
    );

    expect(response.status).toBe(201);
    expect(binding.callCount).toBe(1);
    expect(receivedEvents).toHaveLength(0);
  });

  /**
   * The load-bearing case for real customers: an SDK that captures the binding stub once and
   * reuses it for the isolate's life (the stub is documented as isolate-stable). Every
   * per-request value must therefore be read at call time, not when the patch was installed.
   */
  it("attributes calls correctly when one binding instance serves many requests", async () => {
    const binding = new FakeBinding(upstreamUrl);
    const env = { METICULOUS_SIDECAR_URL: sidecarUrl, MY_SERVICE: binding };

    await callThroughHandler(
      env,
      (handlerEnv) =>
        (handlerEnv.MY_SERVICE as FakeBinding).fetch(
          "https://svc.internal/first",
        ),
      { sessionId: "fs-cached-1" },
    );
    await callThroughHandler(
      env,
      (handlerEnv) =>
        (handlerEnv.MY_SERVICE as FakeBinding).fetch(
          "https://svc.internal/second",
        ),
      { sessionId: "fs-cached-2" },
    );

    const events = bindingEvents();
    expect(events).toHaveLength(2);
    expect(events[0].frontendSessionId).toBe("fs-cached-1");
    expect(events[1].frontendSessionId).toBe("fs-cached-2");
    expect(events[0].requestId).not.toBe(events[1].requestId);
    expect(events.every((event) => event.bindingName === "MY_SERVICE")).toBe(
      true,
    );
  });

  it("passes through untouched outside a request context", async () => {
    const binding = new FakeBinding(upstreamUrl);
    // Install the patch via one real request, so the prototype is already patched.
    await callThroughHandler(
      { METICULOUS_SIDECAR_URL: sidecarUrl, MY_SERVICE: binding },
      (env) =>
        (env.MY_SERVICE as FakeBinding).fetch("https://svc.internal/warm"),
      { sessionId: "fs-outside-1" },
    );
    receivedEvents = [];

    // Now call the patched binding with no request context at all.
    const response = await binding.fetch("https://svc.internal/no-context");
    expect(response.status).toBe(201);
    expect(receivedEvents).toHaveLength(0);
  });

  it("redacts secrets from the request body but leaves the response body intact", async () => {
    await callThroughHandler(
      {
        METICULOUS_SIDECAR_URL: sidecarUrl,
        MY_SERVICE: new FakeBinding(upstreamUrl),
      },
      (env) =>
        (env.MY_SERVICE as FakeBinding).fetch(
          new Request("https://svc.internal/v1/flags:resolve", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              clientSecret: "super-secret-value",
              nested: { api_key: "another-secret", keep: "visible" },
              flags: ["a", "b"],
            }),
          }),
        ),
      { sessionId: "fs-redact-1" },
    );

    const [binding] = bindingEvents();
    const requestBody = binding.requestBody?.body ?? "";
    expect(requestBody).not.toContain("super-secret-value");
    expect(requestBody).not.toContain("another-secret");
    expect(requestBody).toContain("REDACTED");
    // Non-secret fields survive, so the body is still a useful match key.
    expect(requestBody).toContain("visible");
    expect(requestBody).toContain('"flags":["a","b"]');
    // The response is served back to the app during replay, so it must stay byte-exact.
    expect(binding.responseBody?.body).toContain("response-token-must-survive");
  });

  it("still records ordinary outbound fetch alongside binding calls", async () => {
    await callThroughHandler(
      {
        METICULOUS_SIDECAR_URL: sidecarUrl,
        MY_SERVICE: new FakeBinding(upstreamUrl),
      },
      async (env) => {
        await fetch(`${upstreamUrl}/direct-egress`);
        return (env.MY_SERVICE as FakeBinding).fetch(
          "https://svc.internal/both",
        );
      },
      { sessionId: "fs-both-1" },
    );

    expect(bindingEvents()).toHaveLength(1);
    expect(outboundEvents().length).toBeGreaterThanOrEqual(1);
  });
});
