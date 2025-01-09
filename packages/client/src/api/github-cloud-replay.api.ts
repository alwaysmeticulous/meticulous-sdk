import { AxiosInstance } from "axios";
import { maybeEnrichAxiosError } from "../errors";
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
      throw maybeEnrichAxiosError(error);
    });

  return data;
};
