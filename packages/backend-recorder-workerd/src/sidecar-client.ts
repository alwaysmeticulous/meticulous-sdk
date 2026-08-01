import { warnOnce } from "./log";
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

type FetchFn = typeof globalThis.fetch;

/**
 * Replay calls sit in the request path, unlike record mode's fire-and-forget reporting, so
 * they must be bounded: without a timeout a wedged sidecar would hang every outbound fetch
 * the app makes, and therefore the whole replay, with nothing to look at.
 */
const SESSION_INFO_TIMEOUT_MS = 10_000;
const LOOKUP_TIMEOUT_MS = 5_000;

/** POSTs capture events to the sidecar. Never rejects — reporting failures only warn (once). */
export const postCaptureEvents = async (
  fetchFn: FetchFn,
  sidecarUrl: string,
  events: CaptureEvent[],
): Promise<void> => {
  try {
    const payload: CaptureEventsPayload = { events };
    const response = await fetchFn(`${sidecarUrl}${SIDECAR_EVENTS_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [SIDECAR_PROTOCOL_VERSION_HEADER]: SIDECAR_PROTOCOL_VERSION,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      warnOnce(
        "sidecar-rejected",
        `Meticulous sidecar rejected capture events (HTTP ${response.status}).`,
      );
    }
    await response.arrayBuffer().catch(() => undefined);
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
 * A 404 is how a record-only sidecar answers, so it counts as a settled `unavailable` and
 * the shim degrades to pass-through against an older sidecar rather than failing.
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
    const response = await fetchFn(url, {
      headers: {
        [SIDECAR_PROTOCOL_VERSION_HEADER]: SIDECAR_PROTOCOL_VERSION,
      },
      signal: timeoutSignal(SESSION_INFO_TIMEOUT_MS),
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
        typeof info.clockAnchorMs === "number" ? info.clockAnchorMs : undefined,
    };
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
 * the sidecar could not be consulted, which callers treat the same as a miss (let the real
 * call through).
 */
export const postOutboundFetchLookup = async (
  fetchFn: FetchFn,
  sidecarUrl: string,
  payload: OutboundFetchLookupRequest,
): Promise<OutboundFetchLookupResponse | undefined> => {
  try {
    const response = await fetchFn(
      `${sidecarUrl}${SIDECAR_REPLAY_OUTBOUND_FETCH_PATH}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [SIDECAR_PROTOCOL_VERSION_HEADER]: SIDECAR_PROTOCOL_VERSION,
        },
        body: JSON.stringify(payload),
        signal: timeoutSignal(LOOKUP_TIMEOUT_MS),
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
  } catch (error) {
    warnOnce(
      "replay-lookup-unreachable",
      "Could not reach the Meticulous replay sidecar for a mock lookup — letting the real call through.",
      error,
    );
    return undefined;
  }
};

/** AbortSignal.timeout, or undefined where it is unavailable. */
const timeoutSignal = (ms: number): AbortSignal | undefined => {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined;
  }
};
