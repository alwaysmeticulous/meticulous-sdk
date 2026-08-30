import { requestCaptureContext, sidecarOriginOf } from "./context";
import { isOrphanedDatadogAgentUrl } from "./datadog-agent";
import { getOriginalFetch, setOriginalFetch } from "./original-fetch";
import { captureOutboundCall } from "./outbound-capture";
import { replayOutboundCall } from "./replay-fetch";

type FetchFn = typeof globalThis.fetch;

// Symbol.for so a second copy of the shim (e.g. bundled twice) still detects the patch.
const FETCH_PATCHED = Symbol.for("meticulous.workerd.fetchPatched");

export { getOriginalFetch } from "./original-fetch";
export { headersToRecord } from "./outbound-capture";

/**
 * Replaces globalThis.fetch with the mode-appropriate interception:
 *
 *   - recording: a passive capture tee. The real fetch is called directly (the sidecar is
 *     never in the request path); request and response are cloned and reported in the
 *     background.
 *   - replaying: decide-then-serve. The call is looked up against the sidecar's mock store
 *     and a recorded response is synthesised, or the call fails — replay is hermetic unless
 *     the request opts out with the `meticulous-passthrough` header.
 *
 * Outside a withMeticulous request context the patch is a pure pass-through. Idempotent.
 */
export const installFetchPatch = (): void => {
  const holder = globalThis as { [FETCH_PATCHED]?: boolean };
  if (holder[FETCH_PATCHED]) {
    return;
  }
  holder[FETCH_PATCHED] = true;
  setOriginalFetch(globalThis.fetch.bind(globalThis));
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

  // Never intercept the shim's own traffic to the sidecar. Defence in depth: every
  // shim → sidecar call already goes through the unpatched fetch, or a service binding.
  if (request.url.startsWith(`${sidecarOriginOf(ctx)}/`)) {
    return original(request);
  }

  // The app's own telemetry leaving for a Datadog agent or intake, with nothing to tie it to
  // a session, is recorded as nothing at all. Record mode only, by construction: a replay
  // context always carries a session id, so the rule could not fire there either way.
  if (
    ctx.mode === "record" &&
    isOrphanedDatadogAgentUrl(request.url, ctx.frontendSessionId)
  ) {
    return original(request);
  }

  return ctx.mode === "replay"
    ? replayOutboundCall(ctx, request, (req) => original(req))
    : captureOutboundCall(ctx, { kind: "outbound" }, request, (req) =>
        original(req),
      );
};
