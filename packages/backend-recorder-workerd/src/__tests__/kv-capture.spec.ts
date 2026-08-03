import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type MeticulousExecutionContext, withMeticulous } from "../index";
import type {
  CaptureEvent,
  CaptureEventsPayload,
  KvOperationEvent,
} from "../protocol";

/**
 * In-Node integration tests for KV capture. A class with `get`/`getWithMetadata`/`put`/
 * `delete`/`list` on its prototype stands in for a Cloudflare KV namespace — the shape the
 * patch relies on, and the one
 * `packages/backend-recorder-js/src/__tests__/workerd-binding-patch.spec.ts` proves real
 * workerd namespaces have. End-to-end coverage against real KV lives in
 * `workerd-kv-sidecar.spec.ts`.
 */

let sidecarServer: http.Server;
let sidecarUrl: string;
let receivedEvents: CaptureEvent[] = [];

const listen = async (server: http.Server): Promise<string> => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

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
  sidecarUrl = await listen(sidecarServer);
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    sidecarServer.close((err) => (err ? reject(err) : resolve())),
  );
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

interface StoredEntry {
  value: unknown;
  metadata?: unknown;
}

/**
 * Stands in for a KV namespace. Every method is on the prototype (not an instance arrow
 * property) so the patch has something to replace, and each asserts its own receiver so a
 * lost `this` fails loudly rather than silently.
 */
class FakeKvNamespace {
  readonly entries = new Map<string, StoredEntry>();
  callCount = 0;

  private assertReceiver(): void {
    if (!(this instanceof FakeKvNamespace)) {
      throw new Error("receiver lost — the patch did not forward `this`");
    }
    this.callCount += 1;
  }

  get(key: string | string[]): Promise<unknown> {
    this.assertReceiver();
    if (Array.isArray(key)) {
      return Promise.resolve(
        new Map(key.map((k) => [k, this.entries.get(k)?.value ?? null])),
      );
    }
    return Promise.resolve(this.entries.get(key)?.value ?? null);
  }

  getWithMetadata(key: string): Promise<unknown> {
    this.assertReceiver();
    const entry = this.entries.get(key);
    return Promise.resolve({
      value: entry?.value ?? null,
      metadata: entry?.metadata ?? null,
    });
  }

  put(
    key: string,
    value: unknown,
    options?: { metadata?: unknown },
  ): Promise<void> {
    this.assertReceiver();
    this.entries.set(key, {
      value,
      ...(options?.metadata !== undefined
        ? { metadata: options.metadata }
        : {}),
    });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.assertReceiver();
    this.entries.delete(key);
    return Promise.resolve();
  }

  list(options?: { prefix?: string }): Promise<unknown> {
    this.assertReceiver();
    const prefix = options?.prefix ?? "";
    return Promise.resolve({
      keys: [...this.entries.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name })),
      list_complete: true,
    });
  }
}

/** A namespace whose reads always reject, as an unavailable namespace would. */
class FailingKvNamespace extends FakeKvNamespace {
  override get(): Promise<unknown> {
    return Promise.reject(new Error("kv is down"));
  }
}

const kvEvents = (): KvOperationEvent[] =>
  receivedEvents.filter(
    (event): event is KvOperationEvent => event.kind === "kv",
  );

interface TestEnv {
  METICULOUS_SIDECAR_URL?: string;
  [key: string]: unknown;
}

const callThroughHandler = async (
  env: TestEnv,
  invoke: (env: TestEnv) => Promise<unknown>,
  requestInit?: { sessionId?: string; skipBindings?: readonly string[] },
): Promise<unknown> => {
  let handlerResult: unknown;
  const handler = withMeticulous(
    {
      fetch: async (_request: Request, handlerEnv: TestEnv) => {
        handlerResult = await invoke(handlerEnv);
        return new Response("ok");
      },
    },
    requestInit?.skipBindings
      ? { skipBindings: requestInit.skipBindings }
      : undefined,
  );
  const ctx = makeCtx();
  try {
    await handler.fetch(
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
  return handlerResult;
};

const envWith = (namespace: unknown, name = "MY_KV"): TestEnv => ({
  METICULOUS_SIDECAR_URL: sidecarUrl,
  [name]: namespace,
});

describe("KV capture", () => {
  it("records a read, attributed to the env key, without altering the value", async () => {
    const kv = new FakeKvNamespace();
    await kv.put("watchlist:u1", '{"sku":"KV-001"}');
    kv.callCount = 0;

    const returned = await callThroughHandler(
      envWith(kv, "WATCHLIST_KV"),
      (env) => (env.WATCHLIST_KV as FakeKvNamespace).get("watchlist:u1"),
      { sessionId: "fs-kv-1" },
    );

    expect(returned).toBe('{"sku":"KV-001"}');
    expect(kv.callCount).toBe(1);

    const events = kvEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "kv",
      bindingName: "WATCHLIST_KV",
      frontendSessionId: "fs-kv-1",
      operation: "get",
      key: "watchlist:u1",
    });
    // JSON, so one parse reconstructs exactly what the app saw.
    expect(JSON.parse(events[0].result?.body ?? "")).toBe('{"sku":"KV-001"}');
    expect(events[0].result?.truncated).toBe(false);
  });

  it("records a miss as a null result", async () => {
    const kv = new FakeKvNamespace();
    const returned = await callThroughHandler(envWith(kv), (env) =>
      (env.MY_KV as FakeKvNamespace).get("absent"),
    );

    expect(returned).toBeNull();
    expect(JSON.parse(kvEvents()[0].result?.body ?? "")).toBeNull();
  });

  it("returns the app's own object identity from a json-typed read", async () => {
    const stored = { sku: "KV-001", note: "" };
    const kv = new FakeKvNamespace();
    await kv.put("entry", stored as unknown as string);

    const returned = await callThroughHandler(envWith(kv), (env) =>
      (env.MY_KV as FakeKvNamespace).get("entry"),
    );

    expect(returned).toBe(stored);
    expect(JSON.parse(kvEvents()[0].result?.body ?? "")).toEqual(stored);
  });

  it("records a write with the value redacted and the options in place", async () => {
    const kv = new FakeKvNamespace();
    await callThroughHandler(envWith(kv), (env) =>
      (env.MY_KV as FakeKvNamespace).put(
        "session:u1",
        '{"uid":"u1","refreshToken":"must-not-be-recorded"}',
        { metadata: { addedAt: "2026-07-31T00:00:00.000Z" } },
      ),
    );

    const [event] = kvEvents();
    expect(event).toMatchObject({ operation: "put", key: "session:u1" });
    expect(event.value?.body).toContain("REDACTED");
    expect(event.value?.body).not.toContain("must-not-be-recorded");
    // A put resolves to undefined, so there is nothing to record as a result.
    expect(event.result).toBeUndefined();
    // The value is null in the args, keeping the options at their real position.
    expect(JSON.parse(event.args?.body ?? "")).toEqual([
      "session:u1",
      null,
      { metadata: { addedAt: "2026-07-31T00:00:00.000Z" } },
    ]);
  });

  it("keeps a read value verbatim even when it looks secret", async () => {
    const kv = new FakeKvNamespace();
    kv.entries.set("cached", { value: '{"token":"must-survive-redaction"}' });

    await callThroughHandler(envWith(kv), (env) =>
      (env.MY_KV as FakeKvNamespace).get("cached"),
    );

    expect(kvEvents()[0].result?.body).toContain("must-survive-redaction");
  });

  it("records a delete, a list and getWithMetadata", async () => {
    const kv = new FakeKvNamespace();
    await kv.put("watchlist:u1:a", "a", { metadata: { addedAt: "1" } });
    await kv.put("watchlist:u1:b", "b");

    await callThroughHandler(envWith(kv), async (env) => {
      const namespace = env.MY_KV as FakeKvNamespace;
      await namespace.getWithMetadata("watchlist:u1:a");
      await namespace.list({ prefix: "watchlist:u1:" });
      await namespace.delete("watchlist:u1:b");
      return null;
    });

    const events = kvEvents();
    expect(events.map((event) => event.operation)).toEqual([
      "getWithMetadata",
      "list",
      "delete",
    ]);

    const [withMetadata, list, deleted] = events;
    expect(JSON.parse(withMetadata.result?.body ?? "")).toEqual({
      value: "a",
      metadata: { addedAt: "1" },
    });
    // `list` spans keys, so it has no single key — its selector is in the args instead.
    expect(list.key).toBeUndefined();
    expect(JSON.parse(list.args?.body ?? "")).toEqual([
      { prefix: "watchlist:u1:" },
    ]);
    expect(JSON.parse(list.result?.body ?? "")).toMatchObject({
      keys: [{ name: "watchlist:u1:a" }, { name: "watchlist:u1:b" }],
    });
    expect(deleted).toMatchObject({
      operation: "delete",
      key: "watchlist:u1:b",
    });
    expect(deleted.result).toBeUndefined();
  });

  it("records a bulk read's Map result as an object", async () => {
    const kv = new FakeKvNamespace();
    await kv.put("a", "1");
    await kv.put("b", "2");

    await callThroughHandler(envWith(kv), (env) =>
      (env.MY_KV as FakeKvNamespace).get(["a", "b"]),
    );

    const [event] = kvEvents();
    // An array of keys is not a single key; it stays in the args.
    expect(event.key).toBeUndefined();
    expect(JSON.parse(event.args?.body ?? "")).toEqual([["a", "b"]]);
    // Without Map handling JSON.stringify would flatten this to {}.
    expect(JSON.parse(event.result?.body ?? "")).toEqual({ a: "1", b: "2" });
  });

  it("leaves a stream value unread, recording why it is absent", async () => {
    const kv = new FakeKvNamespace();
    kv.entries.set("blob", {
      value: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("stream-bytes"));
          controller.close();
        },
      }),
    });

    const returned = await callThroughHandler(envWith(kv), (env) =>
      (env.MY_KV as FakeKvNamespace).get("blob"),
    );

    const [event] = kvEvents();
    expect(event.omitted).toBe("stream");
    expect(event.result?.body).toBe("null");
    // The bytes must still be the app's to read.
    expect(await new Response(returned as ReadableStream).text()).toBe(
      "stream-bytes",
    );
  });

  it("skips a binary value rather than mangling it", async () => {
    const kv = new FakeKvNamespace();
    kv.entries.set("blob", { value: new TextEncoder().encode("bytes").buffer });

    await callThroughHandler(envWith(kv), (env) =>
      (env.MY_KV as FakeKvNamespace).get("blob"),
    );

    expect(kvEvents()[0]).toMatchObject({ omitted: "binary" });
    expect(kvEvents()[0].result?.body).toBe("null");
  });

  it("truncates an oversized value", async () => {
    const kv = new FakeKvNamespace();
    kv.entries.set("big", { value: "x".repeat(300 * 1024) });

    await callThroughHandler(envWith(kv), (env) =>
      (env.MY_KV as FakeKvNamespace).get("big"),
    );

    const [event] = kvEvents();
    expect(event.result?.truncated).toBe(true);
    expect(event.result?.body.length).toBe(256 * 1024);
  });

  it("does not record a namespace named in skipBindings", async () => {
    const kv = new FakeKvNamespace();
    await callThroughHandler(
      envWith(kv, "CACHE_KV"),
      (env) => (env.CACHE_KV as FakeKvNamespace).get("k"),
      { skipBindings: ["CACHE_KV"] },
    );

    expect(kvEvents()).toHaveLength(0);
    // The inbound request is still recorded — only the namespace is skipped.
    expect(receivedEvents.some((event) => event.kind === "inbound")).toBe(true);
  });

  it("parents the KV event under the inbound request", async () => {
    const kv = new FakeKvNamespace();
    await callThroughHandler(
      envWith(kv),
      (env) => (env.MY_KV as FakeKvNamespace).get("k"),
      { sessionId: "fs-kv-parent" },
    );

    const inbound = receivedEvents.find((event) => event.kind === "inbound");
    expect(inbound).toBeDefined();
    expect(kvEvents()[0].requestId).toBe(inbound?.requestId);
  });

  it("records a failed operation and still rejects", async () => {
    const kv = new FailingKvNamespace();
    await expect(
      callThroughHandler(envWith(kv), (env) =>
        (env.MY_KV as FakeKvNamespace).get("k"),
      ),
    ).rejects.toThrow("kv is down");

    const [event] = kvEvents();
    expect(event).toMatchObject({ operation: "get", key: "k" });
    expect(event.error).toContain("kv is down");
    expect(event.result).toBeUndefined();
  });

  it("does not record when no sidecar is configured", async () => {
    const kv = new FakeKvNamespace();
    const returned = await callThroughHandler({ MY_KV: kv }, (env) =>
      (env.MY_KV as FakeKvNamespace).get("k"),
    );

    expect(returned).toBeNull();
    expect(receivedEvents).toHaveLength(0);
  });

  it("does not record an operation made outside a handled request", async () => {
    const kv = new FakeKvNamespace();
    // Installs the patch, so the prototype stays patched for the direct call below.
    await callThroughHandler(envWith(kv), (env) =>
      (env.MY_KV as FakeKvNamespace).get("k"),
    );
    receivedEvents = [];

    await kv.get("k");
    expect(kvEvents()).toHaveLength(0);
  });

  it("records only namespaces found on env, not everything sharing their methods", async () => {
    const onEnv = new FakeKvNamespace();
    // Same class, so the same patched prototype methods — but never exposed on `env`, which is
    // what the allow-list is for: the patch can land on a prototype shared with another
    // binding type, and only a discovered namespace should be recorded.
    const offEnv = new FakeKvNamespace();

    await callThroughHandler(envWith(onEnv), async (env) => {
      await (env.MY_KV as FakeKvNamespace).get("on-env");
      await offEnv.get("off-env");
      return null;
    });

    expect(kvEvents().map((event) => event.key)).toEqual(["on-env"]);
  });

  it("ignores bindings that are not KV namespaces", async () => {
    const notKv = {
      get: () => Promise.resolve(null),
      put: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      list: () => Promise.resolve({ objects: [] }),
      head: () => Promise.resolve(null),
    };

    await callThroughHandler(envWith(notKv, "BUCKET"), (env) =>
      (env.BUCKET as { get: () => Promise<unknown> }).get(),
    );

    // An R2 bucket has get/put/delete/list too — getWithMetadata is what tells them apart.
    expect(kvEvents()).toHaveLength(0);
  });
});
