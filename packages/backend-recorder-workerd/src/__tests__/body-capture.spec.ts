import { describe, expect, it } from "vitest";
import { MAX_BODY_CAPTURE_SIZE, readBodyWithCap } from "../body-capture";

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
