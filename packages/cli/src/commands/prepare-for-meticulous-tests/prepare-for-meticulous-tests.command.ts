import { execSync } from "child_process";
import {
  createClient,
  getApiToken,
  getGitHubCloudReplayBaseTestRun,
} from "@alwaysmeticulous/client";
import { getCommitSha, initLogger } from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import log from "loglevel";
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

export const prepareForMeticulousTests = async ({
  apiToken,
  headCommit,
  triggerScript,
  logger,
}: {
  apiToken: string;
  headCommit: string;
  triggerScript: string;
  logger: log.Logger;
}) => {
  try {
    const client = createClient({ apiToken });

    // Non-Github-hosted projects are currently not supported
    const { baseTestRun, baseCommitSha, commitIsInPullRequest } =
      await getGitHubCloudReplayBaseTestRun({
        client,
        headCommitSha: headCommit,
      });

    if (baseTestRun !== null) {
      logger.log("Base test run already exists, no preparation needed");
      logger.log("✅ Preparation for Meticulous tests completed successfully");
      return;
    }

    if (!commitIsInPullRequest) {
      logger.log(
        `Base test run does not exist for commit '${baseCommitSha}', but this commit is not associated with any pull request. Skipping trigger script execution to prevent chain of test runs through Git history`,
      );
      logger.log("✅ Preparation for Meticulous tests completed successfully");
      return;
    }

    // We execute the trigger script only in case that the commit is in a pull request.
    // The reason is that otherwise we will start a chain of runs going back through all the Git history.
    logger.log(
      `Base test run doesn't exist and commit is associated with a pull request.`,
    );
    logger.log(
      `Executing trigger script: \`${triggerScript}\` on base commit \`${baseCommitSha}\``,
    );

    try {
      execSync(`${triggerScript} ${baseCommitSha}`, {
        stdio: "inherit",
        encoding: "utf8",
        env: {
          ...process.env,
          METICULOUS_DISABLE_RECURSIVE_TRIGGER: "true",
        },
      });
      logger.log("Trigger script executed successfully");
      Sentry.captureEvent({
        message: "Trigger script executed successfully",
        level: "info",
        tags: {
          command: "prepare-for-meticulous-tests",
          eventType: "trigger-script-executed",
        },
        extra: {
          triggerScript,
          baseCommitSha,
          headCommit,
        },
      });
      logger.log("✅ Preparation for Meticulous tests completed successfully");
    } catch (error) {
      logger.error(
        `Failed to execute trigger script \`${triggerScript} ${baseCommitSha}\`: ${error}`,
      );
      logger.log(
        "❌ Preparation for Meticulous tests failed, will continue without triggering a base",
      );
    }
  } catch (error) {
    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    } else {
      throw error;
    }
  }
};

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  headCommit,
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

  const headCommit_ = await getCommitSha(headCommit);
  if (!headCommit_) {
    logger.error(
      "No head commit sha found, you must be in a git repository or provide one with --headCommit",
    );
    process.exit(1);
  }

  await prepareForMeticulousTests({
    apiToken: apiToken_,
    headCommit: headCommit_,
    triggerScript,
    logger,
  });
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
        "Path to script that triggers the generation of a Meticulous test run on a specific commit in case base test run is not available. The script will be called with the commit SHA as an argument.",
    },
  } as const)
  .handler(handler);
