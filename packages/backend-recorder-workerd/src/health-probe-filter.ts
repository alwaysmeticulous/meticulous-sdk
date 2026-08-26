import { isHealthProbeRequest } from "./health-probe";
import type { CaptureEvent, InboundRequestEvent } from "./protocol";

/**
 * How many probe request ids to remember for stragglers. A batch is normally one whole
 * request, so this only has to cover events the app queued in `waitUntil` and the shim sent
 * after `CaptureBuffer.close()`. Bounded because on a Worker-hosted sidecar the memory lives
 * in an isolate that may serve a busy deployment for a long time.
 */
const DEFAULT_MAX_REMEMBERED_REQUEST_IDS = 1_000;

/**
 * Drops health-probe events at the sidecar, as a safety net beneath the shim's own check.
 *
 * The shim already declines to record a probe (`with-meticulous.ts`), which costs nothing at
 * all — no capture work, no report. But that check ships inside the customer's bundle, so a
 * deployment pinning an older `@alwaysmeticulous/backend-recorder-workerd` keeps reporting probes
 * until someone bumps the package and redeploys the app. A sidecar moves far more cheaply: the
 * local one comes from the CLI, so it needs nothing from the app at all, and the deployed Worker
 * is one `wrangler deploy` away with the app untouched. Repeating the verdict here is what makes
 * the exclusion reach traffic the shim still reports.
 *
 * **Why a group rather than a per-event rule.** Only the inbound event carries the probe's
 * path; an outbound `fetch`, binding, KV or postgres event carries its _own_ target. Those
 * CLIENT-span events are the ones that actually matter (a mock store only ever serves CLIENT
 * spans), so the filter learns which `requestId`s are probes from the inbound events and drops
 * everything correlated with them.
 *
 * **What it cannot catch.** A batch is flushed once _past_ a size threshold, so a probe whose
 * captured bodies exceed it mid-handler can post outbound events _before_ its inbound event
 * exists. Those go through: nothing in that batch says they belong to a probe. Harmless in
 * practice — a probe endpoint big enough to trip a multi-megabyte threshold is not a probe —
 * and the shim-side check covers it for any up-to-date deployment.
 */
export class HealthProbeEventFilter {
  private readonly maxRemembered: number;
  /** Insertion-ordered, so the oldest entry is the one to evict. */
  private readonly probeRequestIds = new Set<string>();

  constructor(options?: { maxRememberedRequestIds?: number }) {
    this.maxRemembered =
      options?.maxRememberedRequestIds ?? DEFAULT_MAX_REMEMBERED_REQUEST_IDS;
  }

  /**
   * Returns the events worth keeping. The input array is never mutated, and is returned as-is
   * when there is nothing to drop — the overwhelmingly common case, so it costs no copy.
   */
  filter(events: CaptureEvent[]): CaptureEvent[] {
    for (const event of events) {
      if (event.kind === "inbound" && isHealthProbeInboundEvent(event)) {
        this.remember(event.requestId);
      }
    }
    if (this.probeRequestIds.size === 0) {
      return events;
    }
    const kept = events.filter(
      (event) => !this.probeRequestIds.has(event.requestId),
    );
    return kept.length === events.length ? events : kept;
  }

  private remember(requestId: string): void {
    // Re-insert so a request still producing stragglers stays fresh rather than ageing out
    // while its own events are still arriving.
    this.probeRequestIds.delete(requestId);
    this.probeRequestIds.add(requestId);
    while (this.probeRequestIds.size > this.maxRemembered) {
      const oldest = this.probeRequestIds.values().next();
      if (oldest.done === true) {
        return;
      }
      this.probeRequestIds.delete(oldest.value);
    }
  }
}

/**
 * The same verdict {@link isHealthProbeRequest} reaches in the shim, from what survives on the
 * wire. `requestHeaders` is the inbound request's captured headers, and
 * `x-meticulous-session-id` is one of the two the shim persists (`CAPTURED_HEADERS`), so the
 * "nothing can attribute this" half of the rule is reproducible here.
 *
 * A `frontendSessionId` the browser sent also blocks the drop, independently of the header.
 * Both are the same fact, but disagreeing would mean dropping a request that _is_ attributable,
 * and this filter should only ever err towards recording. A `"backend"`-origin id does not
 * block it: the shim minted that one for a document navigation, so it says nothing about
 * whether the caller identified itself — and a probe would never have qualified for minting.
 */
const isHealthProbeInboundEvent = (event: InboundRequestEvent): boolean => {
  if (
    event.frontendSessionId !== undefined &&
    event.sessionIdOrigin !== "backend"
  ) {
    return false;
  }
  return isHealthProbeRequest(
    event.method,
    event.url,
    (name) => event.requestHeaders[name]?.[0],
  );
};
