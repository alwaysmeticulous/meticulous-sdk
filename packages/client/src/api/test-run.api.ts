import {
  Project,
  TestCase,
  TestCaseResult,
  TestRunStatus,
} from "@alwaysmeticulous/api";
import { AxiosError, AxiosInstance, isAxiosError } from "axios";

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
  client: AxiosInstance;
  headSha: string;
  tunnelUrl: string;
  basicAuthUser: string;
  basicAuthPassword: string;
  environment: string;
}

export const executeSecureTunnelTestRun = async ({
  client,
  headSha,
  tunnelUrl,
  basicAuthUser,
  basicAuthPassword,
  environment,
}: ExecuteSecureTunnelTestRunOptions): Promise<TestRun | null> => {
  const { data } = await client
    .post("test-runs/trigger-secure-tunnel-test-run", {
      headSha,
      tunnelUrl,
      basicAuthUser,
      basicAuthPassword,
      environment,
    })
    .catch((error) => {
      if (isAxiosError(error)) {
        if (error.response?.status === 404) {
          return { data: null };
        }

        const errorMessage = error.response?.data?.message;

        if (errorMessage) {
          throw new Error(errorMessage);
        }
      }

      throw error;
    });
  return (data as TestRun | null) ?? null;
};

export const getTestRun: (options: {
  client: AxiosInstance;
  testRunId: string;
}) => Promise<TestRun> = async ({ client, testRunId }) => {
  const { data } = await client.get<unknown, { data: TestRun }>(
    `test-runs/${testRunId}`
  );
  return data;
};

export interface GetLatestTestRunOptions {
  client: AxiosInstance;
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
                logicalEnvironmentVersion
              ),
            }
          : {}),
        ...(useCloudReplayEnvironmentVersion
          ? { useCloudReplayEnvironmentVersion: true }
          : {}),
      },
    })
    .catch((error) => {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return { data: null };
      }
      throw error;
    });
  return (data as TestRun | null) ?? null;
};
