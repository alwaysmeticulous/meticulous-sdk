import {
  ContainerEnvVariable,
  createClientWithOAuth,
  getTestRun,
  IN_PROGRESS_TEST_RUN_STATUS,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { uploadContainer } from "@alwaysmeticulous/remote-replay-launcher";
import * as Sentry from "@sentry/node";
import { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";
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
  localImageTag: string;
  waitForBase: boolean;
  waitForTestRunToComplete: boolean;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
  containerHealthCheckEndpoint?: string | undefined;
  dryRun?: boolean;
}

const handler = async ({
  apiToken,
  commitSha: commitSha_,
  baseSha: baseSha_,
  gitDiffOutput: gitDiffOutput_,
  repoDirectory,
  localImageTag,
  waitForBase,
  waitForTestRunToComplete,
  containerPort,
  containerEnv,
  containerHealthCheckEndpoint,
  dryRun,
}: Options): Promise<void> => {
  const logger = initLogger();

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

  const { commitSha, baseSha, gitDiffOutput, withUncommittedChanges } = await resolveGitOptions({
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

  logger.info(`Uploading Docker container ${localImageTag} for commit ${commitSha}`);

  if (dryRun) {
    logger.info(
      `Dry run: would push container image "${localImageTag}" and trigger a test run for commit ${commitSha}${baseSha ? ` (base: ${baseSha})` : ""}`,
    );
    return;
  }

  Sentry.captureMessage("Received upload container request", {
    level: "debug",
    extra: { commitSha, localImageTag },
  });

  const resolvedApiToken = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  let testRunId: string | null;

  try {
    const result = await uploadContainer({
      apiToken: resolvedApiToken,
      localImageTag,
      commitSha,
      ...(baseSha ? { baseSha } : {}),
      ...(gitDiffOutput ? { gitDiffOutput } : {}),
      ...(withUncommittedChanges ? { withUncommittedChanges } : {}),
      waitForBase: waitForBase || waitForTestRunToComplete,
      containerPort,
      containerEnv,
      containerHealthCheckEndpoint,
    });
    testRunId = result.testRun?.id ?? null;

    if (!result.testRun) {
      throw new Error(
        `${result.message ?? "Container upload complete but test run not created"}`,
      );
    }
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

  const client = await createClientWithOAuth({
    apiToken: resolvedApiToken,
    enableOAuthLogin: true,
  });

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

export const ciUploadContainerCommand: CommandModule<unknown, Options> = {
  command: "upload-container",
  describe:
    "Upload a Docker container to Meticulous and trigger a test run against it",
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
    localImageTag: {
      demandOption: true,
      string: true,
      description:
        "The local Docker image tag to upload (e.g., 'myapp:latest' or image SHA)",
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
    containerPort: {
      number: true,
      description: "The port to expose the container on.",
    },
    containerEnv: {
      array: true,
      coerce: (value: string[]) =>
        value.map((v) => {
          const [name, ...rest] = v.split("=");
          const envValue = rest.join("=");
          if (!name || !envValue) {
            throw new Error(`Invalid environment variable: ${v}`);
          }
          return { name, value: envValue };
        }),
      description: "The environment variables to set in the container.",
    },
    containerHealthCheckEndpoint: {
      string: true,
      description:
        "The endpoint path to use for health checks on the container (e.g., '/health').",
    },
  },
  handler: wrapHandler(handler),
};
