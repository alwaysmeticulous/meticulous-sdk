import type { Snapshot } from "@alwaysmeticulous/api";
import { downloadAndUnzipJson } from "@alwaysmeticulous/downloading-helpers";
import pLimit from "p-limit";

/** How many snapshot files to download and parse in parallel. */
const DEFAULT_DOWNLOAD_CONCURRENCY = 20;

/**
 * A single test run's snapshot files run to hundreds of megabytes, so allow a
 * longer budget than the download helper's default.
 */
const DOWNLOAD_TIMEOUT_MS = 120_000;

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
 * Despite the `.json.gz` key the stored file is a zip archive containing a
 * single `<type>.json` entry, like the other replay artifacts. It is unzipped
 * in memory rather than through a temp dir because a check runs hundreds of
 * these concurrently inside a worker whose disk is shared with every other
 * activity on the pod.
 */
const downloadSnapshotFile = async (
  signedBaseUrl: string,
  file: CustomCheckSnapshotFileToDownload,
): Promise<Snapshot[]> => {
  const url = buildSnapshotFileUrl(signedBaseUrl, file.key);
  const parsed = await downloadAndUnzipJson<unknown>(url, {
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
  });
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
      sessionDescription?: string | null;
    }>
  ).map((snapshot) => ({
    type: file.type,
    sessionId: file.sessionId,
    // Persisted at replay time (see CustomCheckSnapshot.sessionDescription);
    // absent for sessions without a description.
    sessionDescription: snapshot.sessionDescription ?? null,
    stageDuringSession: snapshot.stageDuringSession,
    data: snapshot.data,
    // Default to 0 so built-in snapshots (written without a version) surface as
    // the documented default rather than `undefined`.
    versionNumber: snapshot.versionNumber ?? 0,
  }));
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
