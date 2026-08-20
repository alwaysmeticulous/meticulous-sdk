import { readRequestBodyWithCap } from "./body-capture";
import type { RequestReplayContext } from "./context";
import { warn, warnOnce } from "./log";
import { getOriginalFetch } from "./original-fetch";
import {
  METICULOUS_PASSTHROUGH_HEADER,
  type OutboundFetchLookupRequest,
} from "./protocol";
import { postOutboundFetchLookup } from "./sidecar-client";

/**
 * Serves a recorded response for an outbound call, or fails it.
 *
 * The mirror image of `captureOutboundCall`: recording tees a call that happens anyway,
 * whereas replay decides first and only then calls — so the sidecar sits in the request
 * path here.
 *
 * Replay is hermetic: a call the recording does not cover must not silently reach the real
 * service, since that turns a replay into live traffic against real credentials and hides
 * the gap in the recording behind a response no base replay will reproduce. So anything we
 * cannot serve from the recording — a miss, a call the sidecar cannot look up, an
 * unreachable sidecar, a mock that cannot be represented, or an outcome this shim does not
 * recognise — throws, matching the Node recorder's http/undici mocks.
 *
 * The only way out is an explicit `meticulous-passthrough: true` header on the request: a
 * call the customer has marked as one that must reach the real service. A failure to stub is
 * never treated as such a mark.
 */
export const replayOutboundCall = async (
  ctx: RequestReplayContext,
  request: Request,
  invoke: (request: Request) => Promise<Response>,
): Promise<Response> => {
  if (hasPassthroughHeader(request)) {
    return invoke(request);
  }

  let lookup: OutboundFetchLookupRequest;
  try {
    // Read the clone and pass the original through untouched, mirroring the record path.
    // The sidecar hashes what we send here, and it was captured by the same
    // readRequestBodyWithCap the recorder used (redaction included), so the hashes on both
    // sides derive from byte-identical input.
    const requestBody = request.body
      ? await readRequestBodyWithCap(request.clone().body).catch(
          () => undefined,
        )
      : undefined;
    lookup = {
      frontendSessionId: ctx.frontendSessionId,
      replayId: ctx.replayId,
      method: request.method,
      url: request.url,
      ...(ctx.virtualTimeMs !== undefined
        ? { virtualTimeMs: ctx.virtualTimeMs }
        : {}),
      ...(requestBody !== undefined ? { requestBody } : {}),
    };
  } catch (error) {
    // Without a lookup there is nothing to serve, and passing through would be exactly the
    // silent real call this path exists to prevent.
    throw buildReplayError(
      request,
      ctx.frontendSessionId,
      "could not prepare a mock lookup",
      error,
    );
  }

  const result = await postOutboundFetchLookup(
    getOriginalFetch(),
    ctx.sidecarUrl,
    lookup,
  );
  if (result === undefined) {
    throw buildReplayError(
      request,
      ctx.frontendSessionId,
      "the replay sidecar did not answer a mock lookup",
    );
  }
  if (result.outcome === "mock") {
    const mocked = buildMockResponse(result);
    if (mocked === undefined) {
      throw buildReplayError(
        request,
        ctx.frontendSessionId,
        `the recorded response (status ${result.statusCode}) cannot be represented`,
      );
    }
    return mocked;
  }
  // Every other outcome is a failure to stub — a miss (`no-mock`) or an outcome this shim
  // does not recognise (e.g. a legacy `passthrough`). None may reach the real service, so we
  // fail the request; the only path to a live call is the explicit passthrough header
  // handled above.
  throw buildReplayError(
    request,
    ctx.frontendSessionId,
    describeUnservedOutcome(result.outcome),
  );
};

const describeUnservedOutcome = (outcome: string): string =>
  outcome === "no-mock"
    ? "no recorded response"
    : `an unrecognised sidecar outcome (${outcome})`;

const hasPassthroughHeader = (request: Request): boolean => {
  try {
    return request.headers.get(METICULOUS_PASSTHROUGH_HEADER) === "true";
  } catch {
    return false;
  }
};

/**
 * Builds — and logs — the error the app sees for a call replay cannot serve. Deliberately
 * names the shim and the session so an app-side stack trace is enough to tell a replay gap
 * from a real bug, and logs as well because an app that catches its own fetch errors would
 * otherwise swallow the only signal.
 *
 * The query string is left out on purpose — it routinely carries API keys, and the sidecar
 * logs the full path anyway.
 */
const buildReplayError = (
  request: Request,
  frontendSessionId: string,
  reason: string,
  cause?: unknown,
): Error => {
  const error = new Error(
    `[backend-recorder] workerd replay: ${reason} for ${describeRequest(request)} (session ${frontendSessionId}). Set the "${METICULOUS_PASSTHROUGH_HEADER}: true" header on this request if it must reach the real service during replay.`,
  );
  if (cause !== undefined) {
    // `cause` in the constructor options is not universally available in workerd builds.
    (error as { cause?: unknown }).cause = cause;
  }
  warn(error.message);
  return error;
};

const describeRequest = (request: Request): string => {
  let method = "GET";
  let url = "";
  try {
    method = request.method;
    url = request.url;
  } catch {
    return method;
  }
  try {
    const parsed = new URL(url);
    return `${method} ${parsed.origin}${parsed.pathname}`;
  } catch {
    return `${method} ${url}`;
  }
};

// Recorded bodies are already decoded and may have been truncated, so the recorded framing
// headers no longer describe them; the Response constructor recomputes what it needs.
const HEADERS_TO_DROP = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
]);

// Statuses the Response constructor refuses to pair with a body.
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

/**
 * Turns a recorded response into a real one, or undefined if it cannot be represented (the
 * constructor throws a RangeError on an out-of-range status, or a body on a null-body
 * status), in which case the caller fails the request.
 *
 * Note recorded headers are limited to CAPTURED_HEADERS, so a mocked response carries
 * essentially just content-type. In particular it can never set cookies — fine for the API
 * calls this path serves, but a real limitation for a backend that authenticates that way.
 */
const buildMockResponse = (mock: {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}): Response | undefined => {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(mock.headers)) {
      if (HEADERS_TO_DROP.has(name.toLowerCase())) {
        continue;
      }
      try {
        headers.set(name, value);
      } catch {
        // Skip a header name/value the runtime rejects rather than losing the whole mock.
      }
    }
    const body = NULL_BODY_STATUSES.has(mock.statusCode) ? null : mock.body;
    return new Response(body, { status: mock.statusCode, headers });
  } catch (error) {
    warnOnce(
      "replay-mock-response",
      "Could not construct a mocked response.",
      error,
    );
    return undefined;
  }
};
