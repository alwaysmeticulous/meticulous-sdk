import { mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  MultipartZipUploader,
  MultipartZipUploaderArgs,
} from "../multipart-zip-uploader";

vi.mock("@alwaysmeticulous/client", async () => {
  const actual = await vi.importActual("@alwaysmeticulous/client");
  return {
    ...actual,
    requestUploadPart: vi
      .fn()
      .mockResolvedValue({ uploadPartUrl: "https://example.com/extra-part" }),
  };
});

describe("MultipartZipUploader", () => {
  let testDir: string;
  const uploadedParts: Array<{ url: string; size: number }> = [];

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-multipart-zip-${Date.now()}`);
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
    overrides: Partial<MultipartZipUploaderArgs> = {},
  ): MultipartZipUploader => {
    const args: MultipartZipUploaderArgs = {
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
      uploadBufferToSignedUrl: async (url: string, buffer: Buffer) => {
        uploadedParts.push({ url, size: buffer.length });
        return `etag-${uploadedParts.length}`;
      },
      ...overrides,
    };
    return new MultipartZipUploader(args);
  };

  it("should create an instance with valid args", () => {
    const uploader = createUploader();
    expect(uploader).toBeInstanceOf(MultipartZipUploader);
  });

  it("should zip and upload a single file", async () => {
    await writeFile(join(testDir, "test.txt"), "Hello World");

    const uploader = createUploader();
    const result = await uploader.execute();

    expect(result.awsUploadId).toBe("upload-123");
    expect(result.eTags.length).toBeGreaterThan(0);
    expect(uploadedParts.length).toBeGreaterThan(0);
  });

  it("should zip and upload multiple files", async () => {
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
});
