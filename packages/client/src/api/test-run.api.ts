import type {
  ExecuteSecureTunnelTestRunOptions as ExecuteSecureTunnelTestRunPayload,
  ExecuteSecureTunnelTestRunResponse,
  Snapshot,
  TestRun,
  TestRunDataLocations,
} from "@alwaysmeticulous/api";
import { isFetchError, maybeEnrichFetchError } from "../errors";
import { MeticulousClient } from "../types/client.types";
import { ReplayDiffResponse } from "./replay-diff.api";

export type ExecuteSecureTunnelTestRunOptions =
  ExecuteSecureTunnelTestRunPayload & {
    client: MeticulousClient;
  };

export type { ExecuteSecureTunnelTestRunResponse, TestRun };

export const executeSecureTunnelTestRun = async ({
  client,
  headSha,
  tunnelUrl,
  basicAuthUser,
  basicAuthPassword,
  environment,
  isLockable,
  companionAssetsInfo,
  pullRequestHostingProviderId,
  postComment,
  debugContext,
}: ExecuteSecureTunnelTestRunOptions): Promise<ExecuteSecureTunnelTestRunResponse> => {
  const { data } = await client
    .post("test-runs/trigger-secure-tunnel-test-run-v2", {
      headSha,
      tunnelUrl,
      basicAuthUser,
      basicAuthPassword,
      environment,
      isLockable,
      ...(postComment ? { postComment } : {}),
      ...(companionAssetsInfo ? { companionAssetsInfo } : {}),
      ...(pullRequestHostingProviderId ? { pullRequestHostingProviderId } : {}),
      ...(debugContext ? { debugContext } : {}),
    })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data as ExecuteSecureTunnelTestRunResponse;
};

export const getTestRun: (options: {
  client: MeticulousClient;
  testRunId: string;
}) => Promise<TestRun> = async ({ client, testRunId }) => {
  const { data } = await client.get<unknown, { data: TestRun }>(
    `test-runs/${testRunId}`,
  );
  return data;
};

export const getTestRunData: (options: {
  client: MeticulousClient;
  testRunId: string;
  includeAppContainerLogs?: boolean;
}) => Promise<TestRunDataLocations> = async ({
  client,
  testRunId,
  includeAppContainerLogs,
}) => {
  const params = includeAppContainerLogs
    ? { params: { includeAppContainerLogs: true } }
    : {};
  const { data } = await client.get<unknown, { data: TestRunDataLocations }>(
    `test-runs/${testRunId}/data`,
    params,
  );
  return data;
};

export interface GetLatestTestRunOptions {
  client: MeticulousClient;
  commitSha: string;
  logicalEnvironmentVersion?: number;
  useCloudReplayEnvironmentVersion?: boolean;
}

export const getLatestTestRunResults = async ({
  client,
  commitSha,
  logicalEnvironmentVersion,
  useCloudReplayEnvironmentVersion,
}: GetLatestTestRunOptions): Promise<TestRun | null> => {
  const { data } = await client
    .get("test-runs/cache", {
      params: {
        commitSha: encodeURIComponent(commitSha),
        ...(logicalEnvironmentVersion
          ? {
              logicalEnvironmentVersion: encodeURIComponent(
                logicalEnvironmentVersion,
              ),
            }
          : {}),
        ...(useCloudReplayEnvironmentVersion
          ? { useCloudReplayEnvironmentVersion: true }
          : {}),
      },
    })
    .catch((error) => {
      if (isFetchError(error) && error.response?.status === 404) {
        return { data: null };
      }
      throw error;
    });
  return (data as TestRun | null) ?? null;
};

export const getTestRunReplayDiffs = async ({
  client,
  testRunId,
}: {
  client: MeticulousClient;
  testRunId: string;
}): Promise<ReplayDiffResponse[]> => {
  const BATCH_SIZE = 500;
  const replayDiffs: ReplayDiffResponse[] = [];

  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data } = await client.get<unknown, { data: ReplayDiffResponse[] }>(
      `test-runs/${testRunId}/replay-diffs?limit=${BATCH_SIZE}&offset=${offset}`,
    );
    replayDiffs.push(...data);
    if (data.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      offset += BATCH_SIZE;
    }
  }

  return replayDiffs;
};

export const emitTelemetry = async ({
  client,
  values,
  commitSha,
}: {
  client: MeticulousClient;
  values: Record<string, number>;
  commitSha?: string;
}): Promise<void> => {
  await client.post(`test-runs/telemetry`, { values, commitSha });
};

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
