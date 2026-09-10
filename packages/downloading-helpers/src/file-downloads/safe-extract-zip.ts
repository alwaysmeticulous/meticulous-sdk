import { initLogger } from "@alwaysmeticulous/common";
import { constants } from "fs";
import { mkdir, open, realpath, unlink } from "fs/promises";
import { dirname, isAbsolute, resolve } from "path";
import type { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { Entry, ZipFile } from "yauzl";
import yauzl from "yauzl";
import {
  assertInside,
  assertNotSymlink,
  closeZipFile,
  isDirectoryEntry,
  isMacOsMetadataEntry,
  mkdirInside,
  S_IFLNK,
  S_IFMT,
} from "./safe-extract-zip.utils";

/** Why an entry present in the archive was deliberately not written. */
export type SkippedZipEntryReason = "symlink" | "macos-metadata";

export interface SafeExtractZipOptions {
  /** Absolute path of the directory to extract into. Created if missing. */
  dir: string;
  /**
   * Called for every entry that is written to disk (files and directories),
   * in archive order. Entries reported to `onSkippedEntry` never appear here.
   */
  onEntry?: (entry: { fileName: string; isDirectory: boolean }) => void;
  /**
   * Called for every entry deliberately left unwritten: symlinks, which are
   * never created, and macOS AppleDouble metadata. A summary is logged either
   * way, so this is only needed by callers that must react to the loss.
   */
  onSkippedEntry?: (entry: {
    fileName: string;
    reason: SkippedZipEntryReason;
  }) => void;
  /**
   * Stops the extraction, at the next entry and mid-stream for the entry being
   * written. Callers that bound the extraction with a timeout need it: the
   * archive cannot be deleted, nor the target directory reused, while an
   * extraction they have stopped waiting for is still running.
   */
  signal?: AbortSignal;
}

// O_NOFOLLOW is undefined on Windows; there the plain "w" flags are used,
// which do follow a symlink at the destination, so the path is lstat'd first.
const HAS_O_NOFOLLOW = constants.O_NOFOLLOW !== undefined;
const WRITE_FLAGS = HAS_O_NOFOLLOW
  ? constants.O_WRONLY |
    constants.O_CREAT |
    constants.O_TRUNC |
    constants.O_NOFOLLOW
  : "w";

/** Names listed in full before the skipped-symlink warning is truncated. */
const MAX_LOGGED_SKIPPED_NAMES = 10;

/**
 * Extracts a zip archive into `dir` without ever following or creating
 * symlinks, so a hostile archive cannot write outside `dir`.
 *
 * Symlink entries are skipped outright: none of the archives we extract
 * (deployment assets, replay metadata, coverage artifacts) legitimately need
 * them, and honouring one would let a later entry write through it to an
 * arbitrary path. Every other entry is resolved against the real path of `dir`
 * and rejected if it escapes it. Directories are created one component at a
 * time, refusing any component that is already a symlink, and files are opened
 * with O_NOFOLLOW so a pre-existing symlink at the destination is not followed
 * either — so a symlink left under `dir` by an earlier extraction cannot
 * redirect a write outside it.
 */
export const safeExtractZip = async (
  zipPath: string,
  { dir, onEntry, onSkippedEntry, signal }: SafeExtractZipOptions,
): Promise<void> => {
  if (!isAbsolute(dir)) {
    throw new Error(
      `safeExtractZip: target directory must be absolute, got "${dir}"`,
    );
  }
  await mkdir(dir, { recursive: true });
  const root = await realpath(dir);
  const verifiedDirs = new Set<string>([root]);
  const skippedSymlinks: string[] = [];
  let skippedMacOsEntries = 0;

  const zipfile = await yauzl.openPromise(zipPath, {
    lazyEntries: true,
    autoClose: false,
  });
  try {
    for await (const entry of zipfile.eachEntry()) {
      signal?.throwIfAborted();
      const outcome = await extractEntry(
        zipfile,
        entry,
        root,
        verifiedDirs,
        signal,
      );
      if (outcome.written) {
        onEntry?.({
          fileName: entry.fileName,
          isDirectory: outcome.isDirectory,
        });
        continue;
      }

      if (outcome.reason === "symlink") {
        skippedSymlinks.push(entry.fileName);
      } else {
        skippedMacOsEntries += 1;
      }
      onSkippedEntry?.({ fileName: entry.fileName, reason: outcome.reason });
    }
  } finally {
    await closeZipFile(zipfile);
  }

  logSkippedEntries({ zipPath, skippedSymlinks, skippedMacOsEntries });
};

type EntryOutcome =
  | { written: true; isDirectory: boolean }
  | { written: false; reason: SkippedZipEntryReason };

const extractEntry = async (
  zipfile: ZipFile,
  entry: Entry,
  root: string,
  verifiedDirs: Set<string>,
  signal: AbortSignal | undefined,
): Promise<EntryOutcome> => {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  const fileType = mode & S_IFMT;
  if (fileType === S_IFLNK) {
    return { written: false, reason: "symlink" };
  }
  if (isMacOsMetadataEntry(entry.fileName)) {
    return { written: false, reason: "macos-metadata" };
  }

  const destination = resolve(root, entry.fileName);
  assertInside(root, destination, entry.fileName);

  if (isDirectoryEntry(entry, fileType)) {
    await mkdirInside(root, destination, entry.fileName, verifiedDirs);
    return { written: true, isDirectory: true };
  }

  // "" and "." both resolve to `root` itself, which passes containment and
  // would then have us open the extraction directory for writing.
  if (destination === root) {
    throw new Error(
      `safeExtractZip: entry "${entry.fileName}" has no file name`,
    );
  }

  await mkdirInside(root, dirname(destination), entry.fileName, verifiedDirs);
  await writeEntry(zipfile, entry, destination, mode, signal);
  return { written: true, isDirectory: false };
};

const writeEntry = async (
  zipfile: ZipFile,
  entry: Entry,
  destination: string,
  mode: number,
  signal: AbortSignal | undefined,
): Promise<void> => {
  if (!HAS_O_NOFOLLOW) {
    await assertNotSymlink(destination, entry.fileName);
  }

  // Opened before the entry stream is requested: yauzl keeps the archive's fd
  // open until every read stream it handed out is consumed or destroyed, so a
  // failed open between the two would leak that fd for the process lifetime.
  const handle = await open(destination, WRITE_FLAGS, mode & 0o777 || 0o644);
  let readStream: Readable | undefined;
  try {
    readStream = await zipfile.openReadStreamPromise(entry);
    await pipeline(readStream, handle.createWriteStream(), { signal });
  } catch (error) {
    // `pipeline` destroys both streams itself, but a throw from
    // `createWriteStream()` lands here with the entry stream still live, and
    // yauzl holds the archive's fd until it is destroyed.
    readStream?.destroy();
    await handle.close().catch(() => undefined);
    // The open above created or truncated the destination, so leaving it would
    // publish a 0-byte file. Callers that cache extracted artifacts on disk
    // treat one as a valid entry and then fail to parse it on every later run.
    await unlink(destination).catch(() => undefined);
    throw error;
  }
};

const logSkippedEntries = ({
  zipPath,
  skippedSymlinks,
  skippedMacOsEntries,
}: {
  zipPath: string;
  skippedSymlinks: string[];
  skippedMacOsEntries: number;
}): void => {
  if (skippedSymlinks.length === 0 && skippedMacOsEntries === 0) {
    return;
  }

  const logger = initLogger();
  if (skippedSymlinks.length > 0) {
    // Warned rather than thrown: our own archives dereference symlinks, so
    // this only fires on a customer upload, where losing one asset beats
    // failing the whole extraction. Silence was the problem — a replay would
    // 404 on the path with nothing pointing at the archive.
    logger.warn(
      `safeExtractZip: did not extract ${skippedSymlinks.length} symlink ` +
        `entr${skippedSymlinks.length === 1 ? "y" : "ies"} from ${zipPath}; ` +
        `anything that relied on ${skippedSymlinks.length === 1 ? "it" : "them"} ` +
        `will be missing: ${formatNames(skippedSymlinks)}`,
    );
  }
  if (skippedMacOsEntries > 0) {
    logger.debug(
      `safeExtractZip: skipped ${skippedMacOsEntries} __MACOSX metadata ` +
        `entries from ${zipPath}`,
    );
  }
};

const formatNames = (names: string[]): string => {
  if (names.length <= MAX_LOGGED_SKIPPED_NAMES) {
    return names.join(", ");
  }
  const shown = names.slice(0, MAX_LOGGED_SKIPPED_NAMES).join(", ");
  return `${shown} and ${names.length - MAX_LOGGED_SKIPPED_NAMES} more`;
};
