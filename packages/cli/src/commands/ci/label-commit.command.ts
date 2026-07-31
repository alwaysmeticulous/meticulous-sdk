import {
  COMMIT_LABEL_TYPES,
  createClientWithOAuth,
  labelCommit,
} from "@alwaysmeticulous/client";
import { getCommitSha, initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { validateCommitLabels } from "./label-commit.utils";

interface Options {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  labels: string[];
}

const handler = async ({
  apiToken,
  commitSha: commitSha_,
  labels: labels_,
}: Options): Promise<void> => {
  const logger = initLogger();

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

  await labelCommit({ client, commitSha, labels });
  logger.info(`Labelled commit ${commitSha} with: ${labels.join(", ")}`);
};

export const ciLabelCommitCommand: CommandModule<unknown, Options> = {
  command: "label-commit",
  describe:
    "Attach labels to a commit. Labelling a commit as 'not-relevant' tells Meticulous the commit doesn't affect the app under test, " +
    "so it can be skipped when searching for a base test run to compare against.",
  builder: {
    apiToken: OPTIONS.apiToken,
    commitSha: {
      string: true,
      description:
        "The commit to label. Defaults to the current git HEAD when omitted.",
    },
    labels: {
      array: true,
      string: true,
      demandOption: true,
      description: `The labels to attach to the commit. Supported labels: ${COMMIT_LABEL_TYPES.join(", ")}.`,
    },
  },
  handler: wrapHandler(handler),
};
