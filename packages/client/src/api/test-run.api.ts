import { Project, TestCaseResult, TestRunStatus } from "@alwaysmeticulous/api";
import { AxiosError, AxiosInstance } from "axios";

export interface TestRun {
  id: string;
  status: TestRunStatus;
  project: Project;
  resultData?: {
    results: TestCaseResult[];
  };
}

export interface GetLatestTestRunOptions {
  client: AxiosInstance;
  commitSha: string;
  logicalEnvironmentVersion?: number;
}

export const getLatestTestRunResults = async ({
  client,
  commitSha,
  logicalEnvironmentVersion,
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
