import { installBindingPatch } from "./binding-patch";
import {
  type RequestCaptureContext,
  type RequestReplayContext,
  requestCaptureContext,
} from "./context";
import { installFetchPatch } from "./fetch-patch";
import { installKvPatch } from "./kv-patch";
import { warnOnce } from "./log";
import { getOriginalFetch } from "./original-fetch";
import { headersToRecord } from "./outbound-capture";
import {
  FRONTEND_SESSION_ID_HEADER,
  type InboundRequestEvent,
  REPLAY_SIDECAR_URL_HEADER,
} from "./protocol";
import { parseReplaySidecarUrl } from "./replay-sidecar-url";
import { getReplaySessionInfo, postCaptureEvents } from "./sidecar-client";
import { installVirtualClock } from "./virtual-clock";
import { installVirtualRandom } from "./virtual-random";

export type {
  BindingRequestEvent,
  CaptureEvent,
  CapturedBody,
  CaptureEventsPayload,
  InboundRequestEvent,
  KvOmittedReason,
  KvOperation,
  KvOperationEvent,
  OutboundFetchLookupRequest,
  OutboundFetchLookupResponse,
  OutboundRequestEvent,
  ReplaySessionInfoResponse,
} from "./protocol";
export {
  CAPTURED_HEADERS,
  FRONTEND_SESSION_ID_HEADER,
  METICULOUS_PASSTHROUGH_HEADER,
  REPLAY_SIDECAR_URL_HEADER,
  SIDECAR_EVENTS_PATH,
  SIDECAR_PROTOCOL_VERSION,
  SIDECAR_PROTOCOL_VERSION_HEADER,
  SIDECAR_REPLAY_OUTBOUND_FETCH_PATH,
  SIDECAR_REPLAY_SESSION_PATH,
} from "./protocol";
export {
  MAX_BODY_CAPTURE_SIZE,
  readBodyWithCap,
  readRequestBodyWithCap,
} from "./body-capture";
export { headersToRecord } from "./outbound-capture";
export { redactRequestBody, STR_REDACTED } from "./redact-body";

/** Structural subset of workerd's ExecutionContext — avoids a @cloudflare/workers-types dependency. */
export interface MeticulousExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

/** Structural subset of an ES-module Worker handler (`export default {...}`). */
export interface MeticulousWorkerHandler<Env = never> {
  fetch(
    request: Request,
    env: Env,
    ctx: MeticulousExecutionContext,
  ): Response | Promise<Response>;
}

export interface WithMeticulousOptions {
  /** Overrides the sidecar origin; defaults to the METICULOUS_SIDECAR_URL var/binding. */
  sidecarUrl?: string;
  /**
   * Binding names to leave unrecorded, on top of the defaults (`ASSETS`,
   * `__STATIC_CONTENT`). Use this for a binding whose traffic is high-volume or binary.
   * Applies to KV namespaces as well as `fetch`-shaped bindings.
   */
  skipBindings?: readonly string[];
}

/**
 * Wraps an ES-module Worker handler so Meticulous can record, or replay, the app's HTTP
 * behaviour:
 *
 *   export default withMeticulous({
 *     async fetch(request, env, ctx) { ... },
 *   });
 *
 * **Recording** activates on a `METICULOUS_SIDECAR_URL` var/binding (e.g. via `.dev.vars`
 * or `wrangler dev --var`) or `options.sidecarUrl`. Inbound requests, outgoing `fetch`
 * calls, calls through `fetch`-shaped bindings and KV namespace operations are reported to
 * the sidecar as capture events, without affecting the app.
 *
 * **Replay** activates on the `x-meticulous-backend-replay-sidecar-url` header, injected by
 * the Meticulous replay runner on requests to the app under test. Outgoing `fetch` calls are
 * then served from the recording instead of reaching the real service — and a call the
 * recording does not cover fails, rather than quietly becoming live traffic; put a
 * `meticulous-passthrough: true` header on a request that must stay real. The clock is frozen
 * at the recorded session's end so recorded credentials are still valid, and `Math.random` /
 * `crypto.randomUUID` / `crypto.getRandomValues` are seeded so ids the app mints are the same
 * in every replay of that session. Workerd
 * cannot read container environment variables, which is why per-replay config arrives as a
 * request header; the shim validates it and only honours a loopback / docker-gateway /
 * private-network `http:` origin.
 *
 * Replay takes precedence over recording when both are configured. A stale
 * `METICULOUS_SIDECAR_URL` baked into an image's `.dev.vars` is far more likely than a
 * spurious replay header (nothing but the replay runner emits it), and letting the env win
 * would silently record a replay instead of mocking it.
 *
 * With neither configured the wrapper is a complete pass-through, so it is safe to keep in
 * deployed code. Requires the `nodejs_als` (or `nodejs_compat`) compatibility flag. A
 * capture failure or unreachable sidecar never affects the app.
 */
export const withMeticulous = <H extends MeticulousWorkerHandler<never>>(
  handler: H,
  options?: WithMeticulousOptions,
): H => {
  const wrappedFetch = async (
    request: Request,
    env: unknown,
    ctx: MeticulousExecutionContext,
  ): Promise<Response> => {
    const invokeHandler = () => handler.fetch(request, env as never, ctx);

    let sidecarUrl: string | undefined;
    let replayContext: RequestReplayContext | undefined;
    try {
      replayContext = await resolveReplayContext(request, ctx);
      sidecarUrl =
        replayContext === undefined
          ? resolveSidecarUrl(options, env)
          : undefined;
      if (replayContext !== undefined || sidecarUrl !== undefined) {
        installFetchPatch();
      }
      if (sidecarUrl !== undefined) {
        // Lazily, inside the request path, and never at module scope: the package declares
        // no `sideEffects` and is built with `platform: "neutral"`, so a module-scope side
        // effect can legitimately be tree-shaken by a customer's bundler. Re-run per
        // request because `env` is the only handle on the binding instances.
        //
        // Record mode only. Binding and KV calls are recorded as their own technologies
        // (`workerd-binding`, `workerd-kv`) and the replay sidecar's store holds only
        // `workerd-fetch` spans, so there is nothing to serve them from — and patching would
        // only route them into the capture tee, which POSTs to an events route a replay
        // sidecar 404s.
        installBindingPatch(env, { skipBindings: options?.skipBindings });
        installKvPatch(env, { skipBindings: options?.skipBindings });
      }
    } catch (error) {
      warnOnce(
        "shim-init",
        "Failed to initialize the Meticulous backend recorder shim — recording disabled.",
        error,
      );
      replayContext = undefined;
      sidecarUrl = undefined;
    }

    if (replayContext !== undefined) {
      // Install the clock before any app code runs, so a module that reads Date.now() at
      // call time (the firebase auth libraries do) sees the session's frozen instant.
      installVirtualClock();
      // Likewise the random generators: an id the app mints during SSR (a guest id, a
      // request id) otherwise differs between a base and a head replay, and every rendered
      // page carrying it diffs forever.
      installVirtualRandom();
      // No inbound reporting in replay mode: there is no exporter behind the replay
      // sidecar, and the events route 404s there.
      return requestCaptureContext.run(replayContext, invokeHandler);
    }

    if (sidecarUrl === undefined) {
      return invokeHandler();
    }

    const captureCtx = buildCaptureContext(request, sidecarUrl, ctx);
    const startTimeMs = Date.now();
    let requestHeaders: Record<string, string[]> = {};
    let method = "GET";
    let url = "";
    try {
      requestHeaders = headersToRecord(request.headers);
      method = request.method;
      url = request.url;
    } catch (error) {
      warnOnce(
        "inbound-capture",
        "Failed to capture the inbound request.",
        error,
      );
    }

    const reportInbound = (
      outcome:
        | { statusCode: number; responseHeaders: Record<string, string[]> }
        | { error: string },
    ): void => {
      try {
        const event: InboundRequestEvent = {
          kind: "inbound",
          requestId: captureCtx.requestId,
          ...(captureCtx.frontendSessionId !== undefined
            ? { frontendSessionId: captureCtx.frontendSessionId }
            : {}),
          method,
          url,
          requestHeaders,
          startTimeMs,
          endTimeMs: Date.now(),
          ...outcome,
        };
        captureCtx.waitUntil(
          postCaptureEvents(getOriginalFetch(), sidecarUrl, [event]),
        );
      } catch (error) {
        warnOnce(
          "inbound-report",
          "Failed to report the inbound request.",
          error,
        );
      }
    };

    let response: Response;
    try {
      response = await requestCaptureContext.run(captureCtx, invokeHandler);
    } catch (error) {
      reportInbound({ error: String(error) });
      throw error;
    }

    try {
      reportInbound({
        statusCode: response.status,
        responseHeaders: headersToRecord(response.headers),
      });
    } catch (error) {
      warnOnce(
        "inbound-report",
        "Failed to report the inbound request.",
        error,
      );
    }
    return response;
  };

  // The wrapper only replaces `fetch` (same call signature), but TypeScript
  // cannot verify a spread against the bare generic H.
  return { ...handler, fetch: wrappedFetch } as H;
};

/**
 * Whether this request should be replayed, and the context to serve it under.
 *
 * Both the session id and a usable sidecar URL must be present: mocks are indexed per
 * session, so replay without a session id could only miss. The sidecar is consulted once
 * per (sidecar, session) per isolate to confirm it holds mocks and to learn the clock
 * anchor — a sidecar that does not recognise the session, or the route, means replay is
 * unavailable and the request runs normally.
 */
const resolveReplayContext = async (
  request: Request,
  ctx: MeticulousExecutionContext,
): Promise<RequestReplayContext | undefined> => {
  let sidecarUrl: string | undefined;
  let frontendSessionId: string | undefined;
  try {
    sidecarUrl = parseReplaySidecarUrl(
      request.headers.get(REPLAY_SIDECAR_URL_HEADER),
    );
    frontendSessionId =
      request.headers.get(FRONTEND_SESSION_ID_HEADER) ?? undefined;
  } catch {
    return undefined;
  }
  if (sidecarUrl === undefined || frontendSessionId === undefined) {
    return undefined;
  }

  const info = await getCachedReplaySessionInfo(sidecarUrl, frontendSessionId);
  if (info === null) {
    return undefined;
  }

  return {
    mode: "replay",
    requestId: crypto.randomUUID(),
    frontendSessionId,
    sidecarUrl,
    clockAnchorMs: info.clockAnchorMs,
    waitUntil: buildWaitUntil(ctx),
  };
};

// Caches the promise, not the result, so concurrent first requests share one round trip.
// Bounded so a stream of unrecognised session ids cannot grow it without limit.
const MAX_CACHED_SESSIONS = 50;
const replaySessionInfoCache = new Map<
  string,
  Promise<{ clockAnchorMs: number | undefined } | null>
>();

const getCachedReplaySessionInfo = (
  sidecarUrl: string,
  frontendSessionId: string,
): Promise<{ clockAnchorMs: number | undefined } | null> => {
  const key = `${sidecarUrl} ${frontendSessionId}`;
  const cached = replaySessionInfoCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const pending = getReplaySessionInfo(
    getOriginalFetch(),
    sidecarUrl,
    frontendSessionId,
  ).then((result) => {
    if (result.outcome === "unreachable") {
      // Only settled answers are worth keeping. Caching a timeout or transport blip would
      // disable mocking for this session for the life of the isolate, quietly sending every
      // later outbound call to the real service — the failure this path exists to prevent.
      // Dropping the entry costs one extra handshake and lets the next request recover.
      replaySessionInfoCache.delete(key);
      return null;
    }
    return result.outcome === "found"
      ? { clockAnchorMs: result.clockAnchorMs }
      : null;
  });
  if (replaySessionInfoCache.size >= MAX_CACHED_SESSIONS) {
    const oldest = replaySessionInfoCache.keys().next();
    if (!oldest.done) {
      replaySessionInfoCache.delete(oldest.value);
    }
  }
  replaySessionInfoCache.set(key, pending);
  return pending;
};

const resolveSidecarUrl = (
  options: WithMeticulousOptions | undefined,
  env: unknown,
): string | undefined => {
  const fromEnv =
    env !== null && typeof env === "object"
      ? (env as Record<string, unknown>)["METICULOUS_SIDECAR_URL"]
      : undefined;
  const raw = options?.sidecarUrl ?? fromEnv;
  if (typeof raw !== "string" || raw.length === 0) {
    return undefined;
  }
  return raw.replace(/\/+$/, "");
};

const buildCaptureContext = (
  request: Request,
  sidecarUrl: string,
  ctx: MeticulousExecutionContext,
): RequestCaptureContext => {
  let frontendSessionId: string | undefined;
  try {
    frontendSessionId =
      request.headers.get(FRONTEND_SESSION_ID_HEADER) ?? undefined;
  } catch {
    frontendSessionId = undefined;
  }
  return {
    mode: "record",
    requestId: crypto.randomUUID(),
    frontendSessionId,
    sidecarUrl,
    waitUntil: buildWaitUntil(ctx),
  };
};

const buildWaitUntil =
  (ctx: MeticulousExecutionContext) =>
  (promise: Promise<unknown>): void => {
    try {
      ctx.waitUntil(promise);
    } catch (error) {
      warnOnce(
        "wait-until",
        "ctx.waitUntil failed — capture events may be lost.",
        error,
      );
    }
  };
