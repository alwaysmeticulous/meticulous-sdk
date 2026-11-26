import type { HarRequest } from "./har-log";

/**
 * A fetch or XMLHttpRequest that failed at the network level while recording,
 * so it has no response: the page saw `TypeError: Failed to fetch` or the XHR
 * `error` event. Typical causes are an unreachable or refused host, a CORS
 * failure, or a dropped connection. Requests the page aborted are not
 * recorded.
 *
 * Replay fails a request that matches one of these instead of reporting it as
 * having no recorded response.
 *
 * Only present on recordings since ~Nov 2026.
 */
export interface FailedNetworkRequest {
  /** When the request was sent, as an ISO 8601 timestamp. */
  startedDateTime: string;
  /** The request, in the same form as a recorded HAR entry's request. */
  request: HarRequest;
  /** The API the page made the request through. */
  transport: "fetch" | "xhr";
}
