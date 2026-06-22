import {
  createClient,
  getTestRun,
  IN_PROGRESS_TEST_RUN_STATUS,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { uploadAssetsAndTriggerTestRun } from "@alwaysmeticulous/remote-replay-launcher";
import * as Sentry from "@sentry/node";
import type { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { parseRewrites } from "../../command-utils/parse-rewrites";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";
import { resolveProjectIdentifier } from "../../utils/resolve-project-identifier";
import {
  hasGitContextForTestRunWait,
  resolveGitOptions,
} from "./resolve-git-options";

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

  if (
    waitForTestRunToComplete &&
    !hasGitContextForTestRunWait(repoDirectory, baseSha_, gitDiffOutput_)
  ) {
    logger.error(
      "--waitForTestRunToComplete is only for runs from a local branch checkout: pass --repoDirectory " +
        "(path to your clone on the branch under test) or both --baseSha and --gitDiffOutput from that branch. " +
        "If you only pass --commitSha you are not on a branch checkout — omit this flag.",
    );
    process.exit(1);
  }

  const { commitSha, baseSha, gitDiffOutput, withUncommittedChanges } =
    await resolveGitOptions({
      commitSha: commitSha_,
      baseSha: baseSha_,
      gitDiffOutput: gitDiffOutput_,
      repoDirectory,
    });

  if (baseSha && baseSha === commitSha && !gitDiffOutput) {
    logger.info(
      "Base SHA equals head SHA and no git diff output provided — nothing to test. " +
        "If you have uncommitted changes, provide --gitDiffOutput or use --repoDirectory.",
    );
    return;
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

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const projectIdentifier = resolveProjectIdentifier(apiToken_);

  let testRunId: string | null;

  try {
    const result = await uploadAssetsAndTriggerTestRun({
      apiToken: apiToken_,
      commitSha,
      ...(baseSha ? { baseSha } : {}),
      ...(gitDiffOutput ? { gitDiffOutput } : {}),
      ...(withUncommittedChanges ? { withUncommittedChanges } : {}),
      appDirectory,
      appZip,
      rewrites: parseRewrites(rewrites),
      waitForBase: waitForBase || waitForTestRunToComplete,
      ...projectIdentifier,
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

  const client = createClient({ apiToken: apiToken_ });

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
        ' Note: if no rules are passed, or an empty list is passed, we default to the rewrite rule \'{ source: "**", destination: "/index.html" }\'.',
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
        "If true, block until the triggered test run finishes. Only for Meticulous runs tied to a local branch: " +
        "requires --repoDirectory (your clone on that branch) or both --baseSha and --gitDiffOutput from it. Implies --waitForBase.",
    },
  },
  handler: wrapHandler(handler),
};
