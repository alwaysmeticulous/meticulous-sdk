import { installBindingPatch } from "./binding-patch";
import { CaptureBuffer } from "./capture-buffer";
import {
  type RequestCaptureContext,
  type RequestReplayContext,
  requestCaptureContext,
} from "./context";
import { runReplayWithCoverage } from "./coverage/replay-coverage";
import { installFetchPatch } from "./fetch-patch";
import { installKvPatch } from "./kv-patch";
import { warnOnce } from "./log";
import { getOriginalFetch } from "./original-fetch";
import { headersToRecord } from "./outbound-capture";
import {
  FRONTEND_SESSION_ID_HEADER,
  type InboundRequestEvent,
  REPLAY_ID_HEADER,
  REPLAY_SIDECAR_URL_HEADER,
} from "./protocol";
import {
  isProvisionalSessionIdCandidate,
  mintProvisionalSessionId,
} from "./provisional-session-id";
import { publishSessionIdOnResponse } from "./publish-session-id";
import { publishWorkerdShimVersionOnResponse } from "./publish-shim-version";
import { installReplayLogTagging } from "./replay-log-tagging";
import { parseReplaySidecarUrl } from "./replay-sidecar-url";
import { getReplaySessionInfo } from "./sidecar-client";
import {
  resolveSidecarTransport,
  type SidecarFetcher,
  type SidecarTransport,
} from "./sidecar-transport";
import { randomHex } from "./spans/span-builder";
import { installVirtualClock } from "./virtual-clock";
import { installVirtualRandom } from "./virtual-random";

/** Structural subset of workerd's ExecutionContext — avoids a @cloudflare/workers-types dependency. */
export interface MeticulousExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface WithMeticulousOptions {
  /**
   * Overrides the sidecar service binding; defaults to the `METICULOUS_SIDECAR` binding on
   * `env`. This is how a **deployed** Worker records — see {@link SidecarTransport}.
   */
  sidecarBinding?: SidecarFetcher;
  /** Overrides the sidecar origin; defaults to the METICULOUS_SIDECAR_URL var/binding. */
  sidecarUrl?: string;
  /**
   * Binding names to leave unrecorded, on top of the defaults (`ASSETS`, `__STATIC_CONTENT`,
   * `METICULOUS_SIDECAR`). Use this for a binding whose traffic is high-volume or binary. Applies
   * to KV namespaces as well as `fetch`-shaped bindings.
   */
  skipBindings?: readonly string[];
  /**
   * Whether to mint a session id for a document navigation that carries none, so the
   * server-side render is recorded under the same session as the page it produces. On by
   * default; set `false` (or the `METICULOUS_BACKEND_PROVISIONAL_SESSION_IDS` var to
   * `"false"`) to opt out. See provisional-session-id.ts.
   */
  mintProvisionalSessionIds?: boolean;
}

/** What the mode-agnostic core needs from whichever handler shape wraps it. */
export interface MeticulousInvocation {
  request: Request;
  env: unknown;
  ctx: MeticulousExecutionContext;
  invokeHandler: () => Response | Promise<Response>;
}

/**
 * Records, or replays, one inbound request. Shared by `withMeticulous` (an ES-module Worker's
 * `fetch`) and `withMeticulousPagesFunction` (a Pages Functions `onRequest`), which differ only
 * in how they get at the request, the env and `waitUntil`.
 */
export const runWithMeticulous = async (
  { request, env, ctx, invokeHandler }: MeticulousInvocation,
  options: WithMeticulousOptions | undefined,
): Promise<Response> => {
  let transport: SidecarTransport | undefined;
  let replayContext: RequestReplayContext | undefined;
  try {
    replayContext = await resolveReplayContext(request, ctx);
    transport =
      replayContext === undefined
        ? resolveSidecarTransport(options, env)
        : undefined;
    if (replayContext !== undefined || transport !== undefined) {
      installFetchPatch();
    }
    if (transport !== undefined) {
      // Lazily, inside the request path, and never at module scope: the package declares no
      // `sideEffects` and is built with `platform: "neutral"`, so a module-scope side effect can
      // legitimately be tree-shaken by a customer's bundler. Re-run per request because `env` is
      // the only handle on the binding instances.
      //
      // Record mode only. Binding and KV calls are recorded as their own technologies
      // (`workerd-binding`, `workerd-kv`) and the replay sidecar's store holds only
      // `workerd-fetch` spans, so there is nothing to serve them from — and patching would only
      // route them into the capture tee, which POSTs to an events route a replay sidecar 404s.
      //
      // `skipInstances` keeps the sidecar's own binding out of the recording by identity rather
      // than by name, so it holds however the customer named it or passed it in.
      const patchOptions = {
        ...(options?.skipBindings !== undefined
          ? { skipBindings: options.skipBindings }
          : {}),
        ...(transport.kind === "binding"
          ? { skipInstances: [transport.instance] }
          : {}),
      };
      installBindingPatch(env, patchOptions);
      installKvPatch(env, patchOptions);
    }
  } catch (error) {
    warnOnce(
      "shim-init",
      "Failed to initialize the Meticulous backend recorder shim — recording disabled.",
      error,
    );
    replayContext = undefined;
    transport = undefined;
  }

  if (replayContext !== undefined) {
    // Workerd has no process.stdout/process.stderr seam like Node. Patch its
    // console methods instead; each call resolves this request's replay id from
    // the AsyncLocalStorage entered below.
    installReplayLogTagging();
    // Install the clock before any app code runs, so a module that reads Date.now() at call time
    // (the firebase auth libraries do) sees the session's frozen instant.
    installVirtualClock();
    // Likewise the random generators: an id the app mints during SSR (a guest id, a request id)
    // otherwise differs between a base and a head replay, and every rendered page carrying it
    // diffs forever.
    installVirtualRandom();
    // No inbound reporting in replay mode: there is no exporter behind the replay sidecar, and
    // the events route 404s there.
    const replayResponse = await runReplayWithCoverage(
      replayContext,
      invokeHandler,
    );
    return publishWorkerdShimVersionOnResponse(replayResponse);
  }

  if (transport === undefined) {
    return invokeHandler();
  }

  const captureCtx = buildCaptureContext(
    request,
    transport,
    ctx,
    resolveMintProvisionalSessionIds(options, env),
  );
  const mintedSessionId =
    captureCtx.sessionIdOrigin === "backend"
      ? captureCtx.frontendSessionId
      : undefined;
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
        ...(captureCtx.sessionIdOrigin !== undefined
          ? { sessionIdOrigin: captureCtx.sessionIdOrigin }
          : {}),
        traceId: captureCtx.traceId,
        serverSpanId: captureCtx.serverSpanId,
        method,
        url,
        requestHeaders,
        startTimeMs,
        endTimeMs: Date.now(),
        ...outcome,
      };
      captureCtx.buffer.add(event);
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
    closeBuffer(captureCtx);
    throw error;
  }

  // Ahead of reporting, so what we record as the response headers is what the browser is
  // actually served.
  if (mintedSessionId !== undefined) {
    response = publishSessionIdOnResponse(response, mintedSessionId);
  }
  response = publishWorkerdShimVersionOnResponse(response);

  try {
    reportInbound({
      statusCode: response.status,
      responseHeaders: headersToRecord(response.headers),
    });
  } catch (error) {
    warnOnce("inbound-report", "Failed to report the inbound request.", error);
  }
  closeBuffer(captureCtx);
  return response;
};

/**
 * Hands the request's single report to `waitUntil`. `close()` drains the outstanding body reads
 * first, which is why there is one `waitUntil` per request rather than one per captured call.
 */
const closeBuffer = (ctx: RequestCaptureContext): void => {
  try {
    ctx.waitUntil(ctx.buffer.close());
  } catch (error) {
    warnOnce(
      "buffer-close",
      "ctx.waitUntil failed — capture events may be lost.",
      error,
    );
  }
};

/**
 * Whether this request should be replayed, and the context to serve it under.
 *
 * Both replay identity ids and a usable sidecar URL must be present: mocks are indexed per session
 * and consumed per replay. The sidecar is consulted once per (sidecar, session) per isolate to
 * confirm it holds mocks and to learn the clock anchor — a sidecar that does not recognise the
 * session, or the route, means replay is unavailable and the request runs normally.
 */
const resolveReplayContext = async (
  request: Request,
  ctx: MeticulousExecutionContext,
): Promise<RequestReplayContext | undefined> => {
  let sidecarUrl: string | undefined;
  let frontendSessionId: string | undefined;
  let replayId: string | undefined;
  try {
    sidecarUrl = parseReplaySidecarUrl(
      request.headers.get(REPLAY_SIDECAR_URL_HEADER),
    );
    frontendSessionId =
      request.headers.get(FRONTEND_SESSION_ID_HEADER) ?? undefined;
    replayId = request.headers.get(REPLAY_ID_HEADER) ?? undefined;
  } catch {
    return undefined;
  }
  if (
    sidecarUrl === undefined ||
    frontendSessionId === undefined ||
    replayId === undefined
  ) {
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
    replayId,
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

const buildCaptureContext = (
  request: Request,
  transport: SidecarTransport,
  ctx: MeticulousExecutionContext,
  mintProvisionalSessionIds: boolean,
): RequestCaptureContext => {
  let frontendSessionId: string | undefined;
  let sessionIdOrigin: "backend" | undefined;
  try {
    frontendSessionId =
      request.headers.get(FRONTEND_SESSION_ID_HEADER) ?? undefined;
    // A top-level document navigation cannot carry the header, so for one we mint the id
    // ourselves and hand it to the page on the response — otherwise the server-side render this
    // request is about is recorded against no session at all. Every outbound, binding, KV and
    // postgres event reads the id back off this context, so putting it here attributes the whole
    // request. See provisional-session-id.ts.
    if (
      mintProvisionalSessionIds &&
      frontendSessionId === undefined &&
      isProvisionalSessionIdCandidate(request.method, (name) =>
        request.headers.get(name),
      )
    ) {
      frontendSessionId = mintProvisionalSessionId();
      sessionIdOrigin = "backend";
    }
  } catch {
    frontendSessionId = undefined;
    sessionIdOrigin = undefined;
  }
  const waitUntil = buildWaitUntil(ctx);
  return {
    mode: "record",
    requestId: crypto.randomUUID(),
    frontendSessionId,
    ...(sessionIdOrigin !== undefined ? { sessionIdOrigin } : {}),
    transport,
    buffer: new CaptureBuffer(transport, waitUntil),
    traceId: randomHex(16),
    serverSpanId: randomHex(8),
    waitUntil,
  };
};

/**
 * On by default: the render it attributes — the page's very first — is otherwise recorded
 * against no session at all, and the only thing that reaches a replay for those spans is
 * ingestion's time-window guess.
 *
 * Opting out is a worker var rather than a host environment variable for the same reason the
 * sidecar URL is: workerd cannot see the host's environment.
 */
const resolveMintProvisionalSessionIds = (
  options: WithMeticulousOptions | undefined,
  env: unknown,
): boolean => {
  if (options?.mintProvisionalSessionIds !== undefined) {
    return options.mintProvisionalSessionIds;
  }
  const fromEnv =
    env !== null && typeof env === "object"
      ? (env as Record<string, unknown>)[
          "METICULOUS_BACKEND_PROVISIONAL_SESSION_IDS"
        ]
      : undefined;
  return fromEnv !== "false";
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
