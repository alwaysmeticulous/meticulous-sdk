import { AxiosInstance, isAxiosError } from "axios";
import { TestRun } from "./test-run.api";

export interface GetBaseTestRunOptions {
  client: AxiosInstance;
  headCommitSha: string;
}

export interface GitHubBaseTestRunResponse {
  baseCommitSha: string;
  baseTestRun: TestRun | null;
}

export interface GetRepoUrlOptions {
  client: AxiosInstance;
}

export interface GitHubRepoUrlResponse {
  repoUrl: string;
}

export const getGitHubCloudReplayBaseTestRun = async ({
  client,
  headCommitSha,
}: GetBaseTestRunOptions): Promise<GitHubBaseTestRunResponse> => {
  const { data } = await client
    .get<unknown, { data: GitHubBaseTestRunResponse }>(
      "github-cloud-replay/base-test-run",
      {
        params: { headCommitSha },
      }
    )
    .catch((error) => {
      if (isAxiosError(error)) {
        const errorMessage = error.response?.data?.message;

        if (errorMessage) {
          throw new Error(errorMessage);
        }
      }

      throw error;
    });

  return data;
};

export const getGitHubCloudReplayRepoUrl = async ({
  client,
}: GetRepoUrlOptions): Promise<GitHubRepoUrlResponse> => {
  const { data } = await client
    .get<unknown, { data: GitHubRepoUrlResponse }>(
      "github-cloud-replay/repo-url"
    )
    .catch((error) => {
      if (isAxiosError(error)) {
        const errorMessage = error.response?.data?.message;

        if (errorMessage) {
          throw new Error(errorMessage);
        }
      }

      throw error;
    });

  return data;
};
