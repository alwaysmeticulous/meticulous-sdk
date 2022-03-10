import { join, resolve, dirname } from "path";
import { readdir, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import archiver from "archiver";
import { createWriteStream } from "fs";

export const checkDistFolder: (dist: string) => Promise<void> = async (
  dist_
) => {
  const dist = resolve(process.cwd(), dist_);
  const files = await readdir(dist, { encoding: "utf-8", withFileTypes: true });

  const indexHtml = files.find(
    (entry) => entry.name.toLocaleLowerCase() === "index.html" && entry.isFile()
  );

  if (!indexHtml) {
    throw new Error(`Cannot find "index.html" in ${dist}`);
  }
};

export const createArchive: (dist: string) => Promise<string> = async (
  dist_
) => {
  const tempDir = await mkdtemp(join(tmpdir(), "meticulous-"));
  const archivePath = join(tempDir, "build.zip");

  const dist = resolve(process.cwd(), dist_);

  const fileStream = createWriteStream(archivePath);
  const archive = archiver("zip");

  await new Promise((resolve, reject) => {
    archive.on("error", (err) => reject(err));
    fileStream.on("close", () => {
      resolve(null);
    });
    archive.pipe(fileStream);
    archive.directory(dist, false);
    archive.finalize().catch((error) => {
      throw error;
    });
  });

  return archivePath;
};

export const createReplayArchive: (dir: string) => Promise<string> = async (
  dir
) => {
  const tempDir = await mkdtemp(join(tmpdir(), "meticulous-"));
  const archivePath = join(tempDir, "replay.zip");

  const fileStream = createWriteStream(archivePath);
  const archive = archiver("zip");

  await new Promise((resolve, reject) => {
    archive.on("error", (err) => reject(err));
    fileStream.on("close", () => {
      resolve(null);
    });
    archive.pipe(fileStream);
    archive.directory(dir, false);
    archive.finalize().catch((error) => {
      throw error;
    });
  });

  return archivePath;
};

export const deleteArchive: (archivePath: string) => Promise<void> = async (
  archivePath
) => {
  const dir = dirname(archivePath);
  await rm(dir, { force: true, recursive: true });
};
