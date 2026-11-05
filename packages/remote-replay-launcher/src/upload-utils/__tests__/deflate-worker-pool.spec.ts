import { randomBytes } from "crypto";
import { constants as zlibConstants, inflateRawSync } from "zlib";
import { Worker } from "worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeflateWorkerPool } from "../deflate-worker-pool";

const inflateSyncFlushed = (compressed: Buffer): Buffer =>
  inflateRawSync(compressed, { finishFlush: zlibConstants.Z_SYNC_FLUSH });

describe("DeflateWorkerPool", () => {
  let pool: DeflateWorkerPool;

  afterEach(async () => {
    await pool.close();
    vi.restoreAllMocks();
  });

  it.each([0, 1])(
    "rejects active and queued jobs when a worker exits unexpectedly (%i)",
    async (code) => {
      pool = new DeflateWorkerPool(1);
      vi.spyOn(Worker.prototype, "postMessage").mockImplementation(
        function (this: Worker) {
          queueMicrotask(() => this.emit("exit", code));
        },
      );
      const jobs = Array.from({ length: 3 }, () =>
        pool.compress({
          segment: Buffer.from("x"),
          level: 3,
          dictionary: undefined,
        }),
      );
      await Promise.all(
        jobs.map((job) => expect(job).rejects.toThrow("exited")),
      );
    },
  );

  it("compresses a segment that inflates back to the input", async () => {
    pool = new DeflateWorkerPool(2);
    const segment = Buffer.from("hello world ".repeat(10_000));

    const output = await pool.compress({
      segment,
      level: 3,
      dictionary: undefined,
    });

    expect(output.length).toBeLessThan(segment.length / 10);
    expect(inflateSyncFlushed(output).equals(segment)).toBe(true);
  });

  it("uses the dictionary to refer back into the preceding bytes", async () => {
    pool = new DeflateWorkerPool(2);
    // Hex text compresses on its own (so it isn't stored), but only the
    // dictionary lets the repeat collapse into back-references.
    const first = Buffer.from(randomBytes(10_000).toString("hex"));
    const second = Buffer.from(first);

    const [firstOut, withDictionary, withoutDictionary] = await Promise.all([
      pool.compress({ segment: first, level: 3, dictionary: undefined }),
      pool.compress({ segment: second, level: 3, dictionary: first }),
      pool.compress({ segment: second, level: 3, dictionary: undefined }),
    ]);

    expect(withDictionary.length).toBeLessThan(withoutDictionary.length / 10);
    expect(
      inflateSyncFlushed(Buffer.concat([firstOut, withDictionary])).equals(
        Buffer.concat([first, second]),
      ),
    ).toBe(true);
  });

  it("stores incompressible segments with only framing overhead", async () => {
    pool = new DeflateWorkerPool(1);
    const segment = randomBytes(256 * 1024);

    const output = await pool.compress({
      segment,
      level: 3,
      dictionary: undefined,
    });

    expect(output.length - segment.length).toBeLessThan(64);
    expect(inflateSyncFlushed(output).equals(segment)).toBe(true);
  });

  it("runs more jobs than it has workers", async () => {
    pool = new DeflateWorkerPool(2);
    const segments = Array.from({ length: 9 }, (_, i) =>
      Buffer.from(`segment ${i} `.repeat(5_000)),
    );

    const outputs = await Promise.all(
      segments.map((segment) =>
        pool.compress({ segment, level: 3, dictionary: undefined }),
      ),
    );

    outputs.forEach((output, i) => {
      expect(inflateSyncFlushed(output).equals(segments[i])).toBe(true);
    });
  });

  it("rejects when compression fails", async () => {
    pool = new DeflateWorkerPool(1);

    await expect(
      pool.compress({
        segment: Buffer.from("x"),
        level: 42,
        dictionary: undefined,
      }),
    ).rejects.toThrow("Compression failed");
  });

  it("rejects new work after it is closed", async () => {
    pool = new DeflateWorkerPool(1);
    await pool.close();

    await expect(
      pool.compress({
        segment: Buffer.from("x"),
        level: 3,
        dictionary: undefined,
      }),
    ).rejects.toThrow("closed");
  });
});
