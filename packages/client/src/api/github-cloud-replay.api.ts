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
