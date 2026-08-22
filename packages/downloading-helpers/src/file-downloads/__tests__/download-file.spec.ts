import { existsSync } from "fs";
import { mkdir, readFile, rm, symlink, writeFile } from "fs/promises";
import http from "http";
import { tmpdir } from "os";
import { join } from "path";
import { constants as zlibConstants } from "zlib";
import type * as FsPromises from "fs/promises";
import { DeflateRaw } from "fast-zlib";
import { create as tarCreate } from "tar";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadFile,
  streamDownloadAndExtractTar,
  streamDownloadAndExtractTarGz,
  streamDownloadAndInflateTar,
} from "../download-file";

// Module-level toggle for the stall-on-write test below. Vitest can't spy on
// fs/promises named exports in ESM mode, so we vi.mock the module once and
// flip this flag when a test needs writeFile to hang until aborted.
const writeFileStallMode = { enabled: false };

vi.mock("fs/promises", async () => {
  const actual = await vi.importActual<typeof FsPromises>("fs/promises");
  return {
    ...actual,
    writeFile: (
      path: Parameters<typeof actual.writeFile>[0],
      data: Parameters<typeof actual.writeFile>[1],
      options?: Parameters<typeof actual.writeFile>[2],
    ) => {
      if (!writeFileStallMode.enabled) {
        return actual.writeFile(path, data, options);
      }
      const signal = (options as { signal?: AbortSignal } | undefined)?.signal;
      return new Promise<void>((_resolve, reject) => {
        const abort = (): void => {
          const reason = signal?.reason;
          reject(
            reason instanceof Error
              ? reason
              : new Error(String(reason ?? "aborted")),
          );
        };
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
      });
    },
  };
});

const listenOnEphemeralPort = (
  server: http.Server,
): Promise<{ url: string; close: () => Promise<void> }> =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address == null || typeof address === "string") {
        reject(new Error("Expected server to bind to a TCP port"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });

describe("downloadFile", () => {
  it("downloads a file from a URL", async () => {
    const server = http.createServer((_req, res) => {
      res.end("Hello World");
    });
    const { url, close } = await listenOnEphemeralPort(server);

    try {
      await downloadFile(url, "file.txt", {
        firstDataTimeoutInMs: 1000,
        downloadCompleteTimeoutInMs: 1000,
      });

      // Read file contents
      const fileContents = await readFile("file.txt", "utf8");
      expect(fileContents).toBe("Hello World");
    } finally {
      await close();
      if (existsSync("file.txt")) {
        await rm("file.txt");
      }
    }
  });

  it("times out on a too slow file download", async () => {
    const server = http.createServer((_req, res) => {
      res.write("Helloooooo");
      setTimeout(() => {
        res.end("...  ... World.");
      }, 1000);
    });
    const { url, close } = await listenOnEphemeralPort(server);

    try {
      await downloadFile(url, "file.txt", {
        firstDataTimeoutInMs: 1000,
        downloadCompleteTimeoutInMs: 1,
        maxDownloadContentRetries: 0,
        downloadContentRetryDelay: 0,
      });

      throw new Error("Expected download to time out");
    } catch (e) {
      expect((e as Error).message).toEqual("Download timed out after 1ms");
    } finally {
      await close();

      if (existsSync("file.txt")) {
        await rm("file.txt");
        // eslint-disable-next-line no-unsafe-finally
        throw new Error("Unexpected file download");
      }
    }
  });

  it("retries downloading content on file", async () => {
    // The first response stalls after its first bytes, so the content-level
    // retry is what recovers. Matching "exactly the second request" is racy:
    // downloadFile also installs axios-retry, which can consume the success
    // slot before the retry runs.
    let shouldStall = true;
    const server = http.createServer((_req, res) => {
      res.write("Hello");
      if (shouldStall) {
        shouldStall = false;
        return;
      }
      res.end(" World");
    });
    const { url, close } = await listenOnEphemeralPort(server);

    try {
      await downloadFile(url, "file.txt", {
        firstDataTimeoutInMs: 1000,
        // Generous against a tiny localhost write, still well below a stream
        // that never ends.
        downloadCompleteTimeoutInMs: 200,
        maxDownloadContentRetries: 1,
        downloadContentRetryDelay: 0,
      });

      const fileContents = await readFile("file.txt", "utf8");
      expect(fileContents).toBe("Hello World");
    } finally {
      server.closeAllConnections();
      await close();
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
  { follow = true }: { follow?: boolean } = {},
): Promise<Buffer> => {
  const deflate = new DeflateRaw({ level: 3 });
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    const tarStream = tarCreate({ cwd: folderPath, follow }, ["."]);
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

      const entries = await streamDownloadAndExtractTar(
        "http://localhost:1237",
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

    it("honors totalTimeoutInMs when writes stall after the pipeline completes", async () => {
      // Regression test: previously the AbortSignal from the total timeout was
      // only wired to the streaming `pipeline`, so `Promise.allSettled(pendingWrites)`
      // would block until every queued `writeFile` finished. On stalled EFS
      // this made the function ignore `totalTimeoutInMs`.
      const fileCount = 20;
      for (let i = 0; i < fileCount; i++) {
        await writeFile(join(sourceDir, `file-${i}.txt`), `contents ${i}`);
      }

      const compressed = await createRawDeflatedTar(sourceDir);

      const server = http.createServer((_req, res) => {
        res.writeHead(200, { "Content-Length": compressed.length.toString() });
        res.end(compressed);
      });

      writeFileStallMode.enabled = true;
      try {
        await new Promise<void>((resolve) => server.listen(1244, resolve));

        const totalTimeoutInMs = 300;
        const startedAt = Date.now();
        let caughtError: Error | null = null;

        try {
          await streamDownloadAndExtractTar(
            "http://localhost:1244",
            extractDir,
            {
              totalTimeoutInMs,
              extractConcurrency: 4,
              maxRetries: 0,
            },
          );
        } catch (err) {
          caughtError = err as Error;
        }

        const elapsed = Date.now() - startedAt;

        expect(caughtError).not.toBeNull();
        expect(caughtError!.message).toContain("timed out");
        // Should bail out promptly once the timeout fires, not wait for
        // hung writes to complete. Allow generous slack for CI jitter.
        expect(elapsed).toBeLessThan(totalTimeoutInMs + 2_000);
      } finally {
        writeFileStallMode.enabled = false;
        server.close();
      }
    }, 10_000);

    it("does not report skipped non-file entries (e.g. symlinks) in the returned entries list", async () => {
      // Regression: previously `entries.push(entry.path)` happened before the
      // type filter, so symlinks / device nodes / pax headers were reported to
      // the caller despite never being written. The serial path's contract is
      // "entries list == what's on disk", and the parallel path must match.
      await writeFile(join(sourceDir, "real.txt"), "hello");
      await symlink("real.txt", join(sourceDir, "link.txt"));

      const compressed = await createRawDeflatedTar(sourceDir, {
        follow: false,
      });

      const server = http.createServer((_req, res) => {
        res.writeHead(200, { "Content-Length": compressed.length.toString() });
        res.end(compressed);
      });

      try {
        await new Promise<void>((resolve) => server.listen(1245, resolve));

        const entries = await streamDownloadAndExtractTar(
          "http://localhost:1245",
          extractDir,
          { extractConcurrency: 4 },
        );

        expect(entries).toEqual(expect.arrayContaining(["./real.txt"]));
        expect(entries).not.toEqual(expect.arrayContaining(["./link.txt"]));
        for (const entry of entries) {
          expect(existsSync(join(extractDir, entry))).toBe(true);
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

describe("streamDownloadAndExtractTarGz", () => {
  let sourceDir: string;
  let extractDir: string;

  beforeEach(async () => {
    const base = join(tmpdir(), `test-stream-tar-gz-${Date.now()}`);
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

  /**
   * Round-trips through the same `tar.create({ gzip: true })` call the CLI
   * `meticulous project upload-source` uses to produce `source.tar.gz`. This
   * is the regression guard for the original raw-deflate path silently
   * failing on customer-uploaded archives (which carry a real gzip header).
   */
  const createGzippedTar = async (folderPath: string): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    const tarStream = tarCreate({ cwd: folderPath, gzip: true }, ["."]);
    for await (const chunk of tarStream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };

  it("extracts a gzipped tar produced by tar.create({ gzip: true })", async () => {
    await writeFile(join(sourceDir, "hello.txt"), "Hello World");
    await mkdir(join(sourceDir, "subdir"), { recursive: true });
    await writeFile(join(sourceDir, "subdir", "nested.txt"), "Nested!");

    const compressed = await createGzippedTar(sourceDir);

    const server = http.createServer((_req, res) => {
      res.writeHead(200, {
        "Content-Type": "application/gzip",
        "Content-Length": compressed.length.toString(),
      });
      res.end(compressed);
    });

    try {
      await new Promise<void>((resolve) => server.listen(1246, resolve));

      const entries = await streamDownloadAndExtractTarGz(
        "http://localhost:1246",
        extractDir,
      );

      expect(entries.length).toBeGreaterThan(0);
      expect(await readFile(join(extractDir, "hello.txt"), "utf8")).toBe(
        "Hello World",
      );
      expect(
        await readFile(join(extractDir, "subdir", "nested.txt"), "utf8"),
      ).toBe("Nested!");
    } finally {
      server.close();
    }
  });

  it("rejects a raw-deflated tar (gzip header required)", async () => {
    await writeFile(join(sourceDir, "hello.txt"), "Hello World");
    const compressed = await createRawDeflatedTar(sourceDir);

    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Length": compressed.length.toString() });
      res.end(compressed);
    });

    try {
      await new Promise<void>((resolve) => server.listen(1247, resolve));

      await expect(
        streamDownloadAndExtractTarGz("http://localhost:1247", extractDir, {
          maxRetries: 0,
        }),
      ).rejects.toThrow();
    } finally {
      server.close();
    }
  });
});

describe("streamDownloadAndInflateTar", () => {
  let sourceDir: string;
  let outputTarPath: string;

  beforeEach(async () => {
    const base = join(tmpdir(), `test-inflate-tar-${Date.now()}`);
    sourceDir = join(base, "source");
    outputTarPath = join(base, "assets.tar");
    await mkdir(sourceDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(join(sourceDir, ".."), { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("reports the wire size, inflated size and time spent decompressing", async () => {
    // Compressible enough that inflated clearly exceeds compressed, so the
    // two counters can't be silently reading the same value.
    await writeFile(join(sourceDir, "big.txt"), "A".repeat(2 * 1024 * 1024));
    const compressed = await createRawDeflatedTar(sourceDir);

    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Length": compressed.length.toString() });
      res.end(compressed);
    });
    const { url, close } = await listenOnEphemeralPort(server);

    try {
      const stats = await streamDownloadAndInflateTar(url, outputTarPath);

      expect(stats.compressedBytes).toBe(compressed.length);
      expect(stats.inflatedBytes).toBe(
        (await readFile(outputTarPath)).byteLength,
      );
      expect(stats.inflatedBytes).toBeGreaterThan(stats.compressedBytes);
      expect(stats.inflateMs).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it("counts only the successful attempt when an earlier one fails", async () => {
    // Large enough that the abandoned attempt below pushes a substantial
    // number of bytes through inflate before dying, so that counting it would
    // visibly inflate the totals.
    await writeFile(join(sourceDir, "big.txt"), "A".repeat(2 * 1024 * 1024));
    const compressed = await createRawDeflatedTar(sourceDir);

    let requestCount = 0;
    const server = http.createServer((_req, res) => {
      requestCount += 1;
      res.writeHead(200, { "Content-Length": compressed.length.toString() });
      if (requestCount === 1) {
        // Half a body, then a dead connection, so inflate really does consume
        // these bytes before the attempt fails and is retried from scratch.
        // Destroying from the write callback is what makes that true: a
        // destroy issued on the same tick as the write discards the buffer
        // and the client receives nothing.
        res.write(
          compressed.subarray(0, Math.floor(compressed.length / 2)),
          () => res.destroy(),
        );
        return;
      }
      res.end(compressed);
    });
    const { url, close } = await listenOnEphemeralPort(server);

    try {
      const stats = await streamDownloadAndInflateTar(url, outputTarPath, {
        retryDelay: 1,
      });

      expect(requestCount).toBeGreaterThan(1);
      expect(stats.compressedBytes).toBe(compressed.length);
      expect(stats.inflatedBytes).toBe(
        (await readFile(outputTarPath)).byteLength,
      );
    } finally {
      await close();
    }
  });
});
