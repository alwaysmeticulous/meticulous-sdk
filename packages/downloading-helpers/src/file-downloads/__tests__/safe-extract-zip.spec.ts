import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { safeExtractZip } from "../safe-extract-zip";
import { assertInside } from "../safe-extract-zip.utils";

const SYMLINK_MODE = 0o120777;

describe("safeExtractZip", () => {
  let workDir: string;
  let zipPath: string;
  let outDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "safe-extract-zip-"));
    zipPath = join(workDir, "archive.zip");
    outDir = join(workDir, "out");
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  const writeZip = async (populate: (zip: JSZip) => void): Promise<void> => {
    const zip = new JSZip();
    populate(zip);
    await writeFile(
      zipPath,
      await zip.generateAsync({ type: "nodebuffer", platform: "UNIX" }),
    );
  };

  it("extracts files and nested directories and reports each written entry", async () => {
    await writeZip((zip) => {
      zip.file("top.txt", "top");
      zip.file("nested/deep/leaf.json", '{"ok":true}');
      zip.folder("empty");
    });
    const seen: string[] = [];

    await safeExtractZip(zipPath, {
      dir: outDir,
      onEntry: (entry) => seen.push(entry.fileName),
    });

    expect(await readFile(join(outDir, "top.txt"), "utf8")).toBe("top");
    expect(await readFile(join(outDir, "nested/deep/leaf.json"), "utf8")).toBe(
      '{"ok":true}',
    );
    expect((await lstat(join(outDir, "empty"))).isDirectory()).toBe(true);
    expect(seen).toContain("top.txt");
    expect(seen).toContain("nested/deep/leaf.json");
  });

  it("skips symlink entries so a later entry cannot write through them", async () => {
    const outsideDir = join(workDir, "outside");
    await writeZip((zip) => {
      zip.file("link", "../outside", { unixPermissions: SYMLINK_MODE });
      zip.file("link/pwned.txt", "escaped");
    });
    const seen: string[] = [];

    await safeExtractZip(zipPath, {
      dir: outDir,
      onEntry: (entry) => seen.push(entry.fileName),
    });

    expect((await lstat(join(outDir, "link"))).isSymbolicLink()).toBe(false);
    expect(await readFile(join(outDir, "link/pwned.txt"), "utf8")).toBe(
      "escaped",
    );
    await expect(lstat(outsideDir)).rejects.toMatchObject({ code: "ENOENT" });
    expect(seen).not.toContain("link");
    expect(seen).toContain("link/pwned.txt");
  });

  // yauzl validates entry names itself, so this never reaches our own
  // containment check — see the `assertInside` unit tests below, which cover
  // that layer directly.
  it("rejects entries that resolve outside the target directory", async () => {
    await writeZip((zip) => {
      zip.file("../escaped.txt", "nope");
    });

    await expect(safeExtractZip(zipPath, { dir: outDir })).rejects.toThrow(
      /invalid relative path: \.\.\//,
    );
    await expect(lstat(join(workDir, "escaped.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a relative target directory", async () => {
    await writeZip((zip) => zip.file("a.txt", "a"));

    await expect(
      safeExtractZip(zipPath, { dir: "relative/out" }),
    ).rejects.toThrow(/absolute/);
  });

  describe("with a symlink to outside planted inside the target", () => {
    let outsideDir: string;

    beforeEach(async () => {
      outsideDir = join(workDir, "outside");
      await mkdir(outsideDir, { recursive: true });
      await mkdir(outDir, { recursive: true });
      await symlink(outsideDir, join(outDir, "planted"));
    });

    it("does not follow it for a file directly under it", async () => {
      await writeZip((zip) => zip.file("planted/pwned.txt", "escaped"));

      await expect(safeExtractZip(zipPath, { dir: outDir })).rejects.toThrow(
        /outside the target directory/,
      );
      expect(await readdir(outsideDir)).toEqual([]);
    });

    it("does not follow it for a nested file, nor create the directories", async () => {
      await writeZip((zip) => zip.file("planted/sub/pwned.txt", "escaped"));

      await expect(safeExtractZip(zipPath, { dir: outDir })).rejects.toThrow(
        /outside the target directory/,
      );
      expect(await readdir(outsideDir)).toEqual([]);
    });

    it("does not follow it for a directory entry under it", async () => {
      await writeZip((zip) => {
        zip.folder("planted/sub");
      });

      await expect(safeExtractZip(zipPath, { dir: outDir })).rejects.toThrow(
        /outside the target directory/,
      );
      expect(await readdir(outsideDir)).toEqual([]);
    });
  });

  it("does not write through a pre-existing symlink at the destination", async () => {
    const outsideFile = join(workDir, "outside.txt");
    await writeFile(outsideFile, "original");
    await mkdir(outDir, { recursive: true });
    await symlink(outsideFile, join(outDir, "planted.txt"));
    await writeZip((zip) => zip.file("planted.txt", "escaped"));

    await expect(safeExtractZip(zipPath, { dir: outDir })).rejects.toThrow();
    expect(await readFile(outsideFile, "utf8")).toBe("original");
  });

  it("rejects an entry whose parent path is an existing file", async () => {
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "occupied"), "in the way");
    await writeZip((zip) => zip.file("occupied/pwned.txt", "nope"));

    await expect(safeExtractZip(zipPath, { dir: outDir })).rejects.toThrow(
      /collides with an existing file/,
    );
  });

  it("reports skipped symlink entries", async () => {
    await writeZip((zip) => {
      zip.file("link", "../outside", { unixPermissions: SYMLINK_MODE });
      zip.file("kept.txt", "kept");
    });
    const skipped: { fileName: string; reason: string }[] = [];

    await safeExtractZip(zipPath, {
      dir: outDir,
      onSkippedEntry: (entry) => skipped.push(entry),
    });

    expect(skipped).toEqual([{ fileName: "link", reason: "symlink" }]);
  });

  it("skips __MACOSX metadata without writing it", async () => {
    await writeZip((zip) => {
      zip.file("index.html", "<html></html>");
      zip.file("__MACOSX/._index.html", "resource fork");
      zip.folder("__MACOSX");
    });
    const seen: string[] = [];
    const skipped: string[] = [];

    await safeExtractZip(zipPath, {
      dir: outDir,
      onEntry: (entry) => seen.push(entry.fileName),
      onSkippedEntry: (entry) => skipped.push(entry.fileName),
    });

    expect(await readdir(outDir)).toEqual(["index.html"]);
    expect(seen).toEqual(["index.html"]);
    expect(skipped).toContain("__MACOSX/._index.html");
  });

  it("extracts an empty archive without reporting any entry", async () => {
    await writeZip(() => undefined);
    const seen: string[] = [];

    await safeExtractZip(zipPath, {
      dir: outDir,
      onEntry: (entry) => seen.push(entry.fileName),
    });

    expect(seen).toEqual([]);
    expect(await readdir(outDir)).toEqual([]);
  });

  it("preserves the entry's mode bits rather than flattening them", async () => {
    await writeZip((zip) => {
      zip.file("run.sh", "#!/bin/sh\n", { unixPermissions: 0o755 });
      zip.file("plain.txt", "plain", { unixPermissions: 0o644 });
    });

    await safeExtractZip(zipPath, { dir: outDir });

    // Asserted a bit at a time rather than against the exact mode, because the
    // process umask can clear group/other bits but never owner ones.
    expect((await lstat(join(outDir, "run.sh"))).mode & 0o100).toBe(0o100);
    expect((await lstat(join(outDir, "plain.txt"))).mode & 0o100).toBe(0);
  });

  it("tells onEntry whether each written entry is a directory", async () => {
    await writeZip((zip) => {
      zip.file("file.txt", "f");
      zip.folder("dir");
    });
    const seen: { fileName: string; isDirectory: boolean }[] = [];

    await safeExtractZip(zipPath, {
      dir: outDir,
      onEntry: (entry) => seen.push(entry),
    });

    expect(seen).toContainEqual({ fileName: "file.txt", isDirectory: false });
    expect(seen).toContainEqual({ fileName: "dir/", isDirectory: true });
  });

  it("rejects a file entry that names the target directory itself", async () => {
    // yauzl only rejects ".." segments, absolute names and backslashes, so "."
    // reaches us; it resolves to `dir`, which we must not open for writing.
    await writeZip((zip) => zip.file(".", "nope"));

    await expect(safeExtractZip(zipPath, { dir: outDir })).rejects.toThrow(
      /has no file name/,
    );
  });

  it("leaves no truncated file behind when an entry cannot be read", async () => {
    await writeZip((zip) => zip.file("broken.txt", "content"));
    // Corrupts the first local file header while leaving the central directory
    // intact, so the entry is listed but `openReadStream` fails after we have
    // already created the destination.
    const corrupted = await readFile(zipPath);
    corrupted.writeUInt32LE(0, 0);
    await writeFile(zipPath, corrupted);

    await expect(safeExtractZip(zipPath, { dir: outDir })).rejects.toThrow(
      /local file header signature/,
    );
    expect(await readdir(outDir)).toEqual([]);
  });
});

describe("assertInside", () => {
  // Only reachable in production through a symlink planted under the target,
  // which the end-to-end cases above cover; these pin the check itself.
  const root = "/tmp/extract-root";

  it("accepts the root itself and paths below it", () => {
    expect(() => assertInside(root, root, "entry")).not.toThrow();
    expect(() => assertInside(root, `${root}/a/b.txt`, "entry")).not.toThrow();
  });

  it("rejects the parent, siblings and unrelated absolute paths", () => {
    for (const path of [
      "/tmp",
      "/tmp/extract-root-sibling",
      "/tmp/extract-root/../escaped.txt",
      "/etc/passwd",
    ]) {
      expect(() => assertInside(root, path, "entry")).toThrow(
        /outside the target directory/,
      );
    }
  });
});
