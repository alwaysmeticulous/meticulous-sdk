import {
  Project,
  S3Location,
  TestCase,
  TestCaseResult,
  TestRunStatus,
} from "@alwaysmeticulous/api";
import { isFetchError, maybeEnrichFetchError } from "../errors";
import { MeticulousClient } from "../types/client.types";
export interface TestRunDataLocations {
  coverage: S3Location;
  coverageStats: S3Location;
  coveragePr: S3Location;
  coverageStatsPr: S3Location;
  coverageReplaysByFile?: S3Location;
  coverageReplaysByFileUnmapped?: S3Location;
  coverageScreenshotReplaysByFile?: S3Location;
  coverageScreenshotReplaysByFileUnmapped?: S3Location;
  coverageByReplayPr?: S3Location;
  relevantReplayContexts: S3Location;
}

export interface TestRun {
  id: string;
  status: TestRunStatus;
  project: Project;
  configData: {
    testCases?: TestCase[];
  };
  resultData?: {
    results?: TestCaseResult[];
  };
  url: string;
}

export interface ExecuteSecureTunnelTestRunOptions {
  client: MeticulousClient;
  headSha: string;
  tunnelUrl: string;
  basicAuthUser: string;
  basicAuthPassword: string;
  environment: string;
  isLockable: boolean;
  pullRequestHostingProviderId?: string;
}

export interface ExecuteSecureTunnelTestRunResponse {
  testRun?: TestRun;
  deploymentId: string;
  message?: string;
}

export const executeSecureTunnelTestRun = async ({
  client,
  headSha,
  tunnelUrl,
  basicAuthUser,
  basicAuthPassword,
  environment,
  isLockable,
  pullRequestHostingProviderId,
}: ExecuteSecureTunnelTestRunOptions): Promise<ExecuteSecureTunnelTestRunResponse> => {
  const { data } = await client
    .post("test-runs/trigger-secure-tunnel-test-run-v2", {
      headSha,
      tunnelUrl,
      basicAuthUser,
      basicAuthPassword,
      environment,
      isLockable,
      ...(pullRequestHostingProviderId ? { pullRequestHostingProviderId } : {}),
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
}) => Promise<TestRunDataLocations> = async ({ client, testRunId }) => {
  const { data } = await client.get<unknown, { data: TestRunDataLocations }>(
    `test-runs/${testRunId}/data`,
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
