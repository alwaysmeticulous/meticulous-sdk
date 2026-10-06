import { encodeBodyBytes } from "./body-encoding";
import type { CapturedBody } from "./protocol";
import { redactRequestBody } from "./redact-body";

/**
 * Cap on the bytes of any one captured body, and so on the size of the span attribute it
 * becomes. Defined here and re-exported by the Node recorder's `constants.ts` (same
 * arrangement as the shared attribute names) so a Worker recording and a Node recording
 * truncate at the same point, and so the replay side — which re-applies the cap to a live
 * body before hashing it — agrees with what was stored.
 */
export const MAX_BODY_CAPTURE_SIZE = 1024 * 1024;

/** Cap on how long we keep reading a (possibly never-ending, e.g. SSE) body clone. */
const BODY_READ_TIMEOUT_MS = 10_000;

const TIMED_OUT = Symbol("meticulous.bodyReadTimedOut");

/**
 * Reads a body stream up to {@link MAX_BODY_CAPTURE_SIZE} bytes, decoding as
 * UTF-8. Stops (and marks the capture truncated) on the size cap or the time
 * guard, so a long-lived stream can never pin the capture work. Returns
 * undefined for absent bodies.
 *
 * The decode turns any byte that is not UTF-8 into U+FFFD, which is only acceptable for a body
 * that is hashed rather than served back. Response bodies go through
 * {@link readResponseBodyWithCap} instead.
 */
export const readBodyWithCap = async (
  stream: ReadableStream<Uint8Array> | null,
): Promise<CapturedBody | undefined> => {
  const read = await readBodyBytesWithCap(stream);
  if (read === undefined) {
    return undefined;
  }
  return {
    body: new TextDecoder("utf-8").decode(read.bytes),
    truncated: read.truncated,
  };
};

/**
 * Reads a *request* body, redacting secret-looking fields before it leaves the worker.
 *
 * Every request-body capture path goes through here, so record and replay redact
 * identically and any hash derived from the body still agrees on both sides. Response
 * bodies deliberately use {@link readResponseBodyWithCap} — they are served back to the
 * app during replay and must stay byte-exact.
 */
export const readRequestBodyWithCap = async (
  stream: ReadableStream<Uint8Array> | null,
): Promise<CapturedBody | undefined> => {
  const captured = await readBodyWithCap(stream);
  if (captured === undefined) {
    return undefined;
  }
  return { ...captured, body: redactRequestBody(captured.body) };
};

/**
 * Reads a *response* body so that replay can serve back exactly the bytes the app received: as
 * text when they are UTF-8, and as base64 otherwise (see `encodeBodyBytes`).
 */
export const readResponseBodyWithCap = async (
  stream: ReadableStream<Uint8Array> | null,
): Promise<CapturedBody | undefined> => {
  const read = await readBodyBytesWithCap(stream);
  if (read === undefined) {
    return undefined;
  }
  const { body, encoding, storedFraction } = encodeBodyBytes(read.bytes, {
    maxLength: MAX_BODY_CAPTURE_SIZE,
    incompleteTail: read.truncated,
  });
  return {
    body,
    truncated: read.truncated || storedFraction < 1,
    ...(encoding !== undefined ? { encoding } : {}),
  };
};

const readBodyBytesWithCap = async (
  stream: ReadableStream<Uint8Array> | null,
): Promise<{ bytes: Uint8Array; truncated: boolean } | undefined> => {
  if (!stream) {
    return undefined;
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
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
        chunks.push(value.subarray(0, remaining));
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
      chunks.push(value);
      bytes += value.byteLength;
    }
  } finally {
    clearTimeout(timer);
    reader.cancel().catch(() => {});
  }

  return { bytes: concatBytes(chunks, bytes), truncated };
};

const concatBytes = (chunks: Uint8Array[], byteLength: number): Uint8Array => {
  if (chunks.length === 1) {
    return chunks[0];
  }
  const out = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};
