import type { TestRun } from "@alwaysmeticulous/api";
import { initLogger } from "@alwaysmeticulous/common";
import { maybeEnrichFetchError } from "../errors";
import type { MeticulousClient } from "../types/client.types";

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
    .get<GitHubBaseTestRunResponse>("github-cloud-replay/base-test-run", {
      params: { headCommitSha },
    })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });

  return data;
};

export interface TakeBaseWorkflowDispatchLeaseOptions {
  client: MeticulousClient;
  baseCommitSha: string;
  workflowId: string;
}

/**
 * Asks whether this caller should be the one to dispatch a build of
 * `baseCommitSha`, when several callers may be about to ask for the same one.
 *
 * Call this only immediately before dispatching. A lease taken speculatively
 * still holds off the other callers, so if this caller then decides not to
 * dispatch, nothing builds the commit.
 *
 * Never throws, and only an explicit refusal withholds a dispatch: anything
 * that stops us reaching a verdict — the backend being unreachable, an old
 * backend that doesn't serve this route, a rejected token, a reply that isn't
 * this contract — answers true, which is what every caller did before leases
 * existed. The cost of that is a duplicate build; the cost of the alternative
 * is a base commit nothing builds, because a caller told not to dispatch
 * dispatches nothing.
 */
export const takeBaseWorkflowDispatchLease = async ({
  client,
  baseCommitSha,
  workflowId,
}: TakeBaseWorkflowDispatchLeaseOptions): Promise<boolean> => {
  try {
    const { data } = await client.post<{ shouldDispatch?: boolean }>(
      "github-cloud-replay/base-workflow-dispatch-lease",
      { baseCommitSha, workflowId },
    );
    // A 200 carrying something else — a proxy interstitial, a backend that
    // renamed the field — must not read as "someone else is dispatching". That
    // is the one answer that can leave the commit unbuilt, so require it to be
    // said outright.
    return data?.shouldDispatch !== false;
  } catch (error) {
    // Deliberately not enriched: `maybeEnrichFetchError` reads fields off the
    // error and would itself throw on a malformed one, which is exactly the
    // outcome this catch exists to rule out.
    initLogger().debug(
      `Could not take a dispatch lease for ${baseCommitSha}, so dispatching anyway`,
      error,
    );
    return true;
  }
};
