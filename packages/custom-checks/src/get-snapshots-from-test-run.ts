import type { Snapshot } from "@alwaysmeticulous/api";
import {
  maybeEnrichFetchError,
  type MeticulousClient,
} from "@alwaysmeticulous/client";

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
 * Fetches the custom check snapshots gathered during the base and head replays
 * of a test run, ready to be passed to a custom check's `execute`. Throws if the
 * test run has no resolvable base test run.
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
      { data: SnapshotsFromTestRun }
    >(`test-runs/${testRunId}/custom-check-snapshots?${params.toString()}`)
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};
