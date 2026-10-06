import { describe, expect, it } from "vitest";
import {
  MAX_BODY_CAPTURE_SIZE,
  readBodyWithCap,
  readResponseBodyWithCap,
} from "../body-capture";

const streamOf = (...chunks: Uint8Array[]): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("readBodyWithCap", () => {
  it("returns undefined for absent bodies", async () => {
    await expect(readBodyWithCap(null)).resolves.toBeUndefined();
  });

  it("reads a small body without truncation", async () => {
    const result = await readBodyWithCap(
      streamOf(encode('{"a":'), encode("1}")),
    );
    expect(result).toEqual({ body: '{"a":1}', truncated: false });
  });

  it("caps oversized bodies and marks them truncated", async () => {
    const big = "x".repeat(MAX_BODY_CAPTURE_SIZE + 10);
    const result = await readBodyWithCap(streamOf(encode(big)));
    expect(result?.truncated).toBe(true);
    expect(result?.body).toHaveLength(MAX_BODY_CAPTURE_SIZE);
  });

  it("marks an exact-cap read truncated only when more data follows", async () => {
    const exact = "y".repeat(MAX_BODY_CAPTURE_SIZE);
    const exactResult = await readBodyWithCap(streamOf(encode(exact)));
    expect(exactResult?.truncated).toBe(false);
    expect(exactResult?.body).toHaveLength(MAX_BODY_CAPTURE_SIZE);

    const withMore = await readBodyWithCap(
      streamOf(encode(exact), encode("more")),
    );
    expect(withMore?.truncated).toBe(true);
    expect(withMore?.body).toHaveLength(MAX_BODY_CAPTURE_SIZE);
  });

  it("decodes multi-byte UTF-8 sequences split across chunks", async () => {
    const bytes = encode("héllo → wörld");
    const result = await readBodyWithCap(
      streamOf(bytes.subarray(0, 3), bytes.subarray(3)),
    );
    expect(result).toEqual({ body: "héllo → wörld", truncated: false });
  });
});

describe("readResponseBodyWithCap", () => {
  // The start of a gzip stream: 0x8b is never valid UTF-8.
  const GZIP_HEADER = Uint8Array.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00]);

  it("returns undefined for absent bodies", async () => {
    await expect(readResponseBodyWithCap(null)).resolves.toBeUndefined();
  });

  it("reads a UTF-8 body split across chunks as text", async () => {
    const bytes = encode("héllo → wörld");
    const result = await readResponseBodyWithCap(
      streamOf(bytes.subarray(0, 3), bytes.subarray(3)),
    );
    expect(result).toEqual({ body: "héllo → wörld", truncated: false });
  });

  it("reads a body that is not UTF-8 as base64 of its exact bytes", async () => {
    const result = await readResponseBodyWithCap(
      streamOf(GZIP_HEADER.subarray(0, 2), GZIP_HEADER.subarray(2)),
    );
    expect(result).toEqual({
      body: Buffer.from(GZIP_HEADER).toString("base64"),
      truncated: false,
      encoding: "base64",
    });
  });

  it("keeps a base64 body within the cap and marks it truncated", async () => {
    const big = new Uint8Array(MAX_BODY_CAPTURE_SIZE).fill(0xff);
    const result = await readResponseBodyWithCap(streamOf(big));
    expect(result?.encoding).toBe("base64");
    expect(result?.body).toHaveLength(MAX_BODY_CAPTURE_SIZE);
    expect(result?.truncated).toBe(true);
  });

  it("leaves the lossy request-side decode unchanged", async () => {
    const result = await readBodyWithCap(streamOf(GZIP_HEADER));
    expect(result?.body).toBe(new TextDecoder().decode(GZIP_HEADER));
    expect(result).not.toHaveProperty("encoding");
  });
});
