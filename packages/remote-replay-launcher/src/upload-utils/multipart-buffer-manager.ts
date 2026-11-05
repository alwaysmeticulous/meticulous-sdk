import pLimit from "p-limit";

export interface BufferManagerOptions {
  uploadChunkSize: number;
  /** Overrides `uploadChunkSize` with a size that depends on the part number. */
  getPartSize?: ((partNumber: number) => number) | undefined;
  /** Cutting a part numbered above this fails with a clear error. */
  maxParts?: number | undefined;
  uploadPart: (
    buffer: Buffer,
    partNumber: number,
    isLastPart: boolean,
  ) => Promise<string>;
  maxConcurrentUploads: number;
}

/** Bounds memory held by parts that are queued or in flight. */
const MAX_UNSETTLED_BYTES = 512 * 1024 * 1024;

interface PendingUpload {
  partNumber: number;
  eTag: string;
}

/**
 * Manages buffering and flushing of data chunks for multipart uploads.
 * Accumulates data in a buffer and uploads it in chunks of the specified size.
 *
 * Uploads run concurrently (bounded by `maxConcurrentUploads`). Callers that
 * produce data faster than it can be uploaded should `await
 * waitForCapacity()` between flushes so that finished-but-unsent parts don't
 * pile up in memory.
 */
export class MultipartBufferManager {
  private currentBuffer: Buffer[] = [];
  private currentBufferSize = 0;
  private currentPartNumber = 1;
  private pendingUploads: Promise<PendingUpload>[] = [];
  private unsettledUploads = 0;
  private unsettledBytes = 0;
  private firstError: unknown = undefined;
  private capacityWaiters: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  private readonly uploadLimiter: ReturnType<typeof pLimit>;
  private readonly getPartSize: (partNumber: number) => number;
  private readonly maxParts: number;
  private readonly maxUnsettledUploads: number;
  private readonly uploadPart: BufferManagerOptions["uploadPart"];

  constructor(options: BufferManagerOptions) {
    this.getPartSize =
      options.getPartSize ?? ((): number => options.uploadChunkSize);
    this.maxParts = options.maxParts ?? Number.POSITIVE_INFINITY;
    this.uploadPart = options.uploadPart;
    this.uploadLimiter = pLimit(options.maxConcurrentUploads);
    // Allow a full second wave of parts to be buffered while the first is on
    // the wire, so a part finishing never leaves an upload slot idle.
    this.maxUnsettledUploads = options.maxConcurrentUploads * 2;
  }

  /**
   * Adds a chunk of data to the buffer. If the buffer size exceeds the chunk size,
   * it will be flushed automatically.
   */
  public addChunk(chunk: Buffer): void {
    this.currentBuffer.push(chunk);
    this.currentBufferSize += chunk.length;
  }

  /** Size the part currently being accumulated will be cut at. */
  public getNextPartSize(): number {
    return this.getPartSize(this.currentPartNumber);
  }

  /**
   * Returns the current size of the accumulated buffer.
   */
  public getBufferSize(): number {
    return this.currentBufferSize;
  }

  /**
   * Flushes the current buffer to upload. Every full chunk in the buffer is
   * uploaded, and any remainder is kept for the next flush (unless this is the
   * last part, in which case the remainder is uploaded as the final part).
   *
   * @param isLastPart - Whether this is the last part to be uploaded
   */
  public flush(isLastPart: boolean): Promise<void> {
    if (this.currentBuffer.length === 0) {
      return Promise.resolve();
    }

    const combinedBuffer = Buffer.concat(this.currentBuffer);

    if (!isLastPart && combinedBuffer.length < this.getNextPartSize()) {
      return Promise.resolve();
    }

    let offset = 0;
    while (offset < combinedBuffer.length) {
      const remaining = combinedBuffer.length - offset;
      const partSize = this.getNextPartSize();
      if (!isLastPart && remaining < partSize) {
        break;
      }
      const length = Math.min(remaining, partSize);
      this.startUpload(
        combinedBuffer.subarray(offset, offset + length),
        isLastPart && offset + length >= combinedBuffer.length,
      );
      offset += length;
    }

    if (offset < combinedBuffer.length) {
      this.currentBuffer = [combinedBuffer.subarray(offset)];
      this.currentBufferSize = combinedBuffer.length - offset;
    } else {
      this.currentBuffer = [];
      this.currentBufferSize = 0;
    }

    return Promise.resolve();
  }

  /**
   * Resolves once fewer than `2 * maxConcurrentUploads` parts are queued or
   * in flight. Rejects as soon as any part upload has failed, so a producer
   * can stop work early instead of discovering the failure at `finalize`.
   */
  public waitForCapacity(): Promise<void> {
    if (this.firstError !== undefined) {
      return Promise.reject(asError(this.firstError));
    }
    if (this.hasCapacity()) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      this.capacityWaiters.push({ resolve, reject });
    });
  }

  /**
   * Waits for all pending uploads to complete and returns the ETags in order
   * of part number.
   */
  public async finalize(): Promise<string[]> {
    const results = await Promise.all(this.pendingUploads);
    results.sort((a, b) => a.partNumber - b.partNumber);
    return results.map((r) => r.eTag);
  }

  /**
   * Returns the number of pending uploads that haven't completed yet.
   */
  public getPendingUploadCount(): number {
    return this.pendingUploads.length;
  }

  private startUpload(buffer: Buffer, isLastPart: boolean): void {
    const partNumber = this.currentPartNumber++;
    if (partNumber > this.maxParts) {
      throw new Error(
        `The compressed build is too large to upload: it needs more than ${this.maxParts} parts, which is the most a single upload supports.`,
      );
    }
    this.unsettledUploads++;
    this.unsettledBytes += buffer.length;
    const uploadPromise = this.uploadLimiter(async () => {
      if (this.firstError !== undefined) {
        throw asError(this.firstError);
      }
      try {
        return await this.uploadPart(buffer, partNumber, isLastPart);
      } catch (error) {
        // Set this before releasing the limiter's slot to the next upload.
        this.firstError ??= asError(error);
        throw error;
      }
    }).then(
      (eTag) => {
        this.onUploadSettled(buffer.length, undefined);
        return { partNumber, eTag };
      },
      (error: unknown) => {
        this.onUploadSettled(buffer.length, { error });
        throw error;
      },
    );
    // Failures are surfaced through `waitForCapacity` and `finalize`; this
    // stops an early failure being reported as an unhandled rejection.
    uploadPromise.catch(() => undefined);
    this.pendingUploads.push(uploadPromise);
  }

  private hasCapacity(): boolean {
    return (
      this.unsettledUploads < this.maxUnsettledUploads &&
      this.unsettledBytes < MAX_UNSETTLED_BYTES
    );
  }

  private onUploadSettled(
    bytes: number,
    failure: { error: unknown } | undefined,
  ): void {
    this.unsettledUploads--;
    this.unsettledBytes -= bytes;
    if (failure && this.firstError === undefined) {
      this.firstError = failure.error;
    }
    const waiters = this.capacityWaiters;
    if (this.firstError !== undefined) {
      this.capacityWaiters = [];
      waiters.forEach((w) => w.reject(asError(this.firstError)));
    } else if (this.hasCapacity()) {
      this.capacityWaiters = [];
      waiters.forEach((w) => w.resolve());
    }
  }
}

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));
