import type { CaptureEvent } from "@alwaysmeticulous/backend-recorder-workerd";
import {
  SIDECAR_EVENTS_PATH,
  SIDECAR_PROTOCOL_VERSION,
  SIDECAR_PROTOCOL_VERSION_HEADER,
} from "@alwaysmeticulous/backend-recorder-workerd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SidecarEnv } from "../env";
import sidecarWorker from "../index";
import { MeticulousRecorderSession } from "../recorder-session-object";
import type * as s3Storage from "../s3/storage";
import type { StorageBackend } from "../s3/storage";
import type { SessionState } from "../session-store";

/**
 * Drives the whole sidecar — Worker handler, Durable Object, span assembly, upload — with the S3
 * write faked and the Durable Objects runtime replaced by the in-memory double below.
 *
 * The double is faithful about the two things this design depends on: storage is the only state
 * that survives (nothing is kept on the instance), and the alarm is the only thing that triggers a
 * flush. `evict()` reconstructs the object from storage alone, which is what a real eviction
 * between a report and its alarm does.
 */

class FakeStorage {
  private readonly entries = new Map<string, unknown>();
  alarmAt: number | null = null;
  /** Rejects the next N writes, for the failure paths the object has to answer honestly about. */
  failNextPuts = 0;
  /** Refuses any value whose JSON exceeds this, as the real 2 MB per-entry limit does. */
  maxValueChars = Infinity;

  get<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(structuredClone(this.entries.get(key)) as T);
  }

  put<T>(
    keyOrEntries: string | Record<string, unknown>,
    value?: T,
  ): Promise<void> {
    if (this.failNextPuts > 0) {
      this.failNextPuts--;
      return Promise.reject(new Error("storage is unavailable"));
    }
    const entries =
      typeof keyOrEntries === "string"
        ? { [keyOrEntries]: value }
        : keyOrEntries;
    for (const [key, entryValue] of Object.entries(entries)) {
      const chars = JSON.stringify(entryValue)?.length ?? 0;
      if (chars > this.maxValueChars) {
        return Promise.reject(
          new Error(`value for ${key} is too large (${chars} chars)`),
        );
      }
    }
    // Multi-key puts are atomic in the real thing, and this loop is only reached once every
    // entry has been size-checked, so a rejection above leaves nothing half-written.
    for (const [key, entryValue] of Object.entries(entries)) {
      this.entries.set(key, structuredClone(entryValue));
    }
    return Promise.resolve();
  }

  delete(keys: string | string[]): Promise<number> {
    const list = Array.isArray(keys) ? keys : [keys];
    let deleted = 0;
    for (const key of list) {
      if (this.entries.delete(key)) {
        deleted++;
      }
    }
    return Promise.resolve(deleted);
  }

  list<T>(options: {
    prefix: string;
    limit?: number;
  }): Promise<Map<string, T>> {
    const matched = [...this.entries.entries()]
      .filter(([key]) => key.startsWith(options.prefix))
      // Real DO storage lists lexicographically; the batch keys are zero-padded for that reason.
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .slice(0, options.limit ?? Infinity);
    return Promise.resolve(
      new Map(
        matched.map(([key, value]) => [key, structuredClone(value) as T]),
      ),
    );
  }

  getAlarm(): Promise<number | null> {
    return Promise.resolve(this.alarmAt);
  }

  setAlarm(scheduledTime: number): Promise<void> {
    this.alarmAt = scheduledTime;
    return Promise.resolve();
  }
}

/** One named Durable Object: its storage, and however many instances have been built over it. */
class FakeDurableObject {
  readonly storage = new FakeStorage();
  private instance: MeticulousRecorderSession;

  constructor(private readonly env: SidecarEnv) {
    this.instance = this.build();
  }

  fetch(request: Request): Promise<Response> {
    return this.instance.fetch(request);
  }

  /** Fires the pending alarm, as the runtime would once the scheduled time arrives. */
  async runAlarm(): Promise<void> {
    if (this.storage.alarmAt === null) {
      return;
    }
    this.storage.alarmAt = null;
    await this.instance.alarm();
  }

  /** Throws the instance away and rebuilds from storage, as an eviction does. */
  evict(): void {
    this.instance = this.build();
  }

  private build(): MeticulousRecorderSession {
    return new MeticulousRecorderSession({ storage: this.storage }, this.env);
  }
}

class FakeNamespace {
  readonly objects = new Map<string, FakeDurableObject>();

  constructor(private readonly env: SidecarEnv) {}

  idFromName(name: string): string {
    return name;
  }

  get(id: unknown): FakeDurableObject {
    const name = id as string;
    let object = this.objects.get(name);
    if (object === undefined) {
      object = new FakeDurableObject(this.env);
      this.objects.set(name, object);
    }
    return object;
  }

  /** Fires every pending alarm, so a test can flush without knowing the sharding. */
  async runAlarms(): Promise<void> {
    for (const object of this.objects.values()) {
      await object.runAlarm();
    }
  }
}

let writes: { key: string; data: unknown }[];
let failNextWrites: number;
let env: SidecarEnv;
let namespace: FakeNamespace;

const storageBackend: StorageBackend = {
  write: (key, data) => {
    if (failNextWrites > 0) {
      failNextWrites--;
      return Promise.reject(new Error("S3 is down"));
    }
    writes.push({ key, data: structuredClone(data) });
    return Promise.resolve();
  },
};

// The object builds its own S3 backend, so the module is stubbed rather than injected — the wiring
// from config to backend is what would otherwise go untested.
vi.mock("../s3/storage", async (importOriginal) => {
  const original = await importOriginal<typeof s3Storage>();
  return {
    ...original,
    S3StorageBackend: class {
      write(key: string, data: unknown): Promise<void> {
        return storageBackend.write(key, data);
      }
    },
  };
});

const event = (overrides: Partial<CaptureEvent> = {}): CaptureEvent =>
  ({
    kind: "inbound",
    requestId: "req-1",
    frontendSessionId: "fs-1",
    traceId: "a".repeat(32),
    serverSpanId: "b".repeat(16),
    method: "GET",
    url: "https://app.example/page",
    requestHeaders: {},
    statusCode: 200,
    startTimeMs: 1_000,
    endTimeMs: 1_050,
    ...overrides,
  }) as CaptureEvent;

const report = (events: CaptureEvent[]): Promise<Response> =>
  sidecarWorker.fetch(
    new Request(`https://sidecar.invalid${SIDECAR_EVENTS_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [SIDECAR_PROTOCOL_VERSION_HEADER]: SIDECAR_PROTOCOL_VERSION,
      },
      body: JSON.stringify({ events }),
    }),
    env,
  );

beforeEach(() => {
  writes = [];
  failNextWrites = 0;
  env = {
    METICULOUS_RECORDING_TOKEN: "tok_0123456789abcdef",
    METICULOUS_PROJECT_NAME: "my-app",
    METICULOUS_LOG_LEVEL: "silent",
  };
  namespace = new FakeNamespace(env);
  env.METICULOUS_SESSION = namespace;
});

describe("the sidecar worker", () => {
  it("accepts a batch and uploads it as a chunk on the alarm", async () => {
    const response = await report([event(), event({ kind: "inbound" })]);
    expect(response.status).toBe(204);
    // Nothing is uploaded on the app's waitUntil — that is the whole point of the two hops.
    expect(writes).toHaveLength(0);

    await namespace.runAlarms();

    const [metadata, chunk] = writes;
    expect(metadata.key).toMatch(
      /^tok_01234567\/BE_.+_[0-9a-f]{16}\/metadata\.json$/,
    );
    expect(metadata.data).toMatchObject({
      projectID: "tok_0123456789abcdef",
      source: "backend-recorder",
      meticulousProjectName: "my-app",
    });
    // The key prefix is the first 12 characters of the token — ingestion lists exactly that.
    expect(chunk.key).toBe(`${metadata.key.replace("/metadata.json", "")}/1`);
    expect(chunk.data).toMatchObject({
      backendRecorderToken: "tok_0123456789abcdef",
    });
  });

  it("builds spans that carry the shim's trace ids and the session attribute", async () => {
    await report([
      event(),
      event({
        kind: "outbound",
        url: "https://api.example/items",
        method: "POST",
        statusCode: 201,
      } as Partial<CaptureEvent>),
    ]);
    await namespace.runAlarms();

    const spans = (writes[1].data as { spans: Record<string, unknown>[] })
      .spans;
    expect(spans).toHaveLength(2);
    // One trace for the request, with the CLIENT span parented under the SERVER span — which only
    // works because the shim stamped the ids, so assembly needs no memory across chunks.
    expect(new Set(spans.map((span) => span.traceId))).toEqual(
      new Set(["a".repeat(32)]),
    );
    const server = spans.find((span) => span.kind === 1);
    const client = spans.find((span) => span.kind === 2);
    expect(server?.spanId).toBe("b".repeat(16));
    expect(client?.parentSpanId).toBe("b".repeat(16));
    // Lifted to the top level by serializeSpan; ingestion correlates on this.
    expect(server?.frontendSessionId).toBe("fs-1");
    expect(client?.clientTechnology).toBe("workerd-fetch");
  });

  it("puts many frontend sessions in one backend session", async () => {
    await report([event({ frontendSessionId: "fs-a" })]);
    await report([event({ frontendSessionId: "fs-b", requestId: "req-2" })]);
    await namespace.runAlarms();

    // One metadata.json and one chunk: fan-in, exactly as the local Node sidecar does it, which is
    // what keeps the object count (and ingestion's scan over it) the same as a local recording's.
    expect(
      writes.filter((write) => write.key.endsWith("metadata.json")),
    ).toHaveLength(1);
    const spans = (writes[1].data as { spans: { frontendSessionId: string }[] })
      .spans;
    expect(spans.map((span) => span.frontendSessionId).sort()).toEqual([
      "fs-a",
      "fs-b",
    ]);
  });

  it("keeps buffered batches through an eviction", async () => {
    await report([event()]);
    // An alarm survives eviction but instance state does not, so a batch held in memory would be
    // lost here. This is why every batch is persisted the moment it arrives.
    namespace.get("recorder-0").evict();
    await namespace.runAlarms();

    expect(writes).toHaveLength(2);
    expect((writes[1].data as { spans: unknown[] }).spans).toHaveLength(1);
  });

  it("numbers chunks monotonically across flushes", async () => {
    for (const requestId of ["req-1", "req-2", "req-3"]) {
      await report([event({ requestId })]);
      await namespace.runAlarms();
    }

    const chunkKeys = writes
      .filter((write) => !write.key.endsWith("metadata.json"))
      .map((write) => write.key.split("/").pop());
    expect(chunkKeys).toEqual(["1", "2", "3"]);
  });

  it("re-arms the alarm when a batch arrives during a flush", async () => {
    await report([event()]);
    await namespace.runAlarms();
    const object = namespace.get("recorder-0");
    expect(object.storage.alarmAt).toBeNull();

    await report([event({ requestId: "req-2" })]);
    expect(object.storage.alarmAt).not.toBeNull();
  });

  it("abandons the session after repeated upload failures", async () => {
    // Three consecutive chunk failures, matching the Node exporter's threshold.
    failNextWrites = 1; // metadata.json
    await report([event()]);
    await namespace.runAlarms();
    const abandoned = writes.find((write) =>
      write.key.endsWith("abandoned.json"),
    );
    // A marker, rather than silence: ingestion must not read a truncated recording as a whole one.
    expect(abandoned?.data).toEqual({
      abandoned: true,
      reason: "metadata_upload_failed",
    });
  });

  it("starts a fresh session once the abandon cooldown has passed", async () => {
    failNextWrites = 1; // metadata.json — abandons the session
    await report([event()]);
    await namespace.runAlarms();
    writes = [];

    // Still inside the back-off: nothing is uploaded, which is the point of abandoning.
    await report([event({ requestId: "req-2" })]);
    await namespace.runAlarms();
    expect(writes).toHaveLength(0);

    // Past it, the object recovers on its own. A Durable Object outlives the outage that killed
    // the session, so a permanent flag would end recording for the deployment until its storage
    // was wiped by hand. The stored timestamp is rewound rather than the clock moved, so this
    // test needs no global fake timers.
    const object = namespace.get("recorder-0");
    const state = await object.storage.get<SessionState>("session");
    await object.storage.put("session", {
      ...state,
      abandonedAtMs: Date.now() - (5 * 60 * 1000 + 1),
    });

    await report([event({ requestId: "req-3" })]);
    await namespace.runAlarms();
    expect(writes.map((write) => write.key.split("/").pop())).toEqual([
      "metadata.json",
      "1",
    ]);
  });

  it("splits a report too large for one storage value", async () => {
    const object = namespace.get("recorder-0");
    // The real per-entry limit of a SQLite-backed object, so this exercises the production
    // budget rather than a number invented for the test.
    object.storage.maxValueChars = 2 * 1024 * 1024;

    // ~2.1 MB across three events: over the limit as one value, fine once split.
    const big = (requestId: string): CaptureEvent =>
      event({ requestId, url: `https://app.example/${"p".repeat(700_000)}` });
    const response = await report([big("req-1"), big("req-2"), big("req-3")]);

    // Writing all three as one value would exceed the limit and lose the whole report.
    expect(response.status).toBe(204);
    await namespace.runAlarms();
    expect(writes).toHaveLength(2); // metadata.json + one chunk holding all three spans
    const chunk = writes[1]?.data as { spans: unknown[] } | undefined;
    expect(chunk?.spans).toHaveLength(3);
  });

  it("tells the shim when the events could not be buffered", async () => {
    const object = namespace.get("recorder-0");
    object.storage.failNextPuts = 1;

    // Not 204: the shim does not retry, so a cheerful answer here is how spans go missing with no
    // signal anywhere.
    const response = await report([event()]);
    expect(response.status).toBe(500);
  });

  it("works off a capped backlog without waiting another interval", async () => {
    for (let i = 0; i < 65; i++) {
      await report([event({ requestId: `req-${i}` })]);
    }
    const object = namespace.get("recorder-0");
    const before = Date.now();
    await namespace.runAlarms();
    const after = Date.now();

    // 65 batches against a 64-batch cap leaves one behind; it should be picked up immediately
    // rather than after another full flush interval. Bounded by the wall-clock either side of the
    // drain rather than by a fixed tolerance: the alarm is set partway through, so how long the
    // drain itself takes must not decide whether this passes.
    expect(object.storage.alarmAt).not.toBeNull();
    expect(object.storage.alarmAt).toBeGreaterThanOrEqual(before);
    expect(object.storage.alarmAt).toBeLessThanOrEqual(after);
  });

  it("flushes on demand without waiting for the alarm", async () => {
    await report([event()]);
    const response = await sidecarWorker.fetch(
      new Request("https://sidecar.invalid/v1/flush", { method: "POST" }),
      env,
    );

    expect(response.status).toBe(204);
    expect(writes).toHaveLength(2);
  });

  it("rejects a protocol version it does not speak", async () => {
    const response = await sidecarWorker.fetch(
      new Request(`https://sidecar.invalid${SIDECAR_EVENTS_PATH}`, {
        method: "POST",
        headers: { [SIDECAR_PROTOCOL_VERSION_HEADER]: "99" },
        body: JSON.stringify({ events: [event()] }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Align the");
  });

  it("does not call an empty recording token configured", async () => {
    // What the shipped wrangler template ships, and what the events route rejects — so reporting
    // it as healthy would mean a green health check on a sidecar that 500s every report.
    env.METICULOUS_RECORDING_TOKEN = "";
    const response = await sidecarWorker.fetch(
      new Request("https://sidecar.invalid/v1/health"),
      env,
    );

    expect(await response.json()).toEqual({ ok: true, configured: false });
  });

  it("reports whether it is configured on the health route", async () => {
    const healthy = await sidecarWorker.fetch(
      new Request("https://sidecar.invalid/v1/health"),
      env,
    );
    expect(await healthy.json()).toEqual({ ok: true, configured: true });

    // A missing token is otherwise a silent misconfiguration: reports are accepted and the
    // recording lands nowhere a customer can find it.
    const unconfigured = await sidecarWorker.fetch(
      new Request("https://sidecar.invalid/v1/health"),
      { ...env, METICULOUS_RECORDING_TOKEN: undefined },
    );
    expect(await unconfigured.json()).toEqual({ ok: true, configured: false });
  });

  it("refuses to record without a token, rather than uploading nowhere", async () => {
    expect((await report([event()])).status).toBe(204);

    const withoutToken = await sidecarWorker.fetch(
      new Request(`https://sidecar.invalid${SIDECAR_EVENTS_PATH}`, {
        method: "POST",
        headers: {
          [SIDECAR_PROTOCOL_VERSION_HEADER]: SIDECAR_PROTOCOL_VERSION,
        },
        body: JSON.stringify({ events: [event()] }),
      }),
      { ...env, METICULOUS_RECORDING_TOKEN: "" },
    );
    expect(withoutToken.status).toBe(500);
  });

  it("404s an unknown route", async () => {
    const response = await sidecarWorker.fetch(
      new Request("https://sidecar.invalid/v1/whatever", { method: "POST" }),
      env,
    );
    expect(response.status).toBe(404);
  });

  it("spreads reports across shards when configured to", async () => {
    env.METICULOUS_SIDECAR_SHARDS = "4";

    for (const requestId of ["req-a", "req-b", "req-c", "req-d", "req-e"]) {
      await report([event({ requestId })]);
    }
    await namespace.runAlarms();

    // Sharding is only about a single object's throughput ceiling. Nothing downstream keys off
    // which object a span passed through, so more than one backend session is fine.
    expect(namespace.objects.size).toBeGreaterThan(1);
    expect(namespace.objects.size).toBeLessThanOrEqual(4);
    const totalSpans = writes
      .filter((write) => !write.key.endsWith("metadata.json"))
      .reduce(
        (sum, write) => sum + (write.data as { spans: unknown[] }).spans.length,
        0,
      );
    expect(totalSpans).toBe(5);
  });
  // The safety net beneath the shim's own check: redeploying this Worker leaves the app
  // untouched, whereas the shim-side check needs a bundle bump and an app redeploy — so
  // repeating the verdict here is what makes the exclusion reach an already-deployed app.
  // Request ids are unique per test so the per-isolate straggler memory cannot leak between
  // them.
  it("drops a health probe's events instead of uploading them", async () => {
    const response = await report([
      event({
        requestId: "probe-a",
        url: "https://app.example/health",
        frontendSessionId: undefined,
      }),
      event({
        kind: "outbound",
        requestId: "probe-a",
        url: "https://api.example/ping",
        frontendSessionId: undefined,
      } as Partial<CaptureEvent>),
    ]);
    expect(response.status).toBe(204);

    await namespace.runAlarms();

    // Not even a metadata.json: the batch never reached the Durable Object.
    expect(writes).toHaveLength(0);
    expect(namespace.objects.size).toBe(0);
  });

  it("keeps a real request batched alongside a probe", async () => {
    await report([
      event({
        requestId: "probe-b",
        url: "https://app.example/healthz",
        frontendSessionId: undefined,
      }),
      event({ requestId: "real-b", url: "https://app.example/page" }),
    ]);
    await namespace.runAlarms();

    const chunk = writes.find((write) => !write.key.endsWith("metadata.json"));
    if (chunk === undefined) {
      throw new Error("expected one chunk upload");
    }
    const spans = (chunk.data as { spans: { frontendSessionId?: string }[] })
      .spans;
    expect(spans).toHaveLength(1);
    expect(spans[0].frontendSessionId).toBe("fs-1");
  });
});
