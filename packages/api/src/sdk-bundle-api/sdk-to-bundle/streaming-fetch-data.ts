import { SequenceNumber } from "./websocket-data";

/**
 * A single chunk of streamed response data from a fetch request
 * using the ReadableStream API (e.g. `response.body.getReader()`).
 */
export interface StreamingFetchChunk {
  /** Time offset in milliseconds since the streaming response began */
  offsetMs: number;
  /** Base64-encoded bytes received in this chunk */
  data: string;
}

/**
 * Recorded data for a single streaming fetch response.
 *
 * Only present on recordings since ~Feb 2026.
 */
export interface StreamingFetchResponseData {
  id: SequenceNumber;
  url: string;
  method: string;
  /** The order of the corresponding HAR entry in the recorded HAR log */
  harEntryOrder: number;
  chunks: StreamingFetchChunk[];
  /** Whether the stream completed normally (true) or was aborted/errored (false) */
  completed: boolean;
}
