import { readBodyWithCap, readRequestBodyWithCap } from "./body-capture";
import type { RequestCaptureContext } from "./context";
import { warnOnce } from "./log";
import { getOriginalFetch } from "./original-fetch";
import {
  CAPTURED_HEADERS,
  type BindingRequestEvent,
  type CaptureEvent,
  type CapturedBody,
  type OutboundRequestEvent,
} from "./protocol";
import { postCaptureEvents } from "./sidecar-client";

/**
 * Which transport an intercepted call left the isolate through. Both are
 * Request/Response-shaped, so they share the capture tee below and differ only in the
 * event they emit.
 */
export type OutboundTransport =
  | { kind: "outbound" }
  | {
      kind: "binding";
      /**
       * The `env` key the binding was found under. Undefined when the instance was never
       * seen on `env` — e.g. a Durable Object stub, which is produced by `namespace.get()`
       * rather than being a binding itself.
       */
      bindingName: string | undefined;
    };

const capturedHeaders = new Set<string>(CAPTURED_HEADERS);

export const headersToRecord = (headers: Headers): Record<string, string[]> => {
  const record: Record<string, string[]> = {};
  headers.forEach((value, name) => {
    const lowerName = name.toLowerCase();
    if (capturedHeaders.has(lowerName)) {
      (record[lowerName] ??= []).push(value);
    }
  });
  return record;
};

interface OutboundMeta {
  method: string;
  url: string;
  requestHeaders: Record<string, string[]>;
}

interface EventFields extends OutboundMeta {
  requestId: string;
  frontendSessionId?: string;
  requestBody?: CapturedBody;
  responseBody?: CapturedBody;
  responseHeaders?: Record<string, string[]>;
  statusCode?: number;
  startTimeMs: number;
  endTimeMs: number;
  error?: string;
}

/**
 * Builds the transport's event. An explicit two-arm branch rather than a spread of the
 * union, so the discriminant and the extra binding field stay obvious. (The shim has no
 * runtime dependencies, so `assertNever` is not available here.)
 */
const buildEvent = (
  transport: OutboundTransport,
  fields: EventFields,
): OutboundRequestEvent | BindingRequestEvent =>
  transport.kind === "binding"
    ? {
        kind: "binding",
        ...(transport.bindingName !== undefined
          ? { bindingName: transport.bindingName }
          : {}),
        ...fields,
      }
    : { kind: "outbound", ...fields };

/**
 * Records an outbound call without affecting it: the real transport is invoked directly
 * (the sidecar is never in the request path), and request/response clones are reported in
 * the background via `ctx.waitUntil`. Any capture failure is warned about once and
 * swallowed — recording must never break the app.
 *
 * `invoke` is what actually performs the call, so the caller keeps ownership of the
 * receiver (a binding's `fetch` must be applied to the binding, not to `globalThis`).
 */
export const captureOutboundCall = async (
  ctx: RequestCaptureContext,
  transport: OutboundTransport,
  request: Request,
  invoke: (request: Request) => Promise<Response>,
): Promise<Response> => {
  const startTimeMs = Date.now();
  let meta: OutboundMeta | undefined;
  let requestBodyPromise: Promise<CapturedBody | undefined> =
    Promise.resolve(undefined);
  try {
    meta = {
      method: request.method,
      url: request.url,
      requestHeaders: headersToRecord(request.headers),
    };
    if (request.body) {
      const bodyClone = request.clone();
      requestBodyPromise = readRequestBodyWithCap(bodyClone.body).catch(
        () => undefined,
      );
    }
  } catch (error) {
    warnOnce(
      "outbound-request-capture",
      "Failed to capture an outbound request.",
      error,
    );
    meta = undefined;
  }

  let response: Response;
  try {
    response = await invoke(request);
  } catch (error) {
    if (meta) {
      const frozenMeta = meta;
      const endTimeMs = Date.now();
      const errorMessage = String(error);
      reportInBackground(ctx, async () => {
        const requestBody = await requestBodyPromise;
        await report(ctx, transport, {
          ...frozenMeta,
          requestId: ctx.requestId,
          ...(ctx.frontendSessionId !== undefined
            ? { frontendSessionId: ctx.frontendSessionId }
            : {}),
          ...(requestBody !== undefined ? { requestBody } : {}),
          startTimeMs,
          endTimeMs,
          error: errorMessage,
        });
      });
    }
    throw error;
  }

  if (meta) {
    const frozenMeta = meta;
    try {
      // A WebSocket upgrade has no readable body and cannot be represented as a recorded
      // response, so it is left entirely alone.
      if (hasWebSocket(response)) {
        return response;
      }
      const responseClone = response.clone();
      const responseHeaders = headersToRecord(response.headers);
      const statusCode = response.status;
      const endTimeMs = Date.now();
      ctx.waitUntil(
        (async () => {
          const [requestBody, responseBody] = await Promise.all([
            requestBodyPromise,
            readBodyWithCap(responseClone.body).catch(() => undefined),
          ]);
          await report(ctx, transport, {
            ...frozenMeta,
            requestId: ctx.requestId,
            ...(ctx.frontendSessionId !== undefined
              ? { frontendSessionId: ctx.frontendSessionId }
              : {}),
            responseHeaders,
            statusCode,
            ...(requestBody !== undefined ? { requestBody } : {}),
            ...(responseBody !== undefined ? { responseBody } : {}),
            startTimeMs,
            endTimeMs,
          });
        })().catch((error) => {
          warnOnce(
            "outbound-response-capture",
            "Failed to capture an outbound response.",
            error,
          );
        }),
      );
    } catch (error) {
      warnOnce(
        "outbound-response-capture",
        "Failed to capture an outbound response.",
        error,
      );
    }
  }

  return response;
};

const report = async (
  ctx: RequestCaptureContext,
  transport: OutboundTransport,
  fields: EventFields,
): Promise<void> => {
  const event: CaptureEvent = buildEvent(transport, fields);
  await postCaptureEvents(getOriginalFetch(), ctx.sidecarUrl, [event]);
};

/** Detects a WebSocket upgrade response without assuming the property exists. */
const hasWebSocket = (response: Response): boolean =>
  (response as Response & { webSocket?: unknown }).webSocket != null;

const reportInBackground = (
  ctx: { waitUntil: (p: Promise<unknown>) => void },
  reportFn: () => Promise<void>,
): void => {
  try {
    ctx.waitUntil(
      reportFn().catch((error) => {
        warnOnce(
          "outbound-error-report",
          "Failed to report a failed outbound request.",
          error,
        );
      }),
    );
  } catch (error) {
    warnOnce(
      "outbound-error-report",
      "Failed to report a failed outbound request.",
      error,
    );
  }
};
