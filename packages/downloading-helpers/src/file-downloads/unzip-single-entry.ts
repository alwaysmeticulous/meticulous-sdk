import type { Entry, ZipFile } from "yauzl";
import yauzl from "yauzl";
import {
  isDirectoryEntry,
  isMacOsMetadataEntry,
  S_IFLNK,
  S_IFMT,
} from "./safe-extract-zip.utils";

// yauzl rather than JSZip, the other zip library in the workspace: this package
// is published and already needs yauzl for `safeExtractZip`, so one zip library
// stays in its runtime dependency tree instead of two, and yauzl was already
// the incumbent for this same in-memory single-entry read elsewhere in the repo.
//
// Deliberately not a performance choice, despite the tempting story that yauzl
// inflates on the libuv pool while JSZip does it on the JS thread. Measured over
// real coverage artifacts (8-24MB of JSON, including the concurrent pair session
// selection fetches), the two are within noise of each other on both event-loop
// block and wall time. What on-thread cost remains is `Buffer.concat` + UTF-8
// decode + `JSON.parse` — order of 100ms per 14MB — which every implementation
// pays and no zip library removes, so that chain is the lever if this ever needs
// to get faster.
//
// Worth reconsidering if yauzl's refcount and close semantics keep causing
// trouble; JSZip has none of those sharp edges and remains a devDependency here
// for building test archives.

/**
 * Returns the contents of the single file entry in an in-memory zip archive.
 *
 * Most zips we read are single-entry artifacts: a gzip-named JSON blob in S3, a
 * screenshot metadata file, a coverage report. Callers used to write the bytes
 * to a temp directory, extract them, read the one file back and delete the
 * directory — four syscall-heavy steps and a cleanup path to get wrong, plus a
 * filesystem to defend against path traversal on. Nothing here touches disk.
 *
 * `name` only labels errors — pass the artifact's file name, not a URL.
 *
 * Throws if the archive is empty or holds more than one file entry. Entries
 * `safeExtractZip` would not write are ignored — directories, symlinks and
 * Finder's AppleDouble metadata — so an archive of a folder plus its file, or
 * one zipped up by Finder, is still single-entry as far as callers are
 * concerned.
 */
export const unzipSingleEntry = async (
  bytes: Uint8Array,
  name: string,
): Promise<Buffer> => {
  // Views the caller's bytes rather than copying them.
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // `fromBuffer` forces `autoClose: false`, so the archive is still open for
  // the entry read below after `eachEntry()` has walked the central directory.
  const zipfile = await yauzl.fromBufferPromise(buffer, { lazyEntries: true });

  try {
    const fileEntries: Entry[] = [];
    for await (const entry of zipfile.eachEntry()) {
      if (!isIgnoredEntry(entry)) {
        fileEntries.push(entry);
      }
    }

    if (fileEntries.length === 0) {
      throw new Error(`ZIP archive ${name} appears to be empty`);
    }
    if (fileEntries.length > 1) {
      throw new Error(
        `ZIP archive ${name} contains ${fileEntries.length} entries; ` +
          `expected exactly 1. Entries: ${fileEntries
            .map((entry) => entry.fileName)
            .join(", ")}`,
      );
    }

    return await readEntry(zipfile, fileEntries[0]);
  } finally {
    // Synchronous and infallible: a buffer-backed archive has no fd, so closing
    // only drops yauzl's refcount. `safeExtractZip`, which reads from a real
    // file, has to wait for the fd instead.
    zipfile.close();
  }
};

/** {@link unzipSingleEntry}, decoded as UTF-8. */
export const unzipSingleEntryToString = async (
  bytes: Uint8Array,
  name: string,
): Promise<string> => (await unzipSingleEntry(bytes, name)).toString("utf-8");

/** {@link unzipSingleEntryToString}, parsed as JSON. */
export const unzipSingleEntryToJson = async <T>(
  bytes: Uint8Array,
  name: string,
): Promise<T> => JSON.parse(await unzipSingleEntryToString(bytes, name)) as T;

const readEntry = async (zipfile: ZipFile, entry: Entry): Promise<Buffer> => {
  const readStream = await zipfile.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  for await (const chunk of readStream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
};

/**
 * The entries `safeExtractZip` refuses to write. Counting any of them would
 * make a legitimately single-file archive look like it holds two.
 */
const isIgnoredEntry = (entry: Entry): boolean => {
  const fileType = (entry.externalFileAttributes >>> 16) & 0xffff & S_IFMT;
  return (
    fileType === S_IFLNK ||
    isMacOsMetadataEntry(entry.fileName) ||
    isDirectoryEntry(entry, fileType)
  );
};
