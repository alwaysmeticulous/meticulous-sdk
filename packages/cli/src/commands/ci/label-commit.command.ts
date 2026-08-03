import { COMMIT_LABEL_TYPES } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { labelCommitCore } from "./label-commit.core";
import type { LabelCommitOptions } from "./label-commit.types";

const handler = async (options: LabelCommitOptions): Promise<void> => {
  const logger = initLogger();
  const { commitSha, labels } = await labelCommitCore(options);
  logger.info(`Labelled commit ${commitSha} with: ${labels.join(", ")}`);
};

export const ciLabelCommitCommand: CommandModule<unknown, LabelCommitOptions> =
  {
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
