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
 * assemble them here, in parallel.
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
    .get<
      unknown,
      { data: SnapshotDownloadUrlsResponse }
    >(`test-runs/${testRunId}/custom-check-snapshots-download-urls?${params.toString()}`)
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });

  const [baseSnapshots, headSnapshots] = await Promise.all([
    downloadAndAssembleSnapshots({
      signedBaseUrl: data.signedBaseUrl,
      files: data.baseSnapshotFiles,
    }),
    downloadAndAssembleSnapshots({
      signedBaseUrl: data.signedBaseUrl,
      files: data.headSnapshotFiles,
    }),
  ]);

  return {
    testRunId: data.testRunId,
    baseTestRunId: data.baseTestRunId,
    baseSnapshots,
    headSnapshots,
  };
};
