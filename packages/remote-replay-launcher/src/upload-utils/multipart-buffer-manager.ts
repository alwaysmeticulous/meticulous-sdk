import pLimit from "p-limit";

export interface BufferManagerOptions {
  uploadChunkSize: number;
  uploadPart: (
    buffer: Buffer,
    partNumber: number,
    isLastPart: boolean,
  ) => Promise<string>;
  maxConcurrentUploads: number;
}

interface PendingUpload {
  partNumber: number;
  eTag: string;
}

/**
 * Manages buffering and flushing of data chunks for multipart uploads.
 * Accumulates data in a buffer and uploads it in chunks of the specified size.
 */
export class MultipartBufferManager {
  private currentBuffer: Buffer[] = [];
  private currentBufferSize = 0;
  private currentPartNumber = 1;
  private pendingUploads: Promise<PendingUpload>[] = [];
  private readonly uploadLimiter: ReturnType<typeof pLimit>;
  private readonly uploadChunkSize: number;
  private readonly uploadPart: BufferManagerOptions["uploadPart"];

  constructor(options: BufferManagerOptions) {
    this.uploadChunkSize = options.uploadChunkSize;
    this.uploadPart = options.uploadPart;
    this.uploadLimiter = pLimit(options.maxConcurrentUploads);
  }

  /**
   * Adds a chunk of data to the buffer. If the buffer size exceeds the chunk size,
   * it will be flushed automatically.
   */
  public addChunk(chunk: Buffer): void {
    this.currentBuffer.push(chunk);
    this.currentBufferSize += chunk.length;
  }

  /**
   * Returns the current size of the accumulated buffer.
   */
  public getBufferSize(): number {
    return this.currentBufferSize;
  }

  /**
   * Flushes the current buffer to upload. Handles splitting the buffer if it exceeds
   * the chunk size, and keeps any remainder for the next flush.
   *
   * @param isLastPart - Whether this is the last part to be uploaded
   */
  public async flush(isLastPart: boolean): Promise<void> {
    if (this.currentBuffer.length === 0) {
      return;
    }

    const combinedBuffer = Buffer.concat(this.currentBuffer);

    if (!isLastPart && combinedBuffer.length < this.uploadChunkSize) {
      return;
    }

    let bufferToUpload: Buffer;
    let remainingBuffer: Buffer | null = null;

    if (!isLastPart && combinedBuffer.length > this.uploadChunkSize) {
      bufferToUpload = combinedBuffer.subarray(0, this.uploadChunkSize);
      remainingBuffer = combinedBuffer.subarray(this.uploadChunkSize);
    } else {
      bufferToUpload = combinedBuffer;
    }

    const partNumber = this.currentPartNumber++;
    const uploadPromise = this.uploadLimiter(() =>
      this.uploadPart(bufferToUpload, partNumber, isLastPart),
    ).then((eTag) => ({ partNumber, eTag }));
    this.pendingUploads.push(uploadPromise);

    if (remainingBuffer) {
      this.currentBuffer = [remainingBuffer];
      this.currentBufferSize = remainingBuffer.length;
    } else {
      this.currentBuffer = [];
      this.currentBufferSize = 0;
    }
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
}
