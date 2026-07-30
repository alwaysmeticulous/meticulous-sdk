import type { CapturedBody } from "./protocol";

/** Matches the Node backend recorder's body capture cap (met-http-instrumentation). */
export const MAX_BODY_CAPTURE_SIZE = 256 * 1024;

/** Cap on how long we keep reading a (possibly never-ending, e.g. SSE) body clone. */
const BODY_READ_TIMEOUT_MS = 10_000;

const TIMED_OUT = Symbol("meticulous.bodyReadTimedOut");

/**
 * Reads a body stream up to {@link MAX_BODY_CAPTURE_SIZE} bytes, decoding as
 * UTF-8. Stops (and marks the capture truncated) on the size cap or the time
 * guard, so a long-lived stream can never pin the capture work. Returns
 * undefined for absent bodies.
 */
export const readBodyWithCap = async (
  stream: ReadableStream<Uint8Array> | null,
): Promise<CapturedBody | undefined> => {
  if (!stream) {
    return undefined;
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let bytes = 0;
  let truncated = false;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), BODY_READ_TIMEOUT_MS);
  });

  try {
    while (true) {
      const result = await Promise.race([reader.read(), timedOut]);
      if (result === TIMED_OUT) {
        truncated = true;
        break;
      }
      const { done, value } = result;
      if (done) {
        break;
      }
      if (!value || value.byteLength === 0) {
        continue;
      }
      const remaining = MAX_BODY_CAPTURE_SIZE - bytes;
      if (value.byteLength >= remaining) {
        text += decoder.decode(value.subarray(0, remaining), { stream: true });
        bytes += remaining;
        truncated = truncated || value.byteLength > remaining;
        // Even an exact-cap chunk means we stop reading, so a longer stream
        // counts as truncated.
        const next = await Promise.race([reader.read(), timedOut]);
        if (next === TIMED_OUT || !next.done) {
          truncated = true;
        }
        break;
      }
      text += decoder.decode(value, { stream: true });
      bytes += value.byteLength;
    }
  } finally {
    clearTimeout(timer);
    reader.cancel().catch(() => {});
  }

  text += decoder.decode();
  return { body: text, truncated };
};
