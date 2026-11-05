import { describe, it, expect, vi } from "vitest";
import { MultipartBufferManager } from "../multipart-buffer-manager";

describe("MultipartBufferManager", () => {
  const CHUNK_SIZE = 1024;

  const createManager = (maxConcurrentUploads = 4) => {
    const uploadPart = (_buffer: Buffer, partNumber: number) => {
      return Promise.resolve(`etag-${partNumber}`);
    };

    return new MultipartBufferManager({
      uploadChunkSize: CHUNK_SIZE,
      uploadPart,
      maxConcurrentUploads,
    });
  };

  describe("addChunk", () => {
    it("should accumulate chunks in the buffer", () => {
      const manager = createManager();
      const chunk1 = Buffer.alloc(100);
      const chunk2 = Buffer.alloc(200);

      manager.addChunk(chunk1);
      expect(manager.getBufferSize()).toBe(100);

      manager.addChunk(chunk2);
      expect(manager.getBufferSize()).toBe(300);
    });
  });

  describe("flush", () => {
    it("should not upload if buffer is below chunk size and not last part", async () => {
      const manager = createManager();
      const smallChunk = Buffer.alloc(CHUNK_SIZE - 100);

      manager.addChunk(smallChunk);
      await manager.flush(false);

      expect(manager.getBufferSize()).toBe(CHUNK_SIZE - 100);
    });

    it("should clear buffer after upload if buffer reaches chunk size", async () => {
      const manager = createManager();
      const chunk = Buffer.alloc(CHUNK_SIZE);

      manager.addChunk(chunk);
      await manager.flush(false);

      expect(manager.getBufferSize()).toBe(0);
    });

    it("should clear buffer after upload if it is the last part", async () => {
      const manager = createManager();
      const smallChunk = Buffer.alloc(100);

      manager.addChunk(smallChunk);
      await manager.flush(true);

      expect(manager.getBufferSize()).toBe(0);
    });

    it("should split buffer if it exceeds chunk size", async () => {
      const manager = createManager();
      const oversizedChunk = Buffer.alloc(CHUNK_SIZE + 500);

      manager.addChunk(oversizedChunk);
      await manager.flush(false);

      expect(manager.getBufferSize()).toBe(500);
    });

    it("should combine multiple small chunks before uploading", async () => {
      const manager = createManager();
      const chunk1 = Buffer.alloc(300);
      const chunk2 = Buffer.alloc(300);
      const chunk3 = Buffer.alloc(424);

      manager.addChunk(chunk1);
      manager.addChunk(chunk2);
      manager.addChunk(chunk3);
      await manager.flush(false);

      expect(manager.getBufferSize()).toBe(0);
    });
  });

  describe("finalize", () => {
    it("should return empty array if no uploads were made", async () => {
      const manager = createManager();
      const eTags = await manager.finalize();
      expect(eTags).toEqual([]);
    });

    it("should return eTags in order of part numbers", async () => {
      const manager = createManager();
      const chunk1 = Buffer.alloc(CHUNK_SIZE);
      const chunk2 = Buffer.alloc(CHUNK_SIZE);
      const chunk3 = Buffer.alloc(CHUNK_SIZE);

      manager.addChunk(chunk1);
      await manager.flush(false);
      manager.addChunk(chunk2);
      await manager.flush(false);
      manager.addChunk(chunk3);
      await manager.flush(true);

      const eTags = await manager.finalize();
      expect(eTags).toEqual(["etag-1", "etag-2", "etag-3"]);
    });

    it("should wait for all pending uploads to complete", async () => {
      let resolveUpload1: (value: string) => void;
      let resolveUpload2: (value: string) => void;

      const promise1 = new Promise<string>((resolve) => {
        resolveUpload1 = resolve;
      });
      const promise2 = new Promise<string>((resolve) => {
        resolveUpload2 = resolve;
      });

      let callCount = 0;
      const uploadPart = async () => {
        callCount++;
        return callCount === 1 ? promise1 : promise2;
      };

      const manager = new MultipartBufferManager({
        uploadChunkSize: CHUNK_SIZE,
        uploadPart,
        maxConcurrentUploads: 4,
      });

      manager.addChunk(Buffer.alloc(CHUNK_SIZE));
      await manager.flush(false);
      manager.addChunk(Buffer.alloc(CHUNK_SIZE));
      await manager.flush(false);

      expect(manager.getPendingUploadCount()).toBe(2);

      const finalizePromise = manager.finalize();

      resolveUpload1!("etag-1");
      resolveUpload2!("etag-2");

      const eTags = await finalizePromise;
      expect(eTags).toEqual(["etag-1", "etag-2"]);
    });

    it("should sort eTags by part number even if uploads complete out of order", async () => {
      let resolveUpload1: (value: string) => void;
      let resolveUpload2: (value: string) => void;
      let resolveUpload3: (value: string) => void;

      const promise1 = new Promise<string>((resolve) => {
        resolveUpload1 = resolve;
      });
      const promise2 = new Promise<string>((resolve) => {
        resolveUpload2 = resolve;
      });
      const promise3 = new Promise<string>((resolve) => {
        resolveUpload3 = resolve;
      });

      let callCount = 0;
      const uploadPart = async () => {
        callCount++;
        if (callCount === 1) return promise1;
        if (callCount === 2) return promise2;
        return promise3;
      };

      const manager = new MultipartBufferManager({
        uploadChunkSize: CHUNK_SIZE,
        uploadPart,
        maxConcurrentUploads: 4,
      });

      manager.addChunk(Buffer.alloc(CHUNK_SIZE));
      await manager.flush(false);
      manager.addChunk(Buffer.alloc(CHUNK_SIZE));
      await manager.flush(false);
      manager.addChunk(Buffer.alloc(CHUNK_SIZE));
      await manager.flush(true);

      const finalizePromise = manager.finalize();

      resolveUpload3!("etag-3");
      resolveUpload1!("etag-1");
      resolveUpload2!("etag-2");

      const eTags = await finalizePromise;
      expect(eTags).toEqual(["etag-1", "etag-2", "etag-3"]);
    });
  });

  describe("concurrent upload limiting", () => {
    it("should respect max concurrent uploads limit", async () => {
      const MAX_CONCURRENT = 2;

      let activeUploads = 0;
      let maxActiveUploads = 0;

      const uploadPart = async (_buffer: Buffer, partNumber: number) =>
        new Promise<string>((resolve) => {
          activeUploads++;
          maxActiveUploads = Math.max(maxActiveUploads, activeUploads);
          setTimeout(() => {
            activeUploads--;
            resolve(`etag-${partNumber}`);
          }, 10);
        });

      const manager = new MultipartBufferManager({
        uploadChunkSize: CHUNK_SIZE,
        uploadPart,
        maxConcurrentUploads: MAX_CONCURRENT,
      });

      const uploads: Promise<void>[] = [];
      for (let i = 0; i < 5; i++) {
        manager.addChunk(Buffer.alloc(CHUNK_SIZE));
        uploads.push(manager.flush(false));
      }

      await Promise.all(uploads);
      await manager.finalize();

      expect(maxActiveUploads).toBeLessThanOrEqual(MAX_CONCURRENT);
    });
  });

  describe("error handling", () => {
    it("does not start queued uploads after an upload has failed", async () => {
      const uploadPart = vi.fn().mockRejectedValue(new Error("upload failed"));
      const manager = new MultipartBufferManager({
        uploadChunkSize: CHUNK_SIZE,
        maxConcurrentUploads: 1,
        uploadPart,
      });
      manager.addChunk(Buffer.alloc(CHUNK_SIZE * 4));
      await manager.flush(false);
      await expect(manager.finalize()).rejects.toThrow("upload failed");
      await vi.waitFor(() =>
        expect(manager.waitForCapacity()).rejects.toThrow("upload failed"),
      );
      expect(uploadPart).toHaveBeenCalledTimes(1);
    });
    it("should not throw during flush but propagate errors during finalize", async () => {
      const uploadError = new Error("Upload failed");
      const uploadPart = () => {
        return Promise.reject(uploadError);
      };

      const manager = new MultipartBufferManager({
        uploadChunkSize: CHUNK_SIZE,
        uploadPart,
        maxConcurrentUploads: 4,
      });

      manager.addChunk(Buffer.alloc(CHUNK_SIZE));

      await expect(manager.flush(false)).resolves.toBeUndefined();

      await expect(manager.finalize()).rejects.toThrow("Upload failed");
    });

    it("should propagate upload errors during finalize", async () => {
      const uploadError = new Error("Upload failed");

      let rejectUpload: (error: Error) => void;
      const uploadPromise = new Promise<string>((_resolve, reject) => {
        rejectUpload = reject;
      });

      const uploadPart = async () => uploadPromise;

      const manager = new MultipartBufferManager({
        uploadChunkSize: CHUNK_SIZE,
        uploadPart,
        maxConcurrentUploads: 4,
      });

      manager.addChunk(Buffer.alloc(CHUNK_SIZE));
      await manager.flush(false);

      const finalizePromise = manager.finalize();
      rejectUpload!(uploadError);

      await expect(finalizePromise).rejects.toThrow("Upload failed");
    });
  });

  describe("multiple full chunks in one flush", () => {
    it("uploads every full chunk and keeps the remainder", async () => {
      const sizes: number[] = [];
      const manager = new MultipartBufferManager({
        uploadChunkSize: CHUNK_SIZE,
        uploadPart: (buffer, partNumber) => {
          sizes.push(buffer.length);
          return Promise.resolve(`etag-${partNumber}`);
        },
        maxConcurrentUploads: 4,
      });

      manager.addChunk(Buffer.alloc(CHUNK_SIZE * 3 + 10));
      await manager.flush(false);

      expect(sizes).toEqual([CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE]);
      expect(manager.getBufferSize()).toBe(10);
    });

    it("flags only the final piece as the last part", async () => {
      const flags: boolean[] = [];
      const manager = new MultipartBufferManager({
        uploadChunkSize: CHUNK_SIZE,
        uploadPart: (_buffer, partNumber, isLastPart) => {
          flags.push(isLastPart);
          return Promise.resolve(`etag-${partNumber}`);
        },
        maxConcurrentUploads: 4,
      });

      manager.addChunk(Buffer.alloc(CHUNK_SIZE * 2 + 10));
      await manager.flush(true);

      expect(flags).toEqual([false, false, true]);
    });
  });

  describe("waitForCapacity", () => {
    it("blocks while too many parts are queued and resumes as they finish", async () => {
      const releases: Array<() => void> = [];
      const manager = new MultipartBufferManager({
        uploadChunkSize: CHUNK_SIZE,
        uploadPart: (_buffer, partNumber) =>
          new Promise<string>((resolve) => {
            releases.push(() => resolve(`etag-${partNumber}`));
          }),
        maxConcurrentUploads: 1,
      });

      // 1 concurrent upload allows 2 unsettled parts.
      manager.addChunk(Buffer.alloc(CHUNK_SIZE * 2));
      await manager.flush(false);

      let resumed = false;
      const waiting = manager.waitForCapacity().then(() => {
        resumed = true;
      });
      await new Promise((r) => setTimeout(r, 20));
      expect(resumed).toBe(false);

      releases[0]?.();
      await waiting;
      expect(resumed).toBe(true);
      releases[1]?.();
    });

    it("rejects early when an upload has failed, without an unhandled rejection", async () => {
      const manager = new MultipartBufferManager({
        uploadChunkSize: CHUNK_SIZE,
        uploadPart: () => Promise.reject(new Error("part failed")),
        maxConcurrentUploads: 2,
      });

      manager.addChunk(Buffer.alloc(CHUNK_SIZE));
      await manager.flush(false);
      await new Promise((r) => setTimeout(r, 10));

      await expect(manager.waitForCapacity()).rejects.toThrow("part failed");
      await expect(manager.finalize()).rejects.toThrow("part failed");
    });
  });

  describe("variable part sizes and part limit", () => {
    it("cuts each part at the size for its part number", async () => {
      const sizes: number[] = [];
      const manager = new MultipartBufferManager({
        uploadChunkSize: CHUNK_SIZE,
        getPartSize: (partNumber) => 100 * partNumber,
        uploadPart: (buffer, partNumber) => {
          sizes.push(buffer.length);
          return Promise.resolve(`etag-${partNumber}`);
        },
        maxConcurrentUploads: 4,
      });

      manager.addChunk(Buffer.alloc(100 + 200 + 300 + 50));
      await manager.flush(false);

      expect(sizes).toEqual([100, 200, 300]);
      expect(manager.getNextPartSize()).toBe(400);
      expect(manager.getBufferSize()).toBe(50);
    });

    it("throws a clear error instead of cutting a part past maxParts", () => {
      const manager = new MultipartBufferManager({
        uploadChunkSize: 10,
        maxParts: 3,
        uploadPart: (_buffer, partNumber) =>
          Promise.resolve(`etag-${partNumber}`),
        maxConcurrentUploads: 4,
      });

      manager.addChunk(Buffer.alloc(45));

      expect(() => manager.flush(false)).toThrow(/more than 3 parts/);
    });

    it("also rejects a final partial part that would be part maxParts + 1", () => {
      const manager = new MultipartBufferManager({
        uploadChunkSize: 10,
        maxParts: 3,
        uploadPart: (_buffer, partNumber) =>
          Promise.resolve(`etag-${partNumber}`),
        maxConcurrentUploads: 4,
      });

      manager.addChunk(Buffer.alloc(31));

      expect(() => manager.flush(true)).toThrow(/more than 3 parts/);
    });

    it("accepts exactly maxParts parts", async () => {
      const manager = new MultipartBufferManager({
        uploadChunkSize: 10,
        maxParts: 3,
        uploadPart: (_buffer, partNumber) =>
          Promise.resolve(`etag-${partNumber}`),
        maxConcurrentUploads: 4,
      });

      manager.addChunk(Buffer.alloc(25));
      await manager.flush(true);

      expect(await manager.finalize()).toHaveLength(3);
    });
  });
});
