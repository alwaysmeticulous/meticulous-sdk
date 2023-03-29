import { createWriteStream } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import archiver from "archiver";

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
