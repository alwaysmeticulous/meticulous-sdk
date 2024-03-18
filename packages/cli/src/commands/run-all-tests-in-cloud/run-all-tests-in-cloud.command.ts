import { getCommitSha, METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import { executeRemoteTestRun } from "@alwaysmeticulous/remote-replay-launcher";
import chalk from "chalk";
import cliProgress from "cli-progress";
import log from "loglevel";
import ora from "ora";
import { buildCommand } from "../../command-utils/command-builder";
import { OPTIONS } from "../../command-utils/common-options";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";

interface Options {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  appUrl: string;
}

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  appUrl,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const commitSha = await getCommitSha(commitSha_);

  if (!commitSha) {
    logger.error(
      "No commit sha found, you must be in a git repository or provide one with --commitSha"
    );
    process.exit(1);
  }

  const scheduledTestRunSpinner = ora("Starting test run execution").start();
  const progressBar = new cliProgress.SingleBar(
    {
      format: `Test Run execution progress |${chalk.cyan(
        "{bar}"
      )}| {percentage}% || {value}/{total} tests executed`,
    },
    cliProgress.Presets.shades_classic
  );

  try {
    const { testRun } = await executeRemoteTestRun({
      apiToken,
      commitSha,
      appUrl,

      onTunnelCreated: ({ url, basicAuthUser, basicAuthPassword }) => {
        logger.info(
          `\nExposing local service running at ${appUrl}: ${url}, user: ${basicAuthUser}, password: ${basicAuthPassword}`
        );
      },

      onTestRunCreated: (testRun) => {
        logger.info(`\nTest run created: ${testRun.url}`);
      },

      onProgressUpdate: (testRun) => {
        if (
          testRun.status === "Running" &&
          scheduledTestRunSpinner.isSpinning
        ) {
          scheduledTestRunSpinner.stop();

          const numTestCases = testRun.configData.testCases?.length || 0;

          if (numTestCases > 0) {
            progressBar.start(numTestCases, 0);
          }
        }

        if (progressBar.getTotal() > 0) {
          progressBar.update(testRun.resultData?.results?.length || 0);
        }
      },
      environment: "local",
    });
  } catch (error) {
    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    } else {
      throw error;
    }
  } finally {
    progressBar.update(progressBar.getTotal());

    progressBar.stop();
  }
};

export const runAllTestsInCloudCommand = buildCommand("run-all-tests-in-cloud")
  .details({ describe: "Run all replay test cases remotely" })
  .options({
    apiToken: OPTIONS.apiToken,
    commitSha: OPTIONS.commitSha,
    appUrl: {
      demandOption: true,
      string: true,
      description:
        "The URL to execute the tests against. This parameter is required.",
    },
  } as const)
  .handler(handler);
