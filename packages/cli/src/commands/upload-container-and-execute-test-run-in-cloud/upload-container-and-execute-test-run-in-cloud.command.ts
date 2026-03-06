import {
  ContainerEnvVariable,
  createClient,
  getApiToken,
  getTestRun,
  IN_PROGRESS_TEST_RUN_STATUS,
} from "@alwaysmeticulous/client";
import {
  getCommitSha,
  getLocalBaseSha,
  hasUncommittedChanges,
  initLogger,
} from "@alwaysmeticulous/common";
import { uploadContainer } from "@alwaysmeticulous/remote-replay-launcher";
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
  repoDirectory?: string | undefined;
  localImageTag: string;
  waitForBase: boolean;
  waitForTestRunToComplete: boolean;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  repoDirectory,
  localImageTag,
  waitForBase,
  waitForTestRunToComplete,
  containerPort,
  containerEnv,
}) => {
  const logger = initLogger();
  const gitOpts = repoDirectory ? { cwd: repoDirectory } : undefined;
  const commitSha = await getCommitSha(commitSha_, gitOpts);

  if (!commitSha) {
    logger.error(
      "No commit sha found, you must be in a git repository or provide one with --commitSha",
    );
    process.exit(1);
  }

  const baseSha = repoDirectory
    ? await getLocalBaseSha(gitOpts)
    : undefined;

  if (repoDirectory) {
    const hasChanges = await hasUncommittedChanges(gitOpts);
    if (hasChanges) {
      logger.warn(
        "You have uncommitted changes. Please commit your changes before uploading.",
      );
      process.exit(1);
    }

    if (baseSha && baseSha === commitSha) {
      logger.info(
        "Base SHA equals head SHA — nothing to test.",
      );
      return;
    }
  }

  logger.info(
    `Uploading Docker container ${localImageTag} for commit ${commitSha}`,
  );
  if (baseSha) {
    logger.info(`Base SHA: ${baseSha}`);
  }

  Sentry.captureMessage("Received upload container request", {
    level: "debug",
    extra: {
      commitSha,
      localImageTag,
    },
  });

  let testRunId: string | null = null;

  try {
    const result = await uploadContainer({
      apiToken,
      localImageTag,
      commitSha,
      ...(baseSha ? { baseSha } : {}),
      waitForBase: waitForBase || waitForTestRunToComplete,
      containerPort,
      containerEnv,
    });
    testRunId = result.testRun?.id ?? null;

    if (!result.testRun) {
      logger.warn("Container upload complete but test run not created");
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

export const uploadContainerAndExecuteTestRunInCloudCommand = buildCommand(
  "upload-container-and-execute-test-run-in-cloud",
)
  .details({
    describe:
      "Upload a Docker container to Meticulous and trigger a test run against it",
  })
  .options({
    apiToken: OPTIONS.apiToken,
    commitSha: OPTIONS.commitSha,
    repoDirectory: {
      demandOption: false,
      string: true,
      default: ".",
      description:
        "The path to the git repository to use for auto-detecting --commitSha and the base SHA. " +
        "Defaults to the current working directory.",
    },
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
    waitForTestRunToComplete: {
      demandOption: false,
      boolean: true,
      default: false,
      description:
        "If true, block and wait until the triggered test run is complete, then report results. Implies --waitForBase.",
    },
    containerPort: {
      demandOption: false,
      number: true,
      description: "The port to expose the container on.",
    },
    containerEnv: {
      demandOption: false,
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
  } as const)
  .handler(handler);
