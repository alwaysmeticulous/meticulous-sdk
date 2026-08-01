import { readRequestBodyWithCap } from "./body-capture";
import type { RequestReplayContext } from "./context";
import { warnOnce } from "./log";
import { getOriginalFetch } from "./original-fetch";
import type { OutboundFetchLookupRequest } from "./protocol";
import { postOutboundFetchLookup } from "./sidecar-client";

/**
 * Serves a recorded response for an outbound call, or lets the real one through.
 *
 * The mirror image of `captureOutboundCall`: recording tees a call that happens anyway,
 * whereas replay decides first and only then calls — so the sidecar sits in the request
 * path here, and every failure mode below falls back to `invoke`.
 *
 * A miss always falls through to the real service rather than erroring. Recordings are
 * legitimately incomplete — anything the app cached during recording (e.g. public JWKs held
 * in a KV namespace) is never captured, and is fetched for real when replay starts with a
 * cold cache.
 */
export const replayOutboundCall = async (
  ctx: RequestReplayContext,
  request: Request,
  invoke: (request: Request) => Promise<Response>,
): Promise<Response> => {
  let lookup: OutboundFetchLookupRequest;
  try {
    // Read the clone and pass the original through untouched, mirroring the record path —
    // so the miss branch needs no body rebuild. The sidecar hashes what we send here, and
    // it was captured by the same readRequestBodyWithCap the recorder used (redaction
    // included), so the hashes on both sides derive from byte-identical input.
    const requestBody = request.body
      ? await readRequestBodyWithCap(request.clone().body).catch(
          () => undefined,
        )
      : undefined;
    lookup = {
      frontendSessionId: ctx.frontendSessionId,
      method: request.method,
      url: request.url,
      ...(requestBody !== undefined ? { requestBody } : {}),
    };
  } catch (error) {
    warnOnce(
      "replay-lookup-build",
      "Failed to prepare a mock lookup — letting the real call through.",
      error,
    );
    return invoke(request);
  }

  const result = await postOutboundFetchLookup(
    getOriginalFetch(),
    ctx.sidecarUrl,
    lookup,
  );
  // Also covers an unrecognised `outcome` from a newer sidecar.
  if (result?.outcome !== "mock") {
    return invoke(request);
  }
  return buildMockResponse(result) ?? invoke(request);
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
 * status), in which case the caller passes through.
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
      "Could not construct a mocked response — letting the real call through.",
      error,
    );
    return undefined;
  }
};
