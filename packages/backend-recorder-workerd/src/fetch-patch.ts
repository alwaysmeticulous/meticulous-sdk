import { readBodyWithCap } from "./body-capture";
import { requestCaptureContext } from "./context";
import { warnOnce } from "./log";
import {
  CAPTURED_HEADERS,
  type CapturedBody,
  type OutboundRequestEvent,
} from "./protocol";
import { postCaptureEvents } from "./sidecar-client";

type FetchFn = typeof globalThis.fetch;

// Symbol.for so a second copy of the shim (e.g. bundled twice) still detects the patch.
const FETCH_PATCHED = Symbol.for("meticulous.workerd.fetchPatched");

let originalFetch: FetchFn | undefined;

/** The unpatched fetch — used for the shim's own sidecar requests. */
export const getOriginalFetch = (): FetchFn =>
  originalFetch ?? globalThis.fetch;

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

/**
 * Replaces globalThis.fetch with a passive capture tee: the real fetch is
 * called directly (the sidecar is never in the request path); request and
 * response are cloned and reported to the sidecar in the background. Outside
 * a withMeticulous request context the patch is a pure pass-through.
 * Idempotent.
 */
export const installFetchPatch = (): void => {
  const holder = globalThis as { [FETCH_PATCHED]?: boolean };
  if (holder[FETCH_PATCHED]) {
    return;
  }
  holder[FETCH_PATCHED] = true;
  originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = patchedFetch;
};

const patchedFetch: FetchFn = async (input, init) => {
  const original = getOriginalFetch();
  const ctx = requestCaptureContext.getStore();
  if (!ctx) {
    return original(input, init);
  }

  // Normalize to a single Request. This may consume `input`'s body (when
  // `input` is a Request), so from here on the real fetch must be given
  // `request`, never the original arguments.
  let request: Request;
  try {
    request = new Request(input, init);
  } catch {
    // Unconstructable arguments — let the real fetch produce the error.
    return original(input, init);
  }

  // Never capture the shim's own reports to the sidecar.
  if (request.url.startsWith(`${ctx.sidecarUrl}/`)) {
    return original(request);
  }

  const startTimeMs = Date.now();
  let meta:
    | {
        method: string;
        url: string;
        requestHeaders: Record<string, string[]>;
      }
    | undefined;
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
      requestBodyPromise = readBodyWithCap(bodyClone.body).catch(
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
    response = await original(request);
  } catch (error) {
    if (meta) {
      const frozenMeta = meta;
      const endTimeMs = Date.now();
      const errorMessage = String(error);
      reportInBackground(ctx, async () => {
        const requestBody = await requestBodyPromise;
        const event: OutboundRequestEvent = {
          kind: "outbound",
          requestId: ctx.requestId,
          ...(ctx.frontendSessionId !== undefined
            ? { frontendSessionId: ctx.frontendSessionId }
            : {}),
          ...frozenMeta,
          ...(requestBody !== undefined ? { requestBody } : {}),
          startTimeMs,
          endTimeMs,
          error: errorMessage,
        };
        await postCaptureEvents(original, ctx.sidecarUrl, [event]);
      });
    }
    throw error;
  }

  if (meta) {
    const frozenMeta = meta;
    try {
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
          const event: OutboundRequestEvent = {
            kind: "outbound",
            requestId: ctx.requestId,
            ...(ctx.frontendSessionId !== undefined
              ? { frontendSessionId: ctx.frontendSessionId }
              : {}),
            ...frozenMeta,
            responseHeaders,
            statusCode,
            ...(requestBody !== undefined ? { requestBody } : {}),
            ...(responseBody !== undefined ? { responseBody } : {}),
            startTimeMs,
            endTimeMs,
          };
          await postCaptureEvents(original, ctx.sidecarUrl, [event]);
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

const reportInBackground = (
  ctx: { waitUntil: (p: Promise<unknown>) => void },
  report: () => Promise<void>,
): void => {
  try {
    ctx.waitUntil(
      report().catch((error) => {
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
