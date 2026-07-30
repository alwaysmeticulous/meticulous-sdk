import { type RequestCaptureContext, requestCaptureContext } from "./context";
import {
  getOriginalFetch,
  headersToRecord,
  installFetchPatch,
} from "./fetch-patch";
import { warnOnce } from "./log";
import {
  FRONTEND_SESSION_ID_HEADER,
  type InboundRequestEvent,
} from "./protocol";
import { postCaptureEvents } from "./sidecar-client";

export type {
  CaptureEvent,
  CapturedBody,
  CaptureEventsPayload,
  InboundRequestEvent,
  OutboundRequestEvent,
} from "./protocol";
export {
  CAPTURED_HEADERS,
  FRONTEND_SESSION_ID_HEADER,
  SIDECAR_EVENTS_PATH,
  SIDECAR_PROTOCOL_VERSION,
  SIDECAR_PROTOCOL_VERSION_HEADER,
} from "./protocol";
export { MAX_BODY_CAPTURE_SIZE, readBodyWithCap } from "./body-capture";
export { headersToRecord } from "./fetch-patch";

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
}

/**
 * Wraps an ES-module Worker handler so that, when a Meticulous recorder
 * sidecar is configured, inbound requests and outgoing `fetch` calls are
 * reported to it as backend capture events:
 *
 *   export default withMeticulous({
 *     async fetch(request, env, ctx) { ... },
 *   });
 *
 * Activation requires a `METICULOUS_SIDECAR_URL` var/binding (e.g. via
 * `.dev.vars` or `wrangler dev --var`) or `options.sidecarUrl`; without one
 * the wrapper is a complete pass-through, so it is safe to keep in deployed
 * code. Requires the `nodejs_als` (or `nodejs_compat`) compatibility flag.
 * A capture failure or unreachable sidecar never affects the app.
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
    try {
      sidecarUrl = resolveSidecarUrl(options, env);
      if (sidecarUrl !== undefined) {
        installFetchPatch();
      }
    } catch (error) {
      warnOnce(
        "shim-init",
        "Failed to initialize the Meticulous backend recorder shim — recording disabled.",
        error,
      );
      sidecarUrl = undefined;
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
    requestId: crypto.randomUUID(),
    frontendSessionId,
    sidecarUrl,
    waitUntil: (promise) => {
      try {
        ctx.waitUntil(promise);
      } catch (error) {
        warnOnce(
          "wait-until",
          "ctx.waitUntil failed — capture events may be lost.",
          error,
        );
      }
    },
  };
};
