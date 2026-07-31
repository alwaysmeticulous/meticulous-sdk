import { maybeEnrichFetchError } from "../errors";
import type { MeticulousClient } from "../types/client.types";

/**
 * The commit label types the backend accepts. `not-relevant` marks a commit
 * as not affecting the app under test, so Meticulous may skip over it when
 * looking for a base test run to compare against.
 */
export const COMMIT_LABEL_TYPES = ["not-relevant"] as const;
export type CommitLabelType = (typeof COMMIT_LABEL_TYPES)[number];

export interface LabelCommitResponse {
  commitSha: string;
  labels: string[];
}

/**
 * Records labels against a commit. Idempotent: re-labelling a commit with the
 * same label is a no-op.
 */
export const labelCommit = async ({
  client,
  commitSha,
  labels,
}: {
  client: MeticulousClient;
  commitSha: string;
  labels: CommitLabelType[];
}): Promise<LabelCommitResponse> => {
  const { data } = await client
    .post("commit-labels", { commitSha, labels })
    .catch((error) => {
      throw maybeEnrichFetchError(error);
    });
  return data;
};
