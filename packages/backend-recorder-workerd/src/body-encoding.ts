import { fromBase64, toBase64 } from "./base64";

/**
 * How a captured response body is stored on its span, so that replay can serve back exactly the
 * bytes the app received.
 *
 * A body whose bytes are valid UTF-8 — JSON, HTML, text — is stored as the text they decode to, with
 * no encoding attribute, exactly as every body was before this attribute existed. Any other body is
 * stored as base64 under {@link HTTP_RESPONSE_BODY_ENCODING_ATTR}. That covers a body that is binary
 * by type (a gzip or zip archive, an image, protobuf) or text in another charset. It arrives with no
 * `content-encoding`, so decompressing first does not help, and decoding it as UTF-8 would turn every
 * invalid byte into U+FFFD. That cannot be undone: replay would serve a body the app cannot parse.
 *
 * Only response bodies are stored this way. A request body is never served, only hashed into a
 * match key, and replay hashes the live request through the same lossy decode the recording used,
 * so the two still agree.
 */
export const HTTP_RESPONSE_BODY_ENCODING_ATTR = "http.response.body.encoding";

export const BODY_ENCODING_BASE64 = "base64";

export type BodyEncoding = typeof BODY_ENCODING_BASE64;

export interface EncodedBody {
  /** What the span stores: the body's text, or base64 of its bytes when `encoding` is set. */
  body: string;
  encoding?: BodyEncoding;
  /** Share of the input that `body` represents: 1 unless the length cap cut it. */
  storedFraction: number;
}

/**
 * Encodes captured body bytes for storage, capped so the stored string is at most `maxLength`
 * characters — the same bound whichever form the body takes.
 *
 * `incompleteTail` says the bytes are a prefix of a longer body, so a final UTF-8 sequence cut
 * short is expected rather than a sign that the body is not text.
 */
export const encodeBodyBytes = (
  bytes: Uint8Array,
  { maxLength, incompleteTail }: { maxLength: number; incompleteTail: boolean },
): EncodedBody => {
  const text = decodeUtf8Exactly(bytes, incompleteTail);
  if (text !== undefined) {
    const body = text.length > maxLength ? text.substring(0, maxLength) : text;
    return {
      body,
      storedFraction: text.length > 0 ? body.length / text.length : 1,
    };
  }
  // Base64 spends four characters on every three bytes.
  const maxBytes = Math.floor(maxLength / 4) * 3;
  const kept =
    bytes.byteLength > maxBytes ? bytes.subarray(0, maxBytes) : bytes;
  return {
    body: toBase64(kept),
    encoding: BODY_ENCODING_BASE64,
    storedFraction:
      bytes.byteLength > 0 ? kept.byteLength / bytes.byteLength : 1,
  };
};

/**
 * The bytes a stored body stands for. A body with no encoding is text, so its bytes are its UTF-8
 * encoding — which reproduces the recorded bytes exactly, since only valid UTF-8 is ever stored as
 * text.
 */
export const decodeBodyBytes = (body: string, encoding: unknown): Uint8Array =>
  encoding === BODY_ENCODING_BASE64
    ? fromBase64(body)
    : new TextEncoder().encode(body);

/**
 * The text the bytes encode, or undefined when they are not UTF-8. `fatal` makes an invalid
 * sequence throw instead of becoming U+FFFD, and `ignoreBOM` keeps a leading byte-order mark in
 * the text, so the text re-encodes to exactly these bytes.
 */
const decodeUtf8Exactly = (
  bytes: Uint8Array,
  incompleteTail: boolean,
): string | undefined => {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
      // A streaming decode holds back a final sequence cut short instead of rejecting it.
      { stream: incompleteTail },
    );
  } catch {
    return undefined;
  }
};
