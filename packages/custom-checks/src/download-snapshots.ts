import type { Snapshot } from "@alwaysmeticulous/api";
import { downloadAndUnzipJson } from "@alwaysmeticulous/downloading-helpers";
import pLimit from "p-limit";
import { internStrings } from "./intern-strings";

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

/** Which test run of the comparison a snapshot file belongs to. */
export type SnapshotSide = "base" | "head";

/**
 * Optional per-entry projection applied as each snapshot file is parsed, so
 * callers that only read a subset of `data` (e.g. `network-requests` dropping
 * `requestHeaders`, `responseHeaders`, and unused `requestBody` strings) do
 * not retain the full parsed payload across thousands of downloaded files.
 * `side` lets a caller keep fields it only reads from one side, such as
 * report-only detail that is never read from the base run.
 */
export type SnapshotDataProjector = (snapshot: {
  type: string;
  sessionId: string;
  stageDuringSession: string;
  data: unknown;
  side: SnapshotSide;
}) => unknown;

/**
 * Downloads every snapshot file in parallel from the single signed base URL and
 * assembles them into a flat list of {@link Snapshot}s for a custom check.
 *
 * Every string in the assembled snapshots is deduplicated through
 * `stringPool` (see {@link internStrings}); pass the same pool for both sides
 * of a comparison so base and head share one copy of each value.
 */
export const downloadAndAssembleSnapshots = async ({
  signedBaseUrl,
  files,
  side,
  concurrency = DEFAULT_DOWNLOAD_CONCURRENCY,
  projectSnapshotData,
  stringPool = new Map(),
}: {
  signedBaseUrl: string;
  files: CustomCheckSnapshotFileToDownload[];
  side: SnapshotSide;
  concurrency?: number;
  projectSnapshotData?: SnapshotDataProjector;
  stringPool?: Map<string, string>;
}): Promise<Snapshot[]> => {
  if (files.length === 0) {
    return [];
  }
  const limit = pLimit(concurrency);
  const snapshotsPerFile = await Promise.all(
    files.map((file) =>
      limit(() =>
        downloadSnapshotFile({
          signedBaseUrl,
          file,
          side,
          projectSnapshotData,
          stringPool,
        }),
      ),
    ),
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
const downloadSnapshotFile = async ({
  signedBaseUrl,
  file,
  side,
  projectSnapshotData,
  stringPool,
}: {
  signedBaseUrl: string;
  file: CustomCheckSnapshotFileToDownload;
  side: SnapshotSide;
  projectSnapshotData: SnapshotDataProjector | undefined;
  stringPool: Map<string, string>;
}): Promise<Snapshot[]> => {
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
    sessionDescription: internStrings(
      snapshot.sessionDescription ?? null,
      stringPool,
    ),
    stageDuringSession: internStrings(snapshot.stageDuringSession, stringPool),
    data: internStrings(
      projectSnapshotData
        ? projectSnapshotData({
            type: file.type,
            sessionId: file.sessionId,
            stageDuringSession: snapshot.stageDuringSession,
            data: snapshot.data,
            side,
          })
        : snapshot.data,
      stringPool,
    ),
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
