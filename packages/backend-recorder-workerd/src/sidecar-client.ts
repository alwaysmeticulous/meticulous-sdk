import { warnOnce } from "./log";
import { getOriginalFetch } from "./original-fetch";
import {
  type CaptureEvent,
  type CaptureEventsPayload,
  type OutboundFetchLookupRequest,
  type OutboundFetchLookupResponse,
  type ReplaySessionInfoResponse,
  SIDECAR_EVENTS_PATH,
  SIDECAR_PROTOCOL_VERSION,
  SIDECAR_PROTOCOL_VERSION_HEADER,
  SIDECAR_REPLAY_OUTBOUND_FETCH_PATH,
  SIDECAR_REPLAY_SESSION_PATH,
} from "./protocol";
import { sidecarFetch, type SidecarTransport } from "./sidecar-transport";

type FetchFn = typeof globalThis.fetch;

/**
 * Replay calls sit in the request path, unlike record mode's fire-and-forget reporting, so
 * they must be bounded: without a timeout a wedged sidecar would hang every outbound fetch
 * the app makes, and therefore the whole replay, with nothing to look at.
 */
const SESSION_INFO_TIMEOUT_MS = 10_000;
const LOOKUP_TIMEOUT_MS = 5_000;

/**
 * Capture reporting is off the response path (it runs under `ctx.waitUntil`), so a timeout here
 * is not about latency the app can see — it is about not holding the request context open on a
 * sidecar that will never answer. A refused connection rejects immediately, but a sidecar URL
 * pointing at a host that drops packets rather than refusing them (a firewalled container or LAN
 * address instead of loopback) would otherwise leave the POST pending until the runtime tears the
 * context down, on every captured call.
 *
 * Generous relative to what it bounds: a local sidecar answers a small batch in single-digit
 * milliseconds, so this only ever fires on one that is wedged or unreachable — never on one that
 * is merely busy. Being generous costs nothing because {@link withTimeout} clears the timer the
 * moment the POST settles.
 */
const CAPTURE_POST_TIMEOUT_MS = 2_000;

/**
 * The same bound for a service-binding transport, where the sidecar is a Worker that hands the
 * batch to a Durable Object before answering. That object may live in another region and is
 * single-threaded, so a busy one can legitimately take far longer than a loopback process — and
 * failing the report early would drop spans a slightly longer wait would have recorded.
 * `waitUntil` allows 30s past the response, so this stays well inside its budget.
 */
const CAPTURE_POST_BINDING_TIMEOUT_MS = 10_000;

/** POSTs capture events to the sidecar. Never rejects — reporting failures only warn (once). */
export const postCaptureEvents = async (
  transport: SidecarTransport,
  events: CaptureEvent[],
): Promise<void> => {
  const timeoutMs =
    transport.kind === "binding"
      ? CAPTURE_POST_BINDING_TIMEOUT_MS
      : CAPTURE_POST_TIMEOUT_MS;
  try {
    const payload: CaptureEventsPayload = { events };
    await withTimeout(timeoutMs, async (signal) => {
      const response = await sidecarFetch(
        transport,
        getOriginalFetch(),
        SIDECAR_EVENTS_PATH,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [SIDECAR_PROTOCOL_VERSION_HEADER]: SIDECAR_PROTOCOL_VERSION,
          },
          body: JSON.stringify(payload),
          signal,
        },
      );
      if (!response.ok) {
        warnOnce(
          "sidecar-rejected",
          `Meticulous sidecar rejected capture events (HTTP ${response.status}).`,
        );
      }
      await response.arrayBuffer().catch(() => undefined);
    });
  } catch (error) {
    warnOnce(
      "sidecar-unreachable",
      "Could not reach the Meticulous backend recorder sidecar — backend session events are not being recorded.",
      error,
    );
  }
};

/**
 * Outcome of the session handshake.
 *
 * `unavailable` and `unreachable` both mean "do not replay", but they are kept apart
 * because only the first is a settled answer. The caller caches per isolate, and caching a
 * one-off network blip would disable mocking for the rest of the session — silently sending
 * every later outbound call to the real service.
 */
export type ReplaySessionInfoResult =
  /** The sidecar holds mocks for this session. */
  | { outcome: "found"; clockAnchorMs: number | undefined }
  /** The sidecar answered and will never serve this session: no mocks, or no such route. */
  | { outcome: "unavailable" }
  /** Could not get an answer — timeout, transport error, 5xx. May succeed later. */
  | { outcome: "unreachable" };

/**
 * Asks whether the sidecar holds mocks for a session, and at what instant to freeze the
 * clock while serving it.
 *
 * A 404 is how a record-only sidecar answers, so it counts as a settled `unavailable`
 * rather than a retryable blip.
 */
export const getReplaySessionInfo = async (
  fetchFn: FetchFn,
  sidecarUrl: string,
  frontendSessionId: string,
): Promise<ReplaySessionInfoResult> => {
  const url = `${sidecarUrl}${SIDECAR_REPLAY_SESSION_PATH}?sessionId=${encodeURIComponent(
    frontendSessionId,
  )}`;
  try {
    return await withTimeout(SESSION_INFO_TIMEOUT_MS, async (signal) => {
      const response = await fetchFn(url, {
        headers: {
          [SIDECAR_PROTOCOL_VERSION_HEADER]: SIDECAR_PROTOCOL_VERSION,
        },
        signal,
      });
      if (!response.ok) {
        await response.arrayBuffer().catch(() => undefined);
        // 4xx is the sidecar telling us something definitive — no such route (a record-only
        // sidecar), or a protocol version it will not speak. Retrying cannot change either.
        // 5xx may well be a sidecar still finding its feet, so leave it retryable.
        if (response.status >= 500) {
          warnOnce(
            "replay-session-unreachable",
            `Meticulous replay sidecar failed the replay session handshake (HTTP ${response.status}) — will retry on the next request.`,
          );
          return { outcome: "unreachable" };
        }
        warnOnce(
          "replay-session-unavailable",
          `Meticulous replay sidecar did not recognise the replay session route (HTTP ${response.status}) — outbound calls will not be mocked.`,
        );
        return { outcome: "unavailable" };
      }
      const info = (await response.json()) as ReplaySessionInfoResponse;
      if (info.found !== true) {
        warnOnce(
          "replay-session-unknown",
          "Meticulous replay sidecar holds no mocks for this session — outbound calls will not be mocked.",
        );
        return { outcome: "unavailable" };
      }
      return {
        outcome: "found",
        clockAnchorMs:
          typeof info.clockAnchorMs === "number"
            ? info.clockAnchorMs
            : undefined,
      };
    });
  } catch (error) {
    warnOnce(
      "replay-session-unreachable",
      "Could not reach the Meticulous replay sidecar — will retry on the next request.",
      error,
    );
    return { outcome: "unreachable" };
  }
};

/**
 * Looks up a recorded response for one outbound call. Never rejects; returns undefined when
 * the sidecar could not be consulted, which the caller fails the request on — an unanswered
 * lookup is not evidence that a real call is safe.
 */
export const postOutboundFetchLookup = async (
  fetchFn: FetchFn,
  sidecarUrl: string,
  payload: OutboundFetchLookupRequest,
): Promise<OutboundFetchLookupResponse | undefined> => {
  try {
    return await withTimeout(LOOKUP_TIMEOUT_MS, async (signal) => {
      const response = await fetchFn(
        `${sidecarUrl}${SIDECAR_REPLAY_OUTBOUND_FETCH_PATH}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [SIDECAR_PROTOCOL_VERSION_HEADER]: SIDECAR_PROTOCOL_VERSION,
          },
          body: JSON.stringify(payload),
          signal,
        },
      );
      if (!response.ok) {
        warnOnce(
          "replay-lookup-rejected",
          `Meticulous replay sidecar rejected a mock lookup (HTTP ${response.status}).`,
        );
        await response.arrayBuffer().catch(() => undefined);
        return undefined;
      }
      return (await response.json()) as OutboundFetchLookupResponse;
    });
  } catch (error) {
    warnOnce(
      "replay-lookup-unreachable",
      "Could not reach the Meticulous replay sidecar for a mock lookup — the call will fail.",
      error,
    );
    return undefined;
  }
};

/**
 * Runs `send` under an abort signal that fires after `ms`, clearing the timer as soon as the
 * call settles — including the response body read, which an abort must still cut short.
 *
 * Deliberately not `AbortSignal.timeout`: its timer cannot be cancelled, and a pending timer
 * keeps workerd's request context alive. Bounding a 5ms POST at 2s would then pin the context
 * for the remaining ~2s on every captured call — worse than the unbounded wait it exists to
 * prevent, and on the healthy path rather than the broken one. `body-capture.ts` uses this
 * same clearable shape, for the same reason.
 */
const withTimeout = async <T>(
  ms: number,
  send: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await send(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};
