import { randomBytes } from "crypto";
import { inflateRawSync } from "zlib";
import { describe, expect, it, vi } from "vitest";
import { ParallelDeflater } from "../parallel-deflater";

const compress = async (
  chunks: Buffer[],
  options: { segmentSize?: number; concurrency?: number } = {},
): Promise<{ output: Buffer; segments: Buffer[] }> => {
  const segments: Buffer[] = [];
  const deflater = new ParallelDeflater({
    level: 3,
    concurrency: options.concurrency ?? 3,
    segmentSize: options.segmentSize ?? 1024,
    onOutput: (compressed) => {
      segments.push(compressed);
    },
  });
  for (const chunk of chunks) {
    await deflater.write(chunk);
  }
  await deflater.end();
  return { output: Buffer.concat(segments), segments };
};

describe("ParallelDeflater", () => {
  it("splits a large input chunk into bounded segments and preserves the dictionary", async () => {
    const input = Buffer.from(randomBytes(4000).toString("hex").repeat(16));
    const { output, segments } = await compress([input], { segmentSize: 8192 });
    expect(segments).toHaveLength(Math.ceil(input.length / 8192) + 1);
    expect(inflateRawSync(output)).toEqual(input);
    expect(output.length).toBeLessThan(10_000);
  });

  it("applies backpressure within a single large input chunk", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onOutput = vi.fn(() => gate);
    const deflater = new ParallelDeflater({
      level: 3,
      concurrency: 1,
      segmentSize: 100,
      onOutput,
    });
    try {
      let written = false;
      const writing = Promise.resolve(deflater.write(Buffer.alloc(1000))).then(
        () => {
          written = true;
        },
      );
      await vi.waitFor(() => expect(onOutput).toHaveBeenCalledTimes(1));
      expect(written).toBe(false);
      release();
      await writing;
      await deflater.end();
      expect(onOutput).toHaveBeenCalledTimes(11);
    } finally {
      release();
      await deflater.destroy();
    }
  });
  it("produces a single valid raw-deflate stream from independent segments", async () => {
    const chunks = Array.from({ length: 50 }, (_, i) =>
      Buffer.from(`chunk ${i} `.repeat(200)),
    );
    const { output, segments } = await compress(chunks);

    expect(segments.length).toBeGreaterThan(3);
    expect(inflateRawSync(output).equals(Buffer.concat(chunks))).toBe(true);
  });

  it("emits segments in input order even when they finish out of order", async () => {
    // Alternating large compressible / tiny segments finish at different times.
    const chunks = Array.from({ length: 40 }, (_, i) =>
      i % 2 === 0 ? Buffer.from("a".repeat(200_000)) : randomBytes(2000),
    );
    const { output } = await compress(chunks, { segmentSize: 1500 });

    expect(inflateRawSync(output).equals(Buffer.concat(chunks))).toBe(true);
  });

  it("produces a valid empty stream when there is no input", async () => {
    const { output } = await compress([]);

    expect(inflateRawSync(output).length).toBe(0);
  });

  it("round-trips input smaller than one segment", async () => {
    const { output } = await compress([Buffer.from("tiny")], {
      segmentSize: 1024 * 1024,
    });

    expect(inflateRawSync(output).toString()).toBe("tiny");
  });

  it("stores runs of incompressible data instead of deflating them", async () => {
    const incompressible = Array.from({ length: 40 }, () => randomBytes(1000));
    const { output, segments } = await compress(incompressible, {
      segmentSize: 1000,
      concurrency: 1,
    });

    expect(inflateRawSync(output).equals(Buffer.concat(incompressible))).toBe(
      true,
    );
    // Stored output is input + a few bytes of framing; compressing random
    // data at level 3 would only ever be marginally different, so check that
    // nothing grew by more than framing overhead.
    const overhead = output.length - 40 * 1000;
    expect(overhead).toBeLessThan(segments.length * 16);
  });

  it("still compresses compressible data that follows incompressible data", async () => {
    const chunks = [
      ...Array.from({ length: 20 }, () => randomBytes(1000)),
      ...Array.from({ length: 40 }, () => Buffer.from("x".repeat(1000))),
    ];
    const { output } = await compress(chunks, {
      segmentSize: 1000,
      concurrency: 1,
    });

    expect(inflateRawSync(output).equals(Buffer.concat(chunks))).toBe(true);
    expect(output.length).toBeLessThan(20 * 1000 + 40 * 1000 * 0.5);
  });

  it("refers back across segment boundaries instead of restarting the dictionary", async () => {
    // Each segment holds two copies of the block. Without the previous
    // segment's tail as a dictionary, every segment would have to spell the
    // random block out again (~8KB each).
    const block = randomBytes(8000);
    const chunks = Array.from({ length: 30 }, () => block);
    const { output, segments } = await compress(chunks, {
      segmentSize: 10_000,
    });

    expect(segments.length).toBeGreaterThan(10);
    expect(inflateRawSync(output).equals(Buffer.concat(chunks))).toBe(true);
    expect(output.length).toBeLessThan(block.length * 2);
  });

  it("compresses segments that directly follow incompressible ones", async () => {
    const segmentSize = 16 * 1024;
    const chunks = [
      ...Array.from({ length: 10 }, () => randomBytes(segmentSize)),
      ...Array.from({ length: 10 }, (_, i) =>
        Buffer.from(
          `line ${i}\n`.repeat(segmentSize / 8).slice(0, segmentSize),
        ),
      ),
    ];
    const { output } = await compress(chunks, { segmentSize });

    expect(inflateRawSync(output).equals(Buffer.concat(chunks))).toBe(true);
    // The random half can't shrink; the text half should nearly vanish.
    expect(output.length).toBeLessThan(10 * segmentSize + segmentSize);
  });

  it("applies backpressure when the consumer is slow", async () => {
    let released = 0;
    let releaseImmediately = false;
    const gates: Array<() => void> = [];
    const deflater = new ParallelDeflater({
      level: 3,
      concurrency: 1,
      segmentSize: 100,
      onOutput: () =>
        new Promise<void>((resolve) => {
          const release = () => {
            released++;
            resolve();
          };
          // Output that reaches the consumer after the gates are opened (a
          // slow worker) must not wait on a gate nobody will release.
          if (releaseImmediately) {
            release();
          } else {
            gates.push(release);
          }
        }),
    });

    let blocked = false;
    for (let i = 0; i < 10 && !blocked; i++) {
      const wait = deflater.write(Buffer.alloc(100, i));
      if (wait) {
        blocked = true;
        let settled = false;
        void wait.then(() => {
          settled = true;
        });
        await new Promise((r) => setTimeout(r, 50));
        expect(settled).toBe(false);
        releaseImmediately = true;
        gates.forEach((release) => release());
        await wait;
        expect(released).toBeGreaterThan(0);
      }
    }
    expect(blocked).toBe(true);
    await deflater.destroy();
  });

  it("propagates consumer errors to the writer", async () => {
    const deflater = new ParallelDeflater({
      level: 3,
      concurrency: 1,
      segmentSize: 10,
      onOutput: () => Promise.reject(new Error("upload failed")),
    });

    await expect(deflater.write(Buffer.alloc(20))).rejects.toThrow(
      "upload failed",
    );
    await expect(deflater.end()).rejects.toThrow("upload failed");
  });
});
