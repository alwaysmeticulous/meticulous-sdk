import type {
  ExecuteSecureTunnelTestRunOptions as ExecuteSecureTunnelTestRunPayload,
  ExecuteSecureTunnelTestRunResponse,
  TestRun,
  TestRunDataLocations,
  TestRunNetworkPatchingResult,
} from "@alwaysmeticulous/api";
import { isFetchError, maybeEnrichFetchError } from "../errors";
import type { MeticulousClient } from "../types/client.types";
import type { ReplayDiffResponse } from "./replay-diff.api";

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

/**
 * Resolves the "effective" test run that custom check results should be reported
 * against, accounting for network patching (session repair).
 *
 * Returns `null` if the backend does not support this endpoint (older backends),
 * so callers can fall back to reporting against the requested test run.
 */
export const getTestRunNetworkPatchingResult = async ({
  client,
  testRunId,
}: {
  client: MeticulousClient;
  testRunId: string;
}): Promise<TestRunNetworkPatchingResult | null> => {
  const { data } = await client
    .get<unknown, { data: TestRunNetworkPatchingResult | null }>(
      `test-runs/${testRunId}/network-patching-result`,
    )
    .catch((error) => {
      if (isFetchError(error) && error.response?.status === 404) {
        return { data: null };
      }
      throw maybeEnrichFetchError(error);
    });
  return data ?? null;
};

/**
 * Registers that a test run is expecting custom check results, so the Meticulous
 * UI shows the "Checks" tab for it while the results are computed and reported.
 *
 * Call this with the *effective* test run id (the merged run when network
 * patching applied — see {@link getTestRunNetworkPatchingResult}) so the tab
 * appears on the run the user actually sees.
 *
 * Older backends don't expose this endpoint, so a 404 is treated as a no-op
 * (mirroring {@link getTestRunNetworkPatchingResult}) rather than throwing. Any
 * other error is rethrown for the caller to handle.
 */
export const markTestRunExpectsCustomChecks = async ({
  client,
  testRunId,
}: {
  client: MeticulousClient;
  testRunId: string;
}): Promise<void> => {
  await client
    .post(`test-runs/${testRunId}/expect-custom-checks`, {})
    .catch((error) => {
      // Older backend without the endpoint: nothing to register, so no-op.
      if (isFetchError(error) && error.response?.status === 404) {
        return;
      }
      throw maybeEnrichFetchError(error);
    });
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
