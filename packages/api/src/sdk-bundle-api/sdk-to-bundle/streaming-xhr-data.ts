import type { SequenceNumber } from "./websocket-data";

/**
 * A single chunk of streamed response text from an XMLHttpRequest, captured
 * incrementally via progress events while the request was in the LOADING state.
 */
export interface StreamingXhrChunk {
  /** Time offset in milliseconds since the streaming response began */
  offsetMs: number;
  /** Base64-encoded UTF-8 bytes of the responseText delta received in this chunk */
  data: string;
}

/**
 * Recorded data for a single streaming XHR response (a long-lived response
 * consumed progressively via `responseText` while the request is in the
 * LOADING state, e.g. SSE-over-XHR or chunked streaming responses).
 *
 * Only recorded for requests with a text response type (`""` or `"text"`),
 * since progressive reads of `responseText` are not possible for other
 * response types.
 *
 * Only present on recordings since ~Jul 2026.
 */
export interface StreamingXhrResponseData {
  id: SequenceNumber;
  url: string;
  method: string;
  /** The order of the corresponding HAR entry in the recorded HAR log */
  harEntryOrder: number;
  chunks: StreamingXhrChunk[];
  /** Whether the request completed normally (true) or was aborted/errored/still in flight when the recording ended (false) */
  completed: boolean;
  /**
   * Milliseconds between the request being sent and the response headers being
   * received. Chunk offsetMs values are relative to this moment, so replay uses
   * it to start delivering chunks at the recorded time. The HAR entry's own
   * timing can't be used for this: for a streaming response it reflects the
   * streaming detection timeout, not when the response started.
   */
  responseStartOffsetMs?: number;
}
