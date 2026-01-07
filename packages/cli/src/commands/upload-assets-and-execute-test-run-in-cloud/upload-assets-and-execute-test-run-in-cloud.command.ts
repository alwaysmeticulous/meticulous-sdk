import { AssetUploadMetadata } from "@alwaysmeticulous/api";
import { getCommitSha, initLogger } from "@alwaysmeticulous/common";
import { uploadAssetsAndTriggerTestRun } from "@alwaysmeticulous/remote-replay-launcher";
import * as Sentry from "@sentry/node";
import { buildCommand } from "../../command-utils/command-builder";
import { OPTIONS } from "../../command-utils/common-options";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";
import { waitForBase as waitForBaseTestRun } from "../../utils/wait-for-base.utils";
import { prepareForMeticulousTests } from "../prepare-for-meticulous-tests/prepare-for-meticulous-tests.command";

interface Options {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  appDirectory?: string | undefined;
  appZip?: string | undefined;
  rewrites?: string;
  waitForBase: boolean;
  hadPreparedForTests: boolean;
  triggerScript?: string | undefined;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  appDirectory,
  appZip,
  rewrites,
  waitForBase,
  hadPreparedForTests,
  triggerScript,
}) => {
  const logger = initLogger();
  const commitSha = await getCommitSha(commitSha_);

  if (!appDirectory && !appZip) {
    logger.error(
      "No app directory or app zip provided, you must provide one with --appDirectory or --appZip",
    );
    process.exit(1);
  }

  if (!commitSha) {
    logger.error(
      "No commit sha found, you must be in a git repository or provide one with --commitSha",
    );
    process.exit(1);
  }

  if (!hadPreparedForTests && triggerScript) {
    // If we have a script to trigger a run, this signals that the user is not sure whether the base test run is available.
    // In this case, we trigger the preparation for meticulous tests.
    // Do this only if we did not prepare for the tests.
    await prepareForMeticulousTests({
      apiToken: apiToken!,
      headCommit: commitSha,
      triggerScript,
      logger,
    });
  }

  if (hadPreparedForTests || triggerScript) {
    // If we prepared to run all tests in cloud, then we need to wait for base to be available.
    // The preprocessing step starts to compute base, but it might take some time to have it available.
    await waitForBaseTestRun({
      apiToken,
      commitSha,
      logger,
      commandName: "upload-assets-and-execute-test-run-in-cloud",
    });
  }

  logger.info(`Uploading build artifacts for commit ${commitSha}`);
  Sentry.captureMessage("Received upload assets request", {
    level: "debug",
    extra: {
      commitSha: commitSha,
    },
  });

  try {
    await uploadAssetsAndTriggerTestRun({
      apiToken,
      commitSha,
      appDirectory,
      appZip,
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
  rewritesString?: string,
): AssetUploadMetadata["rewrites"] => {
  const logger = initLogger();
  let parsedRewrites: unknown;
  try {
    parsedRewrites = JSON.parse(rewritesString ?? "[]");
  } catch (error) {
    logger.error(
      "Error: Could not parse --rewrites flag. Expected a valid JSON array string.",
    );
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }

  if (!Array.isArray(parsedRewrites)) {
    logger.error(
      "Error: Invalid --rewrites flag. Expected a valid JSON array string.",
    );
    process.exit(1);
  }

  const isValid = parsedRewrites.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof item.source === "string" &&
      typeof item.destination === "string",
  );

  if (!isValid) {
    logger.error(
      "Error: Invalid --rewrites flag. Each element in the array must be an object with 'source' and 'destination' string properties.",
    );
    logger.error(
      "See https://github.com/vercel/serve-handler?tab=readme-ov-file#rewrites-array for more details.",
    );
    process.exit(1);
  }

  return parsedRewrites as AssetUploadMetadata["rewrites"];
};

export const uploadAssetsAndExecuteTestRunInCloudCommand = buildCommand(
  "upload-assets-and-execute-test-run-in-cloud",
)
  .details({
    describe:
      "Upload build artifacts to Meticulous, potentially triggering a test run",
  })
  .options({
    apiToken: OPTIONS.apiToken,
    commitSha: OPTIONS.commitSha,
    appDirectory: {
      demandOption: false,
      string: true,
      description:
        "The directory containing the application's static assets. Either this or --appZip must be provided.",
    },
    appZip: {
      demandOption: false,
      string: true,
      description:
        "The zip file containing the application's static assets. Either this or --appDirectory must be provided.",
    },
    rewrites: {
      string: true,
      default: "[]",
      description:
        "URL rewrite rules. This string should be a valid JSON array in the format described at https://github.com/vercel/serve-handler?tab=readme-ov-file#rewrites-array." +
        ' Note: if no rules are passed, or an empty list is passed, we default to the rewrite rule \'{ source: "**", destination: "/index.html" }\'.',
    },
    waitForBase: {
      demandOption: false,
      boolean: true,
      default: true,
      description:
        "If true, the launcher will try to wait for a base test run to be created before triggering a test run. If that is not found, it will trigger a test run without waiting for a base test run.",
    },
    hadPreparedForTests: {
      boolean: true,
      description:
        "Enable in case you called `prepare-for-meticulous-tests` before running this command.",
      default: false,
    },
    triggerScript: {
      string: true,
      description:
        "Path to script that triggers the generation of a Meticulous test run on a specific commit in case base test run is not available. The script will be called with the commit SHA as an argument.",
      default: undefined,
    },
  } as const)
  .handler(handler);
