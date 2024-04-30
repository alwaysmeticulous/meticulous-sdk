import { IN_PROGRESS_TEST_RUN_STATUS } from "@alwaysmeticulous/client";
import {
  defer,
  getCommitSha,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import {
  executeRemoteTestRun,
  TunnelData,
} from "@alwaysmeticulous/remote-replay-launcher";
import chalk from "chalk";
import cliProgress from "cli-progress";
import log from "loglevel";
import ora from "ora";
import { buildCommand } from "../../command-utils/command-builder";
import { OPTIONS } from "../../command-utils/common-options";
import { Environment, getEnvironment } from "../../utils/environment.utils";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";

interface Options {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  appUrl: string;
  secureTunnelHost?: string | undefined;
  keepTunnelOpenSec: number;
}

const environmentToString: (environment: Environment) => string = (
  environment
) => {
  if (environment.isCI) {
    return `cli-ci-${environment.ci.name}`;
  }

  return "cli-local";
};

const handler: (options: Options) => Promise<void> = async ({
  apiToken,
  commitSha: commitSha_,
  appUrl,
  secureTunnelHost,
  keepTunnelOpenSec,
}) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const commitSha = await getCommitSha(commitSha_);

  if (!commitSha) {
    logger.error(
      "No commit sha found, you must be in a git repository or provide one with --commitSha"
    );
    process.exit(1);
  }

  logger.info(`Running all tests in cloud for commit ${commitSha}`);

  const scheduledTestRunSpinner = ora("Starting test run execution").start();
  const progressBar = new cliProgress.SingleBar(
    {
      format: `Test Run execution progress |${chalk.cyan(
        "{bar}"
      )}| {percentage}% || {value}/{total} tests executed`,
    },
    cliProgress.Presets.shades_classic
  );

  const endProgressBar = () => {
    progressBar.update(progressBar.getTotal());
    progressBar.stop();
  };

  const keepTunnelOpenPromise = keepTunnelOpenSec > 0 ? defer<void>() : null;

  // Tunnel data set after within the onTunnelCreated callback below.
  let tunnelData: TunnelData | null = null;
  try {
    const { testRun } = await executeRemoteTestRun({
      apiToken,
      commitSha,
      appUrl,

      secureTunnelHost,

      ...(keepTunnelOpenPromise
        ? { keepTunnelOpenPromise: keepTunnelOpenPromise.promise }
        : {}),

      onTunnelCreated: (data) => {
        tunnelData = data;
        logger.info(
          `\nExposing local service running at ${appUrl}: ${data.url} user: ${data.basicAuthUser} password: ${data.basicAuthPassword}`
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

        if (!IN_PROGRESS_TEST_RUN_STATUS.includes(testRun.status)) {
          endProgressBar();

          if (keepTunnelOpenPromise) {
            logger.info(
              `Keeping tunnel open for ${keepTunnelOpenSec} seconds...`
            );

            // tunnelData should be set in the onTunnelCreated callback.
            if (tunnelData) {
              logger.info(
                `Your app can be accessed from ${tunnelData.url} username: ${tunnelData.basicAuthUser} password: ${tunnelData.basicAuthPassword}`
              );
            }
            setTimeout(() => {
              keepTunnelOpenPromise.resolve();
            }, keepTunnelOpenSec * 1000);
          }
        }
      },
      environment: environmentToString(getEnvironment()),
    });
  } catch (error) {
    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    } else {
      throw error;
    }
  } finally {
    endProgressBar();
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
    keepTunnelOpenSec: {
      number: true,
      description:
        "Keep the tunnel open after test completion for the specified number of seconds. This is useful for debugging",
      default: 0,
    },
    secureTunnelHost: {
      string: true,
      description: "The host to use for the secure tunnel server.",
    },
  } as const)
  .handler(handler);
