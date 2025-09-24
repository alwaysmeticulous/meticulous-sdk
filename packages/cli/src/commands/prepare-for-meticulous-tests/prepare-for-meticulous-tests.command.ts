import { execSync } from "child_process";
import {
  createClient,
  getApiToken,
  getGitHubCloudReplayBaseTestRun,
} from "@alwaysmeticulous/client";
import { getCommitSha, initLogger } from "@alwaysmeticulous/common";
import { buildCommand } from "../../command-utils/command-builder";
import { OPTIONS } from "../../command-utils/common-options";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";

interface Options {
  apiToken?: string | null | undefined;
  headCommit: string | null | undefined;
  triggerScript: string;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  headCommit: headCommit_,
  triggerScript,
}) => {
  const logger = initLogger();

  const apiToken_ = getApiToken(apiToken);
  if (!apiToken_) {
    logger.error(
      "You must provide an API token by using the --apiToken parameter",
    );
    process.exit(1);
  }

  const headCommit = await getCommitSha(headCommit_);
  if (!headCommit) {
    logger.error(
      "No head commit sha found, you must be in a git repository or provide one with --headCommit",
    );
    process.exit(1);
  }

  try {
    const client = createClient({ apiToken: apiToken_ });

    // Non-Github-hosted projects are currently not supported
    const cloudReplayBaseTestRun = await getGitHubCloudReplayBaseTestRun({
      client,
      headCommitSha: headCommit,
    });

    if (cloudReplayBaseTestRun.baseTestRun === null) {
      // Execute trigger script with the commit SHA
      logger.log(
        `Base test run doesn't exist. Executing trigger script: \`${triggerScript}\` on base commit \`${cloudReplayBaseTestRun.baseCommitSha}\``,
      );
      try {
        execSync(`${triggerScript} ${cloudReplayBaseTestRun.baseCommitSha}`, {
          stdio: "inherit",
          encoding: "utf8",
        });
        logger.log("Trigger script executed successfully");
      } catch (error) {
        logger.error(
          `Failed to execute trigger script \`${triggerScript} ${cloudReplayBaseTestRun.baseCommitSha}\`: ${error}`,
        );
        throw error;
      }
    }
  } catch (error) {
    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    } else {
      throw error;
    }
  }
};

export const prepareForMeticulousTestsCommand = buildCommand(
  "prepare-for-meticulous-tests",
)
  .details({
    describe:
      "Prepare for Meticulous tests. If necessary, triggers the generation of a test run on the base commit against which `headCommit` will be tested against.",
  })
  .options({
    apiToken: {
      ...OPTIONS.apiToken,
    },
    headCommit: {
      string: true,
      description:
        "The head commit SHA on which the tests will be executed against.",
    },
    triggerScript: {
      string: true,
      required: true,
      description:
        "Path to script that triggers the generation of a Meticulous test run on a specific commit. The script will be called with the commit SHA as an argument.",
    },
  } as const)
  .handler(handler);
