import { randomBytes } from "crypto";
import { mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { PassThrough, Readable } from "stream";
import { inflateRawSync } from "zlib";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { MultipartCompressingUploaderArgs } from "../multipart-compressing-uploader";
import { MultipartCompressingUploader } from "../multipart-compressing-uploader";
import { requestUploadPart } from "@alwaysmeticulous/client";

vi.mock("@alwaysmeticulous/client", async () => {
  const actual = await vi.importActual("@alwaysmeticulous/client");
  return {
    ...actual,
    requestUploadPart: vi
      .fn()
      .mockResolvedValue({ uploadPartUrl: "https://example.com/extra-part" }),
  };
});

describe("MultipartCompressingUploader", () => {
  let testDir: string;
  const uploadedParts: Array<{ url: string; size: number }> = [];

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-multipart-compressing-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    uploadedParts.length = 0;
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const createUploader = (
    overrides: Partial<MultipartCompressingUploaderArgs> = {},
  ): MultipartCompressingUploader => {
    const args: MultipartCompressingUploaderArgs = {
      folderPath: testDir,
      uploadPartUrls: [
        "https://example.com/part1",
        "https://example.com/part2",
        "https://example.com/part3",
      ],
      uploadChunkSize: 10 * 1024 * 1024, // 10MB
      awsUploadId: "upload-123",
      uploadId: "id-123",
      client: {} as any,
      uploadBufferToSignedUrl: (url: string, buffer: Buffer) => {
        uploadedParts.push({ url, size: buffer.length });
        return Promise.resolve(`etag-${uploadedParts.length}`);
      },
      ...overrides,
    };
    return new MultipartCompressingUploader(args);
  };

  it("should create an instance with valid args", () => {
    const uploader = createUploader();
    expect(uploader).toBeInstanceOf(MultipartCompressingUploader);
  });

  it("should compress and upload a single file", async () => {
    await writeFile(join(testDir, "test.txt"), "Hello World");

    const uploader = createUploader();
    const result = await uploader.execute();

    expect(result.awsUploadId).toBe("upload-123");
    expect(result.eTags.length).toBeGreaterThan(0);
    expect(uploadedParts.length).toBeGreaterThan(0);
  });

  it("should compress and upload multiple files", async () => {
    await writeFile(join(testDir, "file1.txt"), "Content 1");
    await writeFile(join(testDir, "file2.txt"), "Content 2");
    await writeFile(join(testDir, "file3.txt"), "Content 3");

    const uploader = createUploader();
    const result = await uploader.execute();

    expect(result.awsUploadId).toBe("upload-123");
    expect(uploadedParts.length).toBeGreaterThan(0);
  });

  it("should handle nested directories", async () => {
    await mkdir(join(testDir, "subdir"), { recursive: true });
    await writeFile(join(testDir, "root.txt"), "Root content");
    await writeFile(join(testDir, "subdir", "nested.txt"), "Nested content");

    const uploader = createUploader();
    const result = await uploader.execute();

    expect(result.awsUploadId).toBe("upload-123");
    expect(result.eTags.length).toBeGreaterThan(0);
  });

  it("should handle empty directory", async () => {
    const uploader = createUploader();
    const result = await uploader.execute();

    expect(result.awsUploadId).toBe("upload-123");
    expect(result.eTags).toBeDefined();
  });

  it("rejects when the input closes before reaching its end", async () => {
    const tarStream = new PassThrough();
    const uploader = createUploader({ folderPath: undefined, tarStream });
    const execution = uploader.execute();
    tarStream.destroy();
    await expect(execution).rejects.toThrow("closed before");
  });

  it("finishes processing a large final input chunk before finalizing compression", async () => {
    const input = randomBytes(33 * 1024 * 1024);
    const parts: Buffer[] = [];
    const uploader = createUploader({
      folderPath: undefined,
      tarStream: Readable.from([input]),
      uploadBufferToSignedUrl: (_url, buffer) => {
        parts.push(buffer);
        return Promise.resolve(`etag-${parts.length}`);
      },
    });
    await uploader.execute();
    expect(inflateRawSync(Buffer.concat(parts)).equals(input)).toBe(true);
  });

  describe("part sizing and concurrency", () => {
    const writeIncompressibleFiles = async (count: number, bytes: number) => {
      for (let i = 0; i < count; i++) {
        await writeFile(join(testDir, `blob-${i}.bin`), randomBytes(bytes));
      }
    };

    it("splits into smaller parts than the server's chunk size and requests a URL for each", async () => {
      vi.mocked(requestUploadPart).mockClear();
      await writeIncompressibleFiles(5, 3 * 1024 * 1024);
      const parts: Buffer[] = [];

      const uploader = createUploader({
        uploadChunkSize: 50 * 1024 * 1024,
        uploadPartUrls: ["https://example.com/presigned-for-50mb"],
        uploadBufferToSignedUrl: (_url, buffer) => {
          parts.push(buffer);
          return Promise.resolve(`etag-${parts.length}`);
        },
      });
      const result = await uploader.execute();

      // ~15MB of incompressible data: with 8MiB parts that is 2 parts, where
      // a 50MiB part size would have produced one.
      expect(result.eTags.length).toBe(2);
      expect(requestUploadPart).toHaveBeenCalledTimes(2);
      expect(
        vi
          .mocked(requestUploadPart)
          .mock.calls.map(([args]) => args.partNumber)
          .sort(),
      ).toEqual([1, 2]);
    });

    it("produces parts that inflate to the original tar stream", async () => {
      await writeIncompressibleFiles(4, 1024 * 1024);
      await writeFile(join(testDir, "a.txt"), "hello ".repeat(10_000));
      const parts: Array<{ url: string; buffer: Buffer }> = [];

      const uploader = createUploader({
        uploadChunkSize: 5 * 1024 * 1024,
        uploadPartUrls: Array.from(
          { length: 10 },
          (_, i) => `https://example.com/p${i + 1}`,
        ),
        uploadBufferToSignedUrl: (url, buffer) => {
          parts.push({ url, buffer });
          return Promise.resolve(`etag-${url}`);
        },
      });
      const { eTags } = await uploader.execute();

      const byPartNumber = new Map(
        parts.map(({ url, buffer }) => [`etag-${url}`, buffer]),
      );
      const tar = inflateRawSync(
        Buffer.concat(eTags.map((eTag) => byPartNumber.get(eTag)!)),
      );
      expect(tar.includes("hello hello hello")).toBe(true);
      expect(tar.length).toBeGreaterThan(4 * 1024 * 1024);
    });

    it("uses the pre-signed URL that matches each full-size part's number", async () => {
      await writeIncompressibleFiles(8, 2 * 1024 * 1024);
      const urlByPart: string[] = [];

      const uploader = createUploader({
        uploadChunkSize: 5 * 1024 * 1024,
        uploadPartUrls: [
          "https://example.com/signed-1",
          "https://example.com/signed-2",
          "https://example.com/signed-3",
        ],
        uploadBufferToSignedUrl: (url) => {
          urlByPart.push(url);
          return Promise.resolve(`etag-${urlByPart.length}`);
        },
      });
      await uploader.execute();

      expect(urlByPart.slice(0, 3).sort()).toEqual([
        "https://example.com/signed-1",
        "https://example.com/signed-2",
        "https://example.com/signed-3",
      ]);
    });

    it("uploads parts concurrently up to the configured limit", async () => {
      await writeIncompressibleFiles(8, 2 * 1024 * 1024);
      let active = 0;
      let maxActive = 0;

      const uploader = createUploader({
        uploadChunkSize: 5 * 1024 * 1024,
        maxConcurrentUploads: 3,
        uploadPartUrls: [],
        uploadBufferToSignedUrl: async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 20));
          active--;
          return "etag";
        },
      });
      await uploader.execute();

      expect(maxActive).toBeGreaterThan(1);
      expect(maxActive).toBeLessThanOrEqual(3);
    });

    it("fails promptly when a part upload fails", async () => {
      await writeIncompressibleFiles(8, 2 * 1024 * 1024);

      const uploader = createUploader({
        uploadChunkSize: 5 * 1024 * 1024,
        uploadPartUrls: [],
        uploadBufferToSignedUrl: () => Promise.reject(new Error("S3 down")),
      });

      await expect(uploader.execute()).rejects.toThrow("S3 down");
    });
  });
});
