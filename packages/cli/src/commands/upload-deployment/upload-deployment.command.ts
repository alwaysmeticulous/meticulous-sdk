import { getCommitSha, METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { uploadAssetsToS3AndTriggerTestRun } from "@alwaysmeticulous/remote-replay-launcher";
import log from "loglevel";
import { buildCommand } from "../../command-utils/command-builder";
import { OPTIONS } from "../../command-utils/common-options";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";

interface Options {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  appDirectory: string;
  rewrites?: string;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  appDirectory,
  rewrites,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const commitSha = await getCommitSha(commitSha_);

  if (!commitSha) {
    logger.error(
      "No commit sha found, you must be in a git repository or provide one with --commitSha"
    );
    process.exit(1);
  }

  logger.info(`Uploading deployment for commit ${commitSha}`);

  try {
    await uploadAssetsToS3AndTriggerTestRun({
      apiToken,
      commitSha,
      appDirectory,
      rewrites: JSON.parse(rewrites ?? "[]"),
    });
  } catch (error) {
    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    } else {
      throw error;
    }
  }
};

export const uploadDeploymentCommand = buildCommand("upload-deployment")
  .details({
    describe:
      "Upload a deployment to Meticulous, potentially triggering a test run",
  })
  .options({
    apiToken: OPTIONS.apiToken,
    commitSha: OPTIONS.commitSha,
    appDirectory: {
      demandOption: true,
      string: true,
      description: "The directory containing the application's static assets",
    },
    rewrites: {
      string: true,
      default: "[]",
      description:
        "URL rewrite rules. This string should be a valid JSON array in the format described at https://github.com/vercel/serve-handler?tab=readme-ov-file#rewrites-array",
    },
  } as const)
  .handler(handler);
