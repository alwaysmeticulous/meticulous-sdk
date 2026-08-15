import {
  type CaptureEventsPayload,
  SIDECAR_EVENTS_PATH,
  SIDECAR_PROTOCOL_VERSION,
  SIDECAR_PROTOCOL_VERSION_HEADER,
} from "@alwaysmeticulous/backend-recorder-workerd";
import { resolveSidecarConfig, type SidecarEnv } from "./env";
import { log, setLogLevel } from "./log";
import { MeticulousRecorderSession } from "./recorder-session-object";

export { MeticulousRecorderSession } from "./recorder-session-object";
export type { DurableContext } from "./recorder-session-object";
export type {
  DurableObjectNamespaceLike,
  SidecarConfig,
  SidecarEnv,
} from "./env";
export { resolveSidecarConfig } from "./env";
export {
  flushChunk,
  newSessionState,
  type SessionState,
  type SessionStoreConfig,
} from "./session-store";
export {
  DEFAULT_IDENTITY_POOL_ID,
  DEFAULT_S3_BUCKET,
  DEFAULT_S3_REGION,
  S3StorageBackend,
  type S3StorageConfig,
  type StorageBackend,
} from "./s3/storage";
export { signRequest } from "./s3/sigv4";
export { METICULOUS_COMMIT_HASH } from "./version";

const HEALTH_PATH = "/v1/health";
const FLUSH_PATH = "/v1/flush";

/**
 * A single batch's size ceiling, matching the Node sidecar's. The shim bounds a batch at 2 MB of
 * JSON, so this leaves ample headroom while still refusing anything pathological.
 */
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;

/**
 * The Meticulous backend recorder sidecar, as a Cloudflare Worker.
 *
 * Deploy it into your own account and point your app's Worker at it with a service binding named
 * `METICULOUS_SIDECAR`; the shim (`@alwaysmeticulous/backend-recorder-workerd`) does the rest. It
 * is what makes recording possible from a **deployed** Worker or Pages project, where there is no
 * local sidecar process to post to.
 *
 * Two hops, on purpose. This handler is thin — validate, hand the batch to the Durable Object,
 * answer 204 — because the app's `ctx.waitUntil` is blocked until it returns. Everything expensive
 * (span building, the S3 upload) happens on the object's alarm, well after the app's response has
 * gone out. See `recorder-session-object.ts`.
 *
 * **This Worker must not have a public route.** The capture protocol carries no authentication —
 * it was designed for a loopback sidecar — so a `workers.dev` subdomain would be an open endpoint
 * that writes spans into your Meticulous project. The shipped `wrangler.template.toml` sets
 * `workers_dev = false` for that reason.
 */
export default {
  async fetch(request: Request, env: SidecarEnv): Promise<Response> {
    setLogLevel(env.METICULOUS_LOG_LEVEL);
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === HEALTH_PATH) {
      return json(200, {
        ok: true,
        // Surfaced so a misconfigured deployment is one curl away from being obvious, rather than
        // silently recording into no project at all. Exactly the condition the events route
        // enforces below — the shipped wrangler template ships the var as `""`, so a mere
        // `!== undefined` would call the out-of-the-box config healthy while every report 500s.
        configured: hasRecordingToken(env),
      });
    }

    if (env.METICULOUS_SESSION === undefined) {
      log.error(
        "The METICULOUS_SESSION Durable Object binding is missing — deploy with the wrangler config this package ships.",
      );
      return json(500, { error: "sidecar is not configured" });
    }
    if (!hasRecordingToken(env)) {
      log.error(
        "METICULOUS_RECORDING_TOKEN is not set — there is no project to record into.",
      );
      return json(500, { error: "sidecar is not configured" });
    }

    if (request.method === "POST" && url.pathname === FLUSH_PATH) {
      // Uploads whatever is buffered without waiting out the alarm. Useful at the end of a CI run
      // that recorded against a preview deployment, so the recording is on S3 before the job ends.
      const flushed = await Promise.all(
        shardNames(env).map((name) =>
          sessionStub(env, name).fetch(
            new Request("https://session.invalid/flush", { method: "POST" }),
          ),
        ),
      );
      const failed = flushed.filter((response) => !response.ok).length;
      if (failed > 0) {
        log.error(`${failed} shard(s) failed to flush`);
        return json(500, { error: "flush failed" });
      }
      return new Response(null, { status: 204 });
    }

    if (request.method !== "POST" || url.pathname !== SIDECAR_EVENTS_PATH) {
      return json(404, { error: "not found" });
    }

    const version = request.headers.get(SIDECAR_PROTOCOL_VERSION_HEADER);
    if (version !== SIDECAR_PROTOCOL_VERSION) {
      return json(400, {
        error:
          `Unsupported sidecar protocol version "${String(version)}" — this sidecar speaks ` +
          `version ${SIDECAR_PROTOCOL_VERSION}. Align the ` +
          "@alwaysmeticulous/backend-recorder-workerd shim and sidecar versions.",
      });
    }

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_PAYLOAD_BYTES) {
      return json(413, { error: "payload too large" });
    }

    let payload: CaptureEventsPayload;
    try {
      payload = (await request.json()) as CaptureEventsPayload;
    } catch {
      return json(400, { error: "invalid JSON" });
    }
    if (!Array.isArray(payload.events)) {
      return json(400, { error: "missing events array" });
    }
    if (payload.events.length === 0) {
      return new Response(null, { status: 204 });
    }

    // Which shard a batch lands on does not matter, so the cheapest available spread is used:
    // the first event's request id, which keeps one request's events together in one chunk.
    const shard = pickShard(env, payload.events[0]?.requestId);
    const accepted = await sessionStub(env, shard).fetch(
      new Request("https://session.invalid/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload.events),
      }),
    );
    // Answering 204 regardless would tell the shim the batch is durable when a storage error or an
    // overloaded object had just dropped it. The shim does not retry, so the only thing that can
    // make the loss visible is this status: it warns once on a non-2xx.
    if (!accepted.ok) {
      log.error(
        `${shard} rejected ${payload.events.length} event(s) (HTTP ${accepted.status}) — they are lost`,
      );
      return json(500, { error: "failed to buffer events" });
    }
    log.info(`Accepted ${payload.events.length} event(s) into ${shard}`);
    return new Response(null, { status: 204 });
  },
};

/**
 * Whether there is a project to record into. An empty string counts as unset: that is what the
 * shipped `wrangler.template.toml` ships, so it is the shape a half-finished setup actually has.
 */
const hasRecordingToken = (env: SidecarEnv): boolean =>
  env.METICULOUS_RECORDING_TOKEN !== undefined &&
  env.METICULOUS_RECORDING_TOKEN !== "";

const SHARD_PREFIX = "recorder-";

const shardNames = (env: SidecarEnv): string[] => {
  const { shards } = resolveSidecarConfig(env);
  return Array.from({ length: shards }, (_, index) => shardName(index));
};

const shardName = (index: number): string => `${SHARD_PREFIX}${index}`;

const pickShard = (env: SidecarEnv, requestId: string | undefined): string => {
  const { shards } = resolveSidecarConfig(env);
  if (shards === 1 || requestId === undefined) {
    return shardName(0);
  }
  return shardName(hashToIndex(requestId, shards));
};

/** FNV-1a. Only needs to spread evenly; nothing depends on which shard a value lands on. */
const hashToIndex = (value: string, buckets: number): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % buckets;
};

const sessionStub = (
  env: SidecarEnv,
  name: string,
): { fetch(request: Request): Promise<Response> } => {
  const namespace = env.METICULOUS_SESSION;
  if (namespace === undefined) {
    throw new Error("METICULOUS_SESSION binding is missing");
  }
  return namespace.get(namespace.idFromName(name));
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// Referenced so the Durable Object class cannot be tree-shaken out of the bundle: workerd resolves
// it by name from the module's exports, which a bundler has no way to know.
void MeticulousRecorderSession;
