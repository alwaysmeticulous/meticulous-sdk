import { getCommitSha, initLogger } from "@alwaysmeticulous/common";
import { uploadContainerAndTriggerTestRun } from "@alwaysmeticulous/remote-replay-launcher";
import * as Sentry from "@sentry/node";
import { buildCommand } from "../../command-utils/command-builder";
import { OPTIONS } from "../../command-utils/common-options";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";

interface Options {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  localImageTag: string;
  waitForBase: boolean;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  localImageTag,
  waitForBase,
}) => {
  const logger = initLogger();
  const commitSha = await getCommitSha(commitSha_);

  if (!commitSha) {
    logger.error(
      "No commit sha found, you must be in a git repository or provide one with --commitSha"
    );
    process.exit(1);
  }

  logger.info(
    `Uploading Docker container ${localImageTag} for commit ${commitSha}`
  );
  Sentry.captureMessage("Received upload container request", {
    level: "debug",
    extra: {
      commitSha: commitSha,
      localImageTag: localImageTag,
    },
  });

  try {
    await uploadContainerAndTriggerTestRun({
      apiToken,
      localImageTag,
      commitSha,
      waitForBase,
    });
  } catch (error) {
    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    } else {
      throw error;
    }
  }
};

export const uploadContainerAndExecuteTestRunInCloudCommand = buildCommand(
  "upload-container-and-execute-test-run-in-cloud"
)
  .details({
    describe:
      "Upload a Docker container to Meticulous and trigger a test run against it",
  })
  .options({
    apiToken: OPTIONS.apiToken,
    commitSha: OPTIONS.commitSha,
    localImageTag: {
      demandOption: true,
      string: true,
      description:
        "The local Docker image tag to upload (e.g., 'myapp:latest' or image SHA)",
    },
    waitForBase: {
      demandOption: false,
      boolean: true,
      default: true,
      description:
        "If true, the launcher will try to wait for a base test run to be created before triggering a test run. If that is not found, it will trigger a test run without waiting for a base test run.",
    },
  } as const)
  .handler(handler);
