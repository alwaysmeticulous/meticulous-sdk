import { existsSync } from "fs";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import http from "http";
import { tmpdir } from "os";
import { join } from "path";
import { constants as zlibConstants } from "zlib";
import { DeflateRaw } from "fast-zlib";
import { create as tarCreate } from "tar";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { downloadFile, streamDownloadAndExtractTar } from "../download-file";

describe("downloadFile", () => {
  it("downloads a file from a URL", async () => {
    const server = http.createServer((req, res) => {
      res.end("Hello World");
    });

    try {
      server.listen(1234);

      await downloadFile("http://localhost:1234", "file.txt", {
        firstDataTimeoutInMs: 1000,
        downloadCompleteTimeoutInMs: 1000,
      });

      // Read file contents
      const fileContents = await readFile("file.txt", "utf8");
      expect(fileContents).toBe("Hello World");
    } finally {
      server.close();
      if (existsSync("file.txt")) {
        await rm("file.txt");
      }
    }
  });

  it("times out on a too slow file download", async () => {
    const server = http.createServer((req, res) => {
      res.write("Helloooooo");
      setTimeout(() => {
        res.end("...  ... World.");
      }, 1000);
    });

    try {
      server.listen(1234);

      await downloadFile("http://localhost:1234", "file.txt", {
        firstDataTimeoutInMs: 1000,
        downloadCompleteTimeoutInMs: 1,
        maxDownloadContentRetries: 0,
        downloadContentRetryDelay: 0,
      });

      throw new Error("Expected download to time out");
    } catch (e) {
      expect((e as Error).message).toEqual("Download timed out after 1ms");
    } finally {
      server.close();

      if (existsSync("file.txt")) {
        await rm("file.txt");
        // eslint-disable-next-line no-unsafe-finally
        throw new Error("Unexpected file download");
      }
    }
  });

  it("retries downloading content on file", async () => {
    let attempt = 0;
    const server = http.createServer((req, res) => {
      res.write("Hello");
      if (attempt === 1) {
        res.end(" World");
      }

      attempt++;
      setTimeout(() => {
        res.end("...  ... World.");
      }, 1000);
    });

    try {
      server.listen(1234);

      await downloadFile("http://localhost:1234", "file.txt", {
        firstDataTimeoutInMs: 1000,
        downloadCompleteTimeoutInMs: 20,
        maxDownloadContentRetries: 1,
        downloadContentRetryDelay: 0,
      });

      // Read file contents
      const fileContents = await readFile("file.txt", "utf8");
      expect(fileContents).toBe("Hello World");
    } finally {
      server.close();
      if (existsSync("file.txt")) {
        await rm("file.txt");
      }
    }
  });
});

/**
 * Compresses a directory into a raw-deflated tar blob, matching the format
 * produced by MultipartCompressingUploader in production.
 */
const createRawDeflatedTar = async (folderPath: string): Promise<Buffer> => {
  const deflate = new DeflateRaw({ level: 3 });
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    const tarStream = tarCreate({ cwd: folderPath, follow: true }, ["."]);
    tarStream.on("data", (chunk: Buffer) => {
      const compressed = deflate.process(chunk);
      if (compressed.length > 0) {
        chunks.push(compressed);
      }
    });
    tarStream.on("end", resolve);
    tarStream.on("error", reject);
  });

  const finalChunk = deflate.process(Buffer.alloc(0), zlibConstants.Z_FINISH);
  if (finalChunk.length > 0) {
    chunks.push(finalChunk);
  }

  return Buffer.concat(chunks);
};

describe("streamDownloadAndExtractTar", () => {
  let sourceDir: string;
  let extractDir: string;

  beforeEach(async () => {
    const base = join(tmpdir(), `test-stream-tar-${Date.now()}`);
    sourceDir = join(base, "source");
    extractDir = join(base, "extract");
    await mkdir(sourceDir, { recursive: true });
  });

  afterEach(async () => {
    const base = join(sourceDir, "..");
    try {
      await rm(base, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("streams and extracts files without a temp file", async () => {
    await writeFile(join(sourceDir, "hello.txt"), "Hello World");
    await writeFile(join(sourceDir, "data.json"), '{"key": "value"}');
    await mkdir(join(sourceDir, "subdir"), { recursive: true });
    await writeFile(join(sourceDir, "subdir", "nested.txt"), "Nested!");

    const compressed = await createRawDeflatedTar(sourceDir);

    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Length": compressed.length.toString() });
      res.end(compressed);
    });

    try {
      await new Promise<void>((resolve) => server.listen(1237, resolve));

      const entries = await streamDownloadAndExtractTar("http://localhost:1237", extractDir);

      expect(entries.length).toBeGreaterThan(0);

      const hello = await readFile(join(extractDir, "hello.txt"), "utf8");
      expect(hello).toBe("Hello World");

      const data = await readFile(join(extractDir, "data.json"), "utf8");
      expect(data).toBe('{"key": "value"}');

      const nested = await readFile(join(extractDir, "subdir", "nested.txt"), "utf8");
      expect(nested).toBe("Nested!");
    } finally {
      server.close();
    }
  });

  it("streams and extracts a large file", async () => {
    const largeContent = "A".repeat(5 * 1024 * 1024);
    await writeFile(join(sourceDir, "large.txt"), largeContent);

    const compressed = await createRawDeflatedTar(sourceDir);

    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Length": compressed.length.toString() });
      res.end(compressed);
    });

    try {
      await new Promise<void>((resolve) => server.listen(1238, resolve));

      await streamDownloadAndExtractTar("http://localhost:1238", extractDir);

      const result = await readFile(join(extractDir, "large.txt"), "utf8");
      expect(result).toBe(largeContent);
    } finally {
      server.close();
    }
  });

  it("times out on a stalled download", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
    });

    await new Promise<void>((resolve) => server.listen(1239, resolve));

    let caughtError: Error | null = null;
    try {
      await streamDownloadAndExtractTar("http://localhost:1239", extractDir, {
        totalTimeoutInMs: 100,
        maxRetries: 0,
      });
    } catch (err) {
      caughtError = err as Error;
    } finally {
      server.closeAllConnections();
      server.close();
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toContain("timed out");
  }, 15_000);

  it("preserves the underlying error when retries are exhausted (not generic AbortError)", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("internal server error");
    });

    await new Promise<void>((resolve) => server.listen(1240, resolve));

    let caughtError: Error | null = null;
    try {
      await streamDownloadAndExtractTar("http://localhost:1240", extractDir, {
        maxRetries: 0,
      });
    } catch (err) {
      caughtError = err as Error;
    } finally {
      server.close();
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError!.name).not.toBe("AbortError");
    expect(caughtError!.message).toMatch(/500/);
  });

  describe("with extractConcurrency > 1 (parallel writes)", () => {
    it("extracts a nested tree identically to the serial path", async () => {
      await writeFile(join(sourceDir, "hello.txt"), "Hello World");
      await writeFile(join(sourceDir, "data.json"), '{"key": "value"}');
      await mkdir(join(sourceDir, "subdir"), { recursive: true });
      await writeFile(join(sourceDir, "subdir", "nested.txt"), "Nested!");
      await mkdir(join(sourceDir, "deep", "nested", "tree"), {
        recursive: true,
      });
      await writeFile(
        join(sourceDir, "deep", "nested", "tree", "leaf.txt"),
        "leaf",
      );

      const compressed = await createRawDeflatedTar(sourceDir);

      const server = http.createServer((_req, res) => {
        res.writeHead(200, { "Content-Length": compressed.length.toString() });
        res.end(compressed);
      });

      try {
        await new Promise<void>((resolve) => server.listen(1241, resolve));

        const entries = await streamDownloadAndExtractTar(
          "http://localhost:1241",
          extractDir,
          { extractConcurrency: 8 },
        );

        expect(entries.length).toBeGreaterThan(0);

        expect(await readFile(join(extractDir, "hello.txt"), "utf8")).toBe(
          "Hello World",
        );
        expect(await readFile(join(extractDir, "data.json"), "utf8")).toBe(
          '{"key": "value"}',
        );
        expect(
          await readFile(join(extractDir, "subdir", "nested.txt"), "utf8"),
        ).toBe("Nested!");
        expect(
          await readFile(
            join(extractDir, "deep", "nested", "tree", "leaf.txt"),
            "utf8",
          ),
        ).toBe("leaf");
      } finally {
        server.close();
      }
    });

    it("handles many small files (shake out the concurrency path)", async () => {
      const fileCount = 200;
      for (let i = 0; i < fileCount; i++) {
        await writeFile(join(sourceDir, `file-${i}.txt`), `contents ${i}`);
      }

      const compressed = await createRawDeflatedTar(sourceDir);

      const server = http.createServer((_req, res) => {
        res.writeHead(200, { "Content-Length": compressed.length.toString() });
        res.end(compressed);
      });

      try {
        await new Promise<void>((resolve) => server.listen(1242, resolve));

        await streamDownloadAndExtractTar("http://localhost:1242", extractDir, {
          extractConcurrency: 32,
        });

        // Spot-check a handful of files; the real assertion is that all
        // writes completed without throwing and nothing got lost.
        for (const i of [0, 1, 42, 99, fileCount - 1]) {
          expect(
            await readFile(join(extractDir, `file-${i}.txt`), "utf8"),
          ).toBe(`contents ${i}`);
        }
      } finally {
        server.close();
      }
    });

    it("extracts a large file correctly under parallel mode", async () => {
      const largeContent = "B".repeat(5 * 1024 * 1024);
      await writeFile(join(sourceDir, "large.bin"), largeContent);
      await writeFile(join(sourceDir, "tiny.txt"), "tiny");

      const compressed = await createRawDeflatedTar(sourceDir);

      const server = http.createServer((_req, res) => {
        res.writeHead(200, { "Content-Length": compressed.length.toString() });
        res.end(compressed);
      });

      try {
        await new Promise<void>((resolve) => server.listen(1243, resolve));

        await streamDownloadAndExtractTar("http://localhost:1243", extractDir, {
          extractConcurrency: 4,
        });

        expect(await readFile(join(extractDir, "large.bin"), "utf8")).toBe(
          largeContent,
        );
        expect(await readFile(join(extractDir, "tiny.txt"), "utf8")).toBe(
          "tiny",
        );
      } finally {
        server.close();
      }
    });
  });
});
