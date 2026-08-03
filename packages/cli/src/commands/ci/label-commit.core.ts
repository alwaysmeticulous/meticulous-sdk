import { createClientWithOAuth, labelCommit } from "@alwaysmeticulous/client";
import { getCommitSha } from "@alwaysmeticulous/common";
import { CliUserError } from "../../utils/cli-user-error";
import { validateCommitLabels } from "./label-commit.utils";
import type {
  LabelCommitOptions,
  LabelCommitResult,
} from "./label-commit.types";

/**
 * Core of the `ci label-commit` command, extracted so it can also be called
 * directly from customer code (e.g. custom CI scripts).
 */
export const labelCommitCore = async ({
  apiToken,
  commitSha: commitSha_,
  labels: labels_,
}: LabelCommitOptions): Promise<LabelCommitResult> => {
  const labels = validateCommitLabels(labels_);

  const commitSha = await getCommitSha(commitSha_);
  if (!commitSha) {
    throw new CliUserError(
      "Could not determine a commit SHA. Pass --commitSha or run inside a git repository.",
    );
  }

  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  return labelCommit({ client, commitSha, labels });
};
