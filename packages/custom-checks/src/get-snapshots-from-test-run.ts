import type { Snapshot } from "@alwaysmeticulous/api";
import {
  maybeEnrichFetchError,
  type MeticulousClient,
} from "@alwaysmeticulous/client";
import {
  downloadAndAssembleSnapshots,
  type CustomCheckSnapshotFileToDownload,
} from "./download-snapshots";

export interface GetSnapshotsFromTestRunOptions {
  client: MeticulousClient;
  testRunId: string;
  /** The custom check snapshot types to fetch, e.g. ["network-requests"]. */
  snapshotTypes: string[];
}

export interface SnapshotsFromTestRun {
  testRunId: string;
  /** The base test run the snapshots were compared against. */
  baseTestRunId: string;
  baseSnapshots: Snapshot[];
  headSnapshots: Snapshot[];
}

/**
 * Response of `GET test-runs/:testRunId/custom-check-snapshots-download-urls`:
 * a single signed base URL plus the list of snapshot files to download for the
 * head test run and its resolved base. Mirrors the backend's
 * `TestRunCustomCheckSnapshotDownloadUrlsResponse`.
 */
interface SnapshotDownloadUrlsResponse {
  testRunId: string;
  baseTestRunId: string;
  signedBaseUrl: string;
  baseSnapshotFiles: CustomCheckSnapshotFileToDownload[];
  headSnapshotFiles: CustomCheckSnapshotFileToDownload[];
}

/**
 * Fetches the custom check snapshots gathered during the base and head replays
 * of a test run, ready to be passed to a custom check's `execute`. Throws if the
 * test run has no resolvable base test run.
 *
 * The backend returns one signed URL and the list of files; we download and
 * assemble them here, one side at a time. A full-size run's base and head file
 * lists are each already large enough on their own (the caller downloads one
 * snapshot type at a time for the same reason); downloading both sides
 * concurrently doubles the peak concurrent connections against the snapshot
 * store and the peak memory held during assembly, which is what has been
 * tipping the largest runs into S3 slow-down (503) responses and worker OOMs.
 */
export const getSnapshotsFromTestRun = async ({
  client,
  testRunId,
  snapshotTypes,
}: GetSnapshotsFromTestRunOptions): Promise<SnapshotsFromTestRun> => {
  const params = new URLSearchParams();
  for (const snapshotType of snapshotTypes) {
    params.append("snapshotTypes", snapshotType);
  }
  const { data } = await client
    .get<SnapshotDownloadUrlsResponse>(
      `test-runs/${testRunId}/custom-check-snapshots-download-urls?${params.toString()}`,
    )
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });

  const baseSnapshots = await downloadAndAssembleSnapshots({
    signedBaseUrl: data.signedBaseUrl,
    files: data.baseSnapshotFiles,
  });
  const headSnapshots = await downloadAndAssembleSnapshots({
    signedBaseUrl: data.signedBaseUrl,
    files: data.headSnapshotFiles,
  });

  return {
    testRunId: data.testRunId,
    baseTestRunId: data.baseTestRunId,
    baseSnapshots,
    headSnapshots,
  };
};
