import { maybeEnrichFetchError } from "../errors";
import { MeticulousClient } from "../types/client.types";
import type { TestRun } from "@alwaysmeticulous/api";

export interface GetBaseTestRunOptions {
  client: MeticulousClient;
  headCommitSha: string;
}

export interface GitHubBaseTestRunResponse {
  baseCommitSha: string;
  baseTestRun: TestRun | null;
  commitIsInPullRequest: boolean;
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
      },
    )
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });

  return data;
};
