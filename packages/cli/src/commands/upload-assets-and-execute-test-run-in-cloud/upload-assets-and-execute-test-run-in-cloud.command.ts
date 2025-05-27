import { AssetUploadMetadata } from "@alwaysmeticulous/api";
import { getCommitSha, METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { uploadAssetsAndTriggerTestRun } from "@alwaysmeticulous/remote-replay-launcher";
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
  waitForBase: boolean;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  appDirectory,
  rewrites,
  waitForBase,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const commitSha = await getCommitSha(commitSha_);

  if (!commitSha) {
    logger.error(
      "No commit sha found, you must be in a git repository or provide one with --commitSha"
    );
    process.exit(1);
  }

  logger.info(`Uploading build artifacts for commit ${commitSha}`);

  try {
    await uploadAssetsAndTriggerTestRun({
      apiToken,
      commitSha,
      appDirectory,
      rewrites: parseRewrites(rewrites),
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

const parseRewrites = (
  rewritesString?: string
): AssetUploadMetadata["rewrites"] => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  let parsedRewrites: unknown;
  try {
    parsedRewrites = JSON.parse(rewritesString ?? "[]");
  } catch (error) {
    logger.error(
      "Error: Could not parse --rewrites flag. Expected a valid JSON array string."
    );
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }

  if (!Array.isArray(parsedRewrites)) {
    logger.error(
      "Error: Invalid --rewrites flag. Expected a valid JSON array string."
    );
    process.exit(1);
  }

  const isValid = parsedRewrites.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof item.source === "string" &&
      typeof item.destination === "string"
  );

  if (!isValid) {
    logger.error(
      "Error: Invalid --rewrites flag. Each element in the array must be an object with 'source' and 'destination' string properties."
    );
    logger.error(
      "See https://github.com/vercel/serve-handler?tab=readme-ov-file#rewrites-array for more details."
    );
    process.exit(1);
  }

  return parsedRewrites as AssetUploadMetadata["rewrites"];
};

export const uploadAssetsAndExecuteTestRunInCloudCommand = buildCommand(
  "upload-assets-and-execute-test-run-in-cloud"
)
  .details({
    describe:
      "Upload build artifacts to Meticulous, potentially triggering a test run",
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
        "URL rewrite rules. This string should be a valid JSON array in the format described at https://github.com/vercel/serve-handler?tab=readme-ov-file#rewrites-array."
        + " Note: we always include the rewrite rule '{ source: \"**\", destination: \"/index.html\" }' by default, in addition to any rules you pass.",
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
