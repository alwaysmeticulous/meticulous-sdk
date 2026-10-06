import { describe, expect, it } from "vitest";

import {
  BODY_ENCODING_BASE64,
  decodeBodyBytes,
  encodeBodyBytes,
} from "../body-encoding";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

// The start of a gzip stream: 0x8b is never valid UTF-8.
const GZIP_HEADER = Uint8Array.from([
  0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03,
]);

const UNCAPPED = { maxLength: 1024, incompleteTail: false };

describe("encodeBodyBytes", () => {
  it("stores UTF-8 as its text, with no encoding", () => {
    expect(encodeBodyBytes(utf8('{"name":"José"}'), UNCAPPED)).toEqual({
      body: '{"name":"José"}',
      storedFraction: 1,
    });
  });

  it("stores bytes that are not UTF-8 as base64 that decodes back to them", () => {
    const encoded = encodeBodyBytes(GZIP_HEADER, UNCAPPED);

    expect(encoded.encoding).toBe(BODY_ENCODING_BASE64);
    expect(encoded.storedFraction).toBe(1);
    expect(Array.from(decodeBodyBytes(encoded.body, encoded.encoding))).toEqual(
      Array.from(GZIP_HEADER),
    );
  });

  it("keeps a byte-order mark, so the text encodes back to the same bytes", () => {
    const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8("hi")]);
    const { body, encoding } = encodeBodyBytes(bytes, UNCAPPED);

    expect(encoding).toBeUndefined();
    expect(Array.from(decodeBodyBytes(body, encoding))).toEqual(
      Array.from(bytes),
    );
  });

  it("accepts a final character cut short only when the bytes are a prefix", () => {
    const cut = utf8("€€").subarray(0, 4);

    expect(encodeBodyBytes(cut, { ...UNCAPPED, incompleteTail: true })).toEqual(
      { body: "€", storedFraction: 1 },
    );
    expect(encodeBodyBytes(cut, UNCAPPED).encoding).toBe(BODY_ENCODING_BASE64);
  });

  it("caps text by characters", () => {
    expect(
      encodeBodyBytes(utf8("abcdef"), { maxLength: 4, incompleteTail: false }),
    ).toEqual({ body: "abcd", storedFraction: 4 / 6 });
  });

  it("caps base64 at the bytes whose encoding fits the same length", () => {
    const binary = new Uint8Array(12).fill(0xff);
    const encoded = encodeBodyBytes(binary, {
      maxLength: 8,
      incompleteTail: false,
    });

    expect(encoded.body).toHaveLength(8);
    expect(encoded.storedFraction).toBe(0.5);
    expect(Array.from(decodeBodyBytes(encoded.body, encoded.encoding))).toEqual(
      Array.from(binary.subarray(0, 6)),
    );
  });

  it("stores an empty body as empty text", () => {
    expect(encodeBodyBytes(new Uint8Array(0), UNCAPPED)).toEqual({
      body: "",
      storedFraction: 1,
    });
  });
});

describe("decodeBodyBytes", () => {
  it("reads a body with no encoding as UTF-8 text", () => {
    expect(Array.from(decodeBodyBytes("é", undefined))).toEqual(
      Array.from(utf8("é")),
    );
  });
});
