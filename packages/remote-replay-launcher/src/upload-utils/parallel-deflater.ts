import pLimit from "p-limit";
import { DeflateWorkerPool } from "./deflate-worker-pool";

/**
 * A raw-deflate stream containing only an empty final block. Appended after
 * the last segment so that the concatenation of all segments is a complete,
 * valid deflate stream.
 */
const FINAL_EMPTY_BLOCK = Buffer.from([0x03, 0x00]);

/** Input is compressed in segments of roughly this size. */
const DEFAULT_SEGMENT_SIZE = 1024 * 1024;

/** Deflate can refer back at most this far, so no larger dictionary helps. */
const DEFLATE_WINDOW_SIZE = 32 * 1024;

export interface ParallelDeflaterOptions {
  /**
   * Receives compressed bytes, always in input order. May return a promise to
   * apply backpressure: no further segments are started while the number of
   * un-emitted segments is at its limit.
   */
  onOutput: (compressed: Buffer) => void | Promise<void>;
  /** Deflate level (0-9) for compressible data. */
  level: number;
  /** Segments compressed at the same time, each on its own worker thread. */
  concurrency: number;
  segmentSize?: number;
}

/**
 * Compresses a byte stream to raw deflate using several threads, like `pigz`.
 *
 * The input is cut into segments (~1MiB). Each is compressed on a worker
 * thread and terminated with `Z_SYNC_FLUSH`, which leaves the output
 * byte-aligned and not marked final. Concatenating such segments and
 * appending an empty final block yields one ordinary deflate stream that any
 * inflater (e.g. `createInflateRaw`) decodes, so the wire format is unchanged.
 *
 * Each segment is compressed with the previous 32KiB of input as its
 * dictionary, so matches can still reach back across segment boundaries and
 * the output is about as small as a single-threaded deflate's.
 *
 * Compared with running one synchronous deflate on the main thread this:
 *  - uses several cores, rather than one, for the CPU-heavy step;
 *  - keeps the main thread free to read files and drive uploads;
 *  - avoids flushing the compressor after every tar chunk (tar emits a 512B
 *    header, then the body, per file), which hurts the ratio on builds with
 *    many small files;
 *  - stores (level 0) segments that don't compress, such as media, instead
 *    of burning CPU on them.
 */
export class ParallelDeflater {
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  private previousTail: Buffer | undefined = undefined;
  private unemittedSegments = 0;
  private emitChain: Promise<void> = Promise.resolve();
  private error: unknown = undefined;
  private capacityWaiters: Array<() => void> = [];
  private readonly limiter: ReturnType<typeof pLimit>;
  private readonly pool: DeflateWorkerPool;
  private readonly segmentSize: number;
  private readonly maxUnemittedSegments: number;

  constructor(private readonly options: ParallelDeflaterOptions) {
    this.limiter = pLimit(options.concurrency);
    this.pool = new DeflateWorkerPool(options.concurrency);
    this.segmentSize = options.segmentSize ?? DEFAULT_SEGMENT_SIZE;
    this.maxUnemittedSegments = options.concurrency * 2;
  }

  /**
   * Adds input. Returns a promise only when the caller should wait before
   * writing more (all compression slots busy, or downstream backed up).
   */
  write(chunk: Buffer): Promise<void> | undefined {
    this.throwIfFailed();
    let offset = 0;
    while (offset < chunk.length) {
      const length = Math.min(
        chunk.length - offset,
        this.segmentSize - this.pendingBytes,
      );
      this.pending.push(chunk.subarray(offset, offset + length));
      this.pendingBytes += length;
      offset += length;
      if (this.pendingBytes === this.segmentSize) {
        this.dispatchPending();
        if (this.unemittedSegments >= this.maxUnemittedSegments) {
          const remaining = chunk.subarray(offset);
          return this.waitForCapacity().then(() => this.write(remaining));
        }
      }
    }
    return undefined;
  }

  /** Compresses any remaining input and emits the final block. */
  async end(): Promise<void> {
    try {
      this.throwIfFailed();
      if (this.pendingBytes > 0) {
        this.dispatchPending();
      }
      await this.emitChain;
      this.throwIfFailed();
      await this.options.onOutput(FINAL_EMPTY_BLOCK);
    } finally {
      await this.pool.close();
    }
  }

  /** Stops the worker threads without finishing the stream. */
  async destroy(): Promise<void> {
    this.fail(new Error("ParallelDeflater is destroyed"));
    this.wakeWaiters();
    await this.pool.close();
  }

  private dispatchPending(): void {
    const segment = Buffer.concat(this.pending, this.pendingBytes);
    this.pending = [];
    this.pendingBytes = 0;

    const dictionary = this.previousTail;
    // Worker messages clone the entire backing buffer, even for a subarray.
    this.previousTail = Buffer.from(
      segment.subarray(Math.max(0, segment.length - DEFLATE_WINDOW_SIZE)),
    );

    this.unemittedSegments++;
    const compressed = this.limiter(() => {
      this.throwIfFailed();
      return this.pool.compress({
        segment,
        level: this.options.level,
        dictionary,
      });
    });
    // Segments finish out of order; emit strictly in input order.
    const previous = this.emitChain;
    this.emitChain = (async () => {
      let output: Buffer;
      try {
        output = await compressed;
        await previous;
        if (this.error === undefined) {
          await this.options.onOutput(output);
        }
      } catch (error) {
        this.fail(error);
      } finally {
        this.unemittedSegments--;
        this.wakeWaiters();
      }
    })();
  }

  private fail(error: unknown): void {
    if (this.error === undefined) {
      this.error = error;
    }
  }

  private throwIfFailed(): void {
    if (this.error !== undefined) {
      throw this.error instanceof Error
        ? this.error
        : new Error(String(this.error));
    }
  }

  private waitForCapacity(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.capacityWaiters.push(resolve);
    }).then(() => this.throwIfFailed());
  }

  private wakeWaiters(): void {
    if (
      this.error === undefined &&
      this.unemittedSegments >= this.maxUnemittedSegments
    ) {
      return;
    }
    const waiters = this.capacityWaiters;
    this.capacityWaiters = [];
    waiters.forEach((resolve) => resolve());
  }
}
