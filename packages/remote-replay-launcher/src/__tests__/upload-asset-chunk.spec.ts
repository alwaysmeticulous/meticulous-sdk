import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { inflateRawSync } from "zlib";
import { x as tarExtract } from "tar";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeCompressedTar } from "../upload-asset-chunk";

describe("writeCompressedTar", () => {
  let baseDir: string;
  let sourceDir: string;
  let extractDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "upload-asset-chunk-test-"));
    sourceDir = join(baseDir, "source");
    extractDir = join(baseDir, "extract");
    await mkdir(sourceDir, { recursive: true });
    await mkdir(extractDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it("follows symlinks, storing them as regular files and indexing them", async () => {
    await writeFile(join(sourceDir, "real.txt"), "Hello World");
    await symlink("real.txt", join(sourceDir, "link.txt"));

    const tarballPath = join(baseDir, "chunk.tar.d");
    const { filePaths } = await writeCompressedTar({
      cwd: sourceDir,
      destination: tarballPath,
    });

    const normalizedPaths = filePaths.map((p) => p.replace(/^\.\//, ""));
    expect(normalizedPaths).toEqual(
      expect.arrayContaining(["real.txt", "link.txt"]),
    );

    const tarPath = join(baseDir, "chunk.tar");
    await writeFile(tarPath, inflateRawSync(await readFile(tarballPath)));
    await tarExtract({ file: tarPath, cwd: extractDir });

    const extractedLinkStat = await lstat(join(extractDir, "link.txt"));
    expect(extractedLinkStat.isSymbolicLink()).toBe(false);
    expect(extractedLinkStat.isFile()).toBe(true);
    expect(await readFile(join(extractDir, "link.txt"), "utf8")).toBe(
      "Hello World",
    );
  });
});
