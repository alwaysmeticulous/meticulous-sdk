import { AssetUploadMetadata } from "@alwaysmeticulous/api";
import {
  createClient,
  getApiToken,
  getTestRun,
  IN_PROGRESS_TEST_RUN_STATUS,
} from "@alwaysmeticulous/client";
import {
  getCommitSha,
  getLocalBaseSha,
  initLogger,
} from "@alwaysmeticulous/common";
import { uploadAssetsAndTriggerTestRun } from "@alwaysmeticulous/remote-replay-launcher";
import * as Sentry from "@sentry/node";
import { buildCommand } from "../../command-utils/command-builder";
import { OPTIONS } from "../../command-utils/common-options";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";

const POLL_INTERVAL_MS = 10_000;

interface Options {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  baseSha?: string | undefined;
  repoDirectory?: string | undefined;
  appDirectory?: string | undefined;
  appZip?: string | undefined;
  rewrites?: string;
  waitForBase: boolean;
  waitForTestRunToComplete: boolean;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  baseSha: baseSha_,
  repoDirectory,
  appDirectory,
  appZip,
  rewrites,
  waitForBase,
  waitForTestRunToComplete,
}) => {
  const logger = initLogger();
  const gitOpts = repoDirectory ? { cwd: repoDirectory } : undefined;
  const commitSha = await getCommitSha(commitSha_, gitOpts);

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

  const baseSha = baseSha_ || (repoDirectory
    ? await getLocalBaseSha(gitOpts)
    : undefined) || undefined;

  if (baseSha && baseSha === commitSha) {
    logger.info(
      "Base SHA equals head SHA — nothing to test.",
    );
    return;
  }

  logger.info(`Uploading build artifacts for commit ${commitSha}`);
  if (baseSha) {
    logger.info(`Base SHA: ${baseSha}`);
  }

  Sentry.captureMessage("Received upload assets request", {
    level: "debug",
    extra: {
      commitSha,
    },
  });

  let testRunId: string | null = null;

  try {
    const result = await uploadAssetsAndTriggerTestRun({
      apiToken,
      commitSha,
      ...(baseSha ? { baseSha } : {}),
      appDirectory,
      appZip,
      rewrites: parseRewrites(rewrites),
      waitForBase: waitForBase || waitForTestRunToComplete,
    });
    testRunId = result.testRun?.id ?? null;
  } catch (error) {
    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    } else {
      throw error;
    }
  }

  if (!waitForTestRunToComplete || !testRunId) {
    return;
  }

  const apiTokenToUse = getApiToken(apiToken);
  if (!apiTokenToUse) {
    logger.error(
      "No API token found. Cannot wait for test run to complete.",
    );
    process.exit(1);
  }
  const client = createClient({ apiToken: apiTokenToUse });

  logger.info(`Waiting for test run ${testRunId} to complete...`);

  let completedTestRun = await getTestRun({ client, testRunId });
  while (IN_PROGRESS_TEST_RUN_STATUS.includes(completedTestRun.status)) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    completedTestRun = await getTestRun({ client, testRunId });
    logger.info(`Test run status: ${completedTestRun.status}`);
  }

  logger.info(
    `Test run ${testRunId} finished with status: ${completedTestRun.status}`,
  );
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
    baseSha: {
      demandOption: false,
      string: true,
      description:
        "The base commit SHA to compare against. If not provided, inferred from --repoDirectory via merge-base with origin/main.",
    },
    repoDirectory: {
      demandOption: false,
      string: true,
      description:
        "The path to the git repository to use for auto-detecting --commitSha and the base SHA. " +
        "Defaults to the current working directory.",
    },
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
    waitForTestRunToComplete: {
      demandOption: false,
      boolean: true,
      default: false,
      description:
        "If true, block and wait until the triggered test run is complete, then report results. Implies --waitForBase.",
    },
  } as const)
  .handler(handler);
