import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { Snapshot } from "@alwaysmeticulous/api";
import { downloadAndExtractFile } from "@alwaysmeticulous/downloading-helpers";
import pLimit from "p-limit";

/** How many snapshot files to download and extract in parallel. */
const DEFAULT_DOWNLOAD_CONCURRENCY = 20;

/**
 * One custom check snapshot file to download. `key` is appended to the signed
 * base URL to fetch it; `type` and `sessionId` aren't stored in the file and so
 * are stamped onto each parsed snapshot.
 */
export interface CustomCheckSnapshotFileToDownload {
  type: string;
  sessionId: string;
  key: string;
}

/**
 * Downloads every snapshot file in parallel from the single signed base URL and
 * assembles them into a flat list of {@link Snapshot}s for a custom check.
 */
export const downloadAndAssembleSnapshots = async ({
  signedBaseUrl,
  files,
  concurrency = DEFAULT_DOWNLOAD_CONCURRENCY,
}: {
  signedBaseUrl: string;
  files: CustomCheckSnapshotFileToDownload[];
  concurrency?: number;
}): Promise<Snapshot[]> => {
  if (files.length === 0) {
    return [];
  }
  const limit = pLimit(concurrency);
  const snapshotsPerFile = await Promise.all(
    files.map((file) => limit(() => downloadSnapshotFile(signedBaseUrl, file))),
  );
  return snapshotsPerFile.flat();
};

/**
 * Downloads and parses a single snapshot file, tagging each entry with the
 * file's `type` and `sessionId`.
 *
 * Despite the `.json.gz` key the stored file is a zip archive (containing a
 * single `<type>.json` entry) like the other replay artifacts, so we reuse the
 * same download-and-extract helper via a throwaway temp dir.
 */
const downloadSnapshotFile = async (
  signedBaseUrl: string,
  file: CustomCheckSnapshotFileToDownload,
): Promise<Snapshot[]> => {
  const url = buildSnapshotFileUrl(signedBaseUrl, file.key);
  const workDir = await mkdtemp(join(tmpdir(), "met-custom-check-snapshots-"));
  try {
    const zipPath = join(workDir, "snapshot.json.gz");
    const extractDir = join(workDir, "extracted");
    const entries = await downloadAndExtractFile(url, zipPath, extractDir);

    const jsonEntry = entries.find((entry) => entry.endsWith(".json"));
    if (jsonEntry == null) {
      throw new Error(
        `Custom check snapshot file "${file.key}" did not contain a .json entry (got: ${
          entries.join(", ") || "<none>"
        }).`,
      );
    }

    const parsed: unknown = JSON.parse(
      await readFile(join(extractDir, jsonEntry), "utf-8"),
    );
    if (!Array.isArray(parsed)) {
      throw new Error(
        `Expected custom check snapshot file "${file.key}" to contain a JSON array, got ${typeof parsed}.`,
      );
    }

    return (
      parsed as Array<{
        stageDuringSession: string;
        data: unknown;
        versionNumber?: number;
      }>
    ).map((snapshot) => ({
      type: file.type,
      sessionId: file.sessionId,
      stageDuringSession: snapshot.stageDuringSession,
      data: snapshot.data,
      // Default to 0 so built-in snapshots (written without a version) surface as
      // the documented default rather than `undefined`.
      versionNumber: snapshot.versionNumber ?? 0,
    }));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

/**
 * Builds a file's URL by setting the path on the signed base URL. The CloudFront
 * signature is in the query string, so we keep it and only replace the path.
 */
const buildSnapshotFileUrl = (signedBaseUrl: string, key: string): string => {
  const url = new URL(signedBaseUrl);
  url.pathname = `/${key}`;
  return url.toString();
};
