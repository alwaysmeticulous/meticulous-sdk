import { AssetUploadMetadata } from "@alwaysmeticulous/api";
import {
  createClient,
  getApiToken,
  getTestRun,
  IN_PROGRESS_TEST_RUN_STATUS,
} from "@alwaysmeticulous/client";
import {
  getCommitSha,
  getGitDiff,
  getLocalBaseSha,
  hasUncommittedChanges,
  initLogger,
} from "@alwaysmeticulous/common";
import { uploadAssetsAndTriggerTestRun } from "@alwaysmeticulous/remote-replay-launcher";
import * as Sentry from "@sentry/node";
import { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";

const POLL_INTERVAL_MS = 10_000;

interface Options {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  baseSha?: string | undefined;
  gitDiffOutput?: string | undefined;
  repoDirectory?: string | undefined;
  appDirectory?: string | undefined;
  appZip?: string | undefined;
  rewrites?: string;
  waitForBase: boolean;
  waitForTestRunToComplete: boolean;
  dryRun?: boolean;
}

const handler = async ({
  apiToken,
  commitSha: commitSha_,
  baseSha: baseSha_,
  gitDiffOutput: gitDiffOutput_,
  repoDirectory,
  appDirectory,
  appZip,
  rewrites,
  waitForBase,
  waitForTestRunToComplete,
  dryRun,
}: Options): Promise<void> => {
  const logger = initLogger();

  if (!appDirectory && !appZip) {
    logger.error(
      "No app directory or app zip provided, you must provide one with --appDirectory or --appZip",
    );
    process.exit(1);
  }

  if (repoDirectory && (commitSha_ || baseSha_ || gitDiffOutput_)) {
    logger.error(
      "--repoDirectory cannot be combined with --commitSha, --baseSha, or --gitDiffOutput. " +
      "When --repoDirectory is provided, all git options are inferred automatically.",
    );
    process.exit(1);
  }

  if (gitDiffOutput_ && !baseSha_) {
    logger.error(
      "--gitDiffOutput requires --baseSha.",
    );
    process.exit(1);
  }

  let commitSha: string | undefined;
  let baseSha: string | undefined;
  let gitDiffOutput: string | undefined;

  let uncommitted = false;

  if (repoDirectory) {
    const gitOpts = { cwd: repoDirectory };

    commitSha = await getCommitSha(undefined, gitOpts);
    if (!commitSha) {
      logger.error(
        `Could not determine commit SHA from --repoDirectory: ${repoDirectory}`,
      );
      process.exit(1);
    }

    uncommitted = await hasUncommittedChanges(gitOpts);

    baseSha = (await getLocalBaseSha(gitOpts)) || undefined;

    if (baseSha) {
      if (uncommitted) {
        gitDiffOutput = await getGitDiff(baseSha, undefined, gitOpts);
        commitSha = commitSha + "-modified";
      } else {
        gitDiffOutput = await getGitDiff(baseSha, commitSha, gitOpts);
      }
    }
  } else {
    commitSha = await getCommitSha(commitSha_);
    if (!commitSha) {
      logger.error(
        "No commit SHA found. Provide one with --commitSha or use --repoDirectory.",
      );
      process.exit(1);
    }

    baseSha = baseSha_ || undefined;
    gitDiffOutput = gitDiffOutput_ || undefined;
  }

  if (repoDirectory) {
    logger.info(`Commit SHA inferred from repo${uncommitted ? " (uncommitted changes)" : ""}: ${commitSha}`);
  } else if (commitSha_) {
    logger.info(`Commit SHA provided: ${commitSha}`);
  } else {
    logger.info(`Commit SHA inferred from local repo: ${commitSha}`);
  }

  if (baseSha && baseSha === commitSha) {
    logger.info("Base SHA equals head SHA — nothing to test.");
    return;
  }

  if (baseSha) {
    logger.info(`Base SHA ${repoDirectory ? "inferred from merge-base" : "provided"}: ${baseSha}`);
  }
  if (gitDiffOutput) {
    logger.info(`Git diff output ${repoDirectory ? "computed" : "provided"}: ${gitDiffOutput.length} chars`);
  }

  logger.info(`Uploading build artifacts for commit ${commitSha}`);

  if (dryRun) {
    logger.info(
      `Dry run: would upload ${appDirectory ?? appZip} and trigger a test run for commit ${commitSha}${baseSha ? ` (base: ${baseSha})` : ""}`,
    );
    return;
  }

  Sentry.captureMessage("Received upload assets request", {
    level: "debug",
    extra: { commitSha },
  });

  let testRunId: string | null = null;

  try {
    const result = await uploadAssetsAndTriggerTestRun({
      apiToken,
      commitSha,
      ...(baseSha ? { baseSha } : {}),
      ...(gitDiffOutput ? { gitDiffOutput } : {}),
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
    logger.error("No API token found. Cannot wait for test run to complete.");
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

export const ciUploadAssetsCommand: CommandModule<unknown, Options> = {
  command: "upload-assets",
  describe:
    "Upload build artifacts to Meticulous, potentially triggering a test run",
  builder: {
    apiToken: OPTIONS.apiToken,
    commitSha: OPTIONS.commitSha,
    baseSha: {
      string: true,
      description:
        "The base commit SHA to compare against. Intended for custom test run triggers. Cannot be combined with --repoDirectory.",
    },
    gitDiffOutput: {
      demandOption: false,
      string: true,
      description:
        "Raw git diff output between the base and head commits. Requires --baseSha. Cannot be combined with --repoDirectory.",
    },
    repoDirectory: {
      string: true,
      description:
        "The path to a git repository. Intended for custom test run triggers. " +
        "Automatically infers --commitSha, --baseSha, and --gitDiffOutput from the repo. " +
        "Cannot be combined with --commitSha, --baseSha, or --gitDiffOutput.",
    },
    appDirectory: {
      string: true,
      description:
        "The directory containing the application's static assets. Either this or --appZip must be provided.",
    },
    appZip: {
      string: true,
      description:
        "The zip file containing the application's static assets. Either this or --appDirectory must be provided.",
    },
    rewrites: {
      string: true,
      default: "[]",
      description:
        "URL rewrite rules. This string should be a valid JSON array in the format described at https://github.com/vercel/serve-handler?tab=readme-ov-file#rewrites-array." +
        " Note: if no rules are passed, or an empty list is passed, we default to the rewrite rule '{ source: \"**\", destination: \"/index.html\" }'.",
    },
    waitForBase: {
      boolean: true,
      default: true,
      description:
        "If true, the launcher will try to wait for a base test run to be created before triggering a test run.",
    },
    waitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "If true, block and wait until the triggered test run is complete, then report results. Implies --waitForBase.",
    },
  },
  handler: wrapHandler(handler),
};
