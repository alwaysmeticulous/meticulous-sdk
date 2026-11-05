import { Worker } from "worker_threads";

export interface DeflateJob {
  segment: Buffer;
  /** Deflate level (0-9) to use if the segment looks compressible. */
  level: number;
  /**
   * The bytes that precede `segment` in the stream (at most 32KiB). Lets the
   * compressor refer back across the segment boundary, as a single-stream
   * deflate would.
   */
  dictionary: Buffer | undefined;
}

// The worker runs from source text so that the pool keeps working when this
// package is bundled into a single file (e.g. a GitHub Action), where there is
// no separate worker script on disk.
//
// A segment is stored (level 0) when three 4KiB samples from it barely shrink
// at level 1. That skips the CPU cost of deflating media and fonts without
// storing text that merely sits next to them in the tar.
const WORKER_SOURCE = `
const { parentPort } = require("worker_threads");
const zlib = require("zlib");

const SAMPLE_SIZE = 4096;
const INCOMPRESSIBLE_RATIO = 0.95;

const looksIncompressible = (segment) => {
  if (segment.length < 3 * SAMPLE_SIZE) {
    return false;
  }
  const middle = Math.floor(segment.length / 2);
  const sample = Buffer.concat([
    segment.subarray(0, SAMPLE_SIZE),
    segment.subarray(middle, middle + SAMPLE_SIZE),
    segment.subarray(segment.length - SAMPLE_SIZE),
  ]);
  return (
    zlib.deflateRawSync(sample, { level: 1 }).length >=
    sample.length * INCOMPRESSIBLE_RATIO
  );
};

parentPort.on("message", ({ segment, level, dictionary }) => {
  try {
    const input = Buffer.from(segment.buffer, segment.byteOffset, segment.byteLength);
    const output = zlib.deflateRawSync(input, {
      level: looksIncompressible(input) ? 0 : level,
      finishFlush: zlib.constants.Z_SYNC_FLUSH,
      ...(dictionary ? { dictionary } : {}),
    });
    parentPort.postMessage({ output });
  } catch (error) {
    parentPort.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
`;

interface QueuedJob extends DeflateJob {
  resolve: (output: Buffer) => void;
  reject: (error: Error) => void;
}

interface WorkerReply {
  output?: Uint8Array;
  error?: string;
}

/**
 * Compresses segments to raw deflate (terminated with `Z_SYNC_FLUSH`) on
 * worker threads.
 *
 * zlib's async API would run on libuv's threadpool instead, but that has 4
 * threads by default, shares them with file reads, and can only be resized
 * before its first use, so it caps compression at about 3 cores however large
 * the machine is.
 */
export class DeflateWorkerPool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly busy = new Map<Worker, QueuedJob>();
  private readonly queue: QueuedJob[] = [];
  private failure: Error | undefined = undefined;
  private closed = false;
  private closing: Promise<void> | undefined;

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(WORKER_SOURCE, { eval: true });
      this.workers.push(worker);
      worker.on("message", (reply: WorkerReply) => this.onReply(worker, reply));
      worker.on("error", (error) => this.onWorkerError(error));
      worker.on("exit", (code) => {
        if (!this.closed) {
          this.onWorkerError(
            new Error(`Compression worker exited unexpectedly (code ${code})`),
          );
        }
      });
      // Idle workers must not keep the process alive, e.g. if an upload is
      // abandoned before `close()` is called.
      worker.unref();
      this.idle.push(worker);
    }
  }

  compress(job: DeflateJob): Promise<Buffer> {
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    if (this.closed) {
      return Promise.reject(new Error("DeflateWorkerPool is closed"));
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ ...job, resolve, reject });
      this.dispatch();
    });
  }

  async close(): Promise<void> {
    if (this.closing) {
      return this.closing;
    }
    this.closed = true;
    this.idle.length = 0;
    const error = new Error("DeflateWorkerPool is closed");
    this.queue.splice(0).forEach((job) => job.reject(error));
    this.busy.forEach((job) => job.reject(error));
    this.busy.clear();
    this.closing = Promise.all(
      this.workers.map((worker) => worker.terminate()),
    ).then(() => undefined);
    await this.closing;
  }

  private dispatch(): void {
    if (this.failure || this.closed) {
      return;
    }
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.pop()!;
      const job = this.queue.shift()!;
      this.busy.set(worker, job);
      // A busy worker keeps the process alive until its result is delivered.
      worker.ref();
      worker.postMessage({
        segment: job.segment,
        level: job.level,
        dictionary: job.dictionary,
      });
    }
  }

  private onReply(worker: Worker, { output, error }: WorkerReply): void {
    const job = this.busy.get(worker);
    this.busy.delete(worker);
    worker.unref();
    if (!this.closed) {
      this.idle.push(worker);
    }
    if (job && output) {
      job.resolve(
        Buffer.from(output.buffer, output.byteOffset, output.byteLength),
      );
    } else if (job) {
      job.reject(new Error(`Compression failed: ${error ?? "unknown error"}`));
    }
    this.dispatch();
  }

  private onWorkerError(error: Error): void {
    this.failure ??= error;
    this.busy.forEach((job) => job.reject(error));
    this.busy.clear();
    this.queue.splice(0).forEach((job) => job.reject(error));
  }
}
