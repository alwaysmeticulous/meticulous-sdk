import { existsSync } from "fs";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import http from "http";
import { tmpdir } from "os";
import { join } from "path";
import { constants as zlibConstants } from "zlib";
import { DeflateRaw } from "fast-zlib";
import { create as tarCreate } from "tar";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { downloadAndExtractTar, downloadFile } from "../download-file";

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
const createRawDeflatedTar = async (
  folderPath: string,
): Promise<Buffer> => {
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

  const finalChunk = deflate.process(
    Buffer.alloc(0),
    zlibConstants.Z_FINISH,
  );
  if (finalChunk.length > 0) {
    chunks.push(finalChunk);
  }

  return Buffer.concat(chunks);
};

describe("downloadAndExtractTar", () => {
  let sourceDir: string;
  let extractDir: string;
  let tmpTarPath: string;

  beforeEach(async () => {
    const base = join(tmpdir(), `test-tar-extract-${Date.now()}`);
    sourceDir = join(base, "source");
    extractDir = join(base, "extract");
    tmpTarPath = join(base, "tmp.tar.d");
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

  it("round-trips files compressed with fast-zlib DeflateRaw", async () => {
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
      await new Promise<void>((resolve) => server.listen(1235, resolve));

      const entries = await downloadAndExtractTar(
        "http://localhost:1235",
        tmpTarPath,
        extractDir,
      );

      expect(entries.length).toBeGreaterThan(0);

      const hello = await readFile(join(extractDir, "hello.txt"), "utf8");
      expect(hello).toBe("Hello World");

      const data = await readFile(join(extractDir, "data.json"), "utf8");
      expect(data).toBe('{"key": "value"}');

      const nested = await readFile(
        join(extractDir, "subdir", "nested.txt"),
        "utf8",
      );
      expect(nested).toBe("Nested!");

      expect(existsSync(tmpTarPath)).toBe(false);
    } finally {
      server.close();
    }
  });

  it("round-trips a large file that would stress chunked decompression", async () => {
    const largeContent = "A".repeat(5 * 1024 * 1024);
    await writeFile(join(sourceDir, "large.txt"), largeContent);

    const compressed = await createRawDeflatedTar(sourceDir);

    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Length": compressed.length.toString() });
      res.end(compressed);
    });

    try {
      await new Promise<void>((resolve) => server.listen(1236, resolve));

      await downloadAndExtractTar(
        "http://localhost:1236",
        tmpTarPath,
        extractDir,
      );

      const result = await readFile(join(extractDir, "large.txt"), "utf8");
      expect(result).toBe(largeContent);
    } finally {
      server.close();
    }
  });
});
