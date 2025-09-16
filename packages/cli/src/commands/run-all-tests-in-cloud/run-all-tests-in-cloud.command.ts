import { SessionRelevance } from "@alwaysmeticulous/api";
import { IN_PROGRESS_TEST_RUN_STATUS } from "@alwaysmeticulous/client";
import { defer, getCommitSha, initLogger } from "@alwaysmeticulous/common";
import {
  executeRemoteTestRun,
  TunnelData,
} from "@alwaysmeticulous/remote-replay-launcher";
import chalk from "chalk";
import cliProgress from "cli-progress";
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
  allowInvalidCert: boolean;
  proxyAllUrls: boolean;
  rewriteHostnameToAppUrl: boolean;
  enableDnsCache: boolean;
  http2Connections?: number | undefined;
  companionAssetsFolder?: string | undefined;
  companionAssetsRegex?: string | undefined;
}

const environmentToString: (environment: Environment) => string = (
  environment,
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
  allowInvalidCert,
  proxyAllUrls,
  rewriteHostnameToAppUrl,
  enableDnsCache,
  http2Connections,
  companionAssetsFolder,
  companionAssetsRegex,
}) => {
  const logger = initLogger();
  const commitSha = await getCommitSha(commitSha_);

  if (!!companionAssetsFolder !== !!companionAssetsRegex) {
    logger.error(
      "You must provide both --companionAssetsFolder and --companionAssetsRegex, or neither",
    );
    process.exit(1);
  }

  if (!commitSha) {
    logger.error(
      "No commit sha found, you must be in a git repository or provide one with --commitSha",
    );
    process.exit(1);
  }

  logger.info(`Running all tests in cloud for commit ${commitSha}`);

  let scheduledTestRunSpinner: ora.Ora | null = ora(
    "Starting test run execution",
  ).start();
  const progressBar = new cliProgress.SingleBar(
    {
      format: `Test Run execution progress |${chalk.cyan(
        "{bar}",
      )}| {percentage}% || {value}/{total} tests executed`,
      // We want to still output progress even if not connected to a interactive tty since some CI runners
      // such as CircleCI will timeout the process early if it hasn't outputted anything for a while.
      // You can test this by running:
      //  `yarn cli:dev run-all-tests-in-cloud --appUrl <your app URL> --commitSha <a valid commit SHA> 2>&1 | cat`
      noTTYOutput: true,
      notTTYSchedule: 30000,
    },
    cliProgress.Presets.shades_classic,
  );

  const endProgressBar = () => {
    progressBar.update(progressBar.getTotal());
    progressBar.stop();
  };

  const keepTunnelOpenPromise = keepTunnelOpenSec > 0 ? defer<void>() : null;

  // Tunnel data set after within the onTunnelCreated callback below.
  let lastPrintedStillSchedulingMessage = Date.now();
  let tunnelData: TunnelData | null = null;
  try {
    const environment = getEnvironment();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
          `\nExposing local service running at ${appUrl}: ${data.url} user: ${data.basicAuthUser} password: ${data.basicAuthPassword}`,
        );
      },

      onTestRunCreated: (testRun) => {
        logger.info(`\nTest run created: ${testRun.url}`);
      },

      onProgressUpdate: (testRun) => {
        if (
          testRun.status === "Scheduled" &&
          Date.now() - lastPrintedStillSchedulingMessage > 30_000
        ) {
          logger.info(
            "Still waiting for test runner to pick up scheduled run...",
          );
          lastPrintedStillSchedulingMessage = Date.now();
        }

        const nonRelevantSessionIds = new Set(
          testRun.configData.testCases
            ?.filter(
              (testCase) =>
                testCase.relevanceToPR === SessionRelevance.NotRelevant,
            )
            .map((testCase) => testCase.sessionId) ?? [],
        );

        // Note we can't just check 'scheduledTestRunSpinner.isSpinning' because it won't spin
        // if connected to a non-tty terminal.
        if (testRun.status === "Running" && scheduledTestRunSpinner) {
          scheduledTestRunSpinner.stop();
          scheduledTestRunSpinner = null;

          const numTestCases = testRun.configData.testCases?.length || 0;

          if (numTestCases > 0) {
            progressBar.start(numTestCases, nonRelevantSessionIds.size);
          }
        }

        if (progressBar.getTotal() > 0) {
          progressBar.update(
            (testRun.resultData?.results?.length || 0) +
              nonRelevantSessionIds.size,
          );
        }

        if (!IN_PROGRESS_TEST_RUN_STATUS.includes(testRun.status)) {
          endProgressBar();

          if (keepTunnelOpenPromise) {
            logger.info(
              `Keeping tunnel open for ${keepTunnelOpenSec} seconds...`,
            );

            // tunnelData should be set in the onTunnelCreated callback.
            if (tunnelData) {
              logger.info(
                `Your app can be accessed from ${tunnelData.url} username: ${tunnelData.basicAuthUser} password: ${tunnelData.basicAuthPassword}`,
              );
            }
            setTimeout(() => {
              keepTunnelOpenPromise.resolve();
            }, keepTunnelOpenSec * 1000);
          }
        }
      },

      onTunnelStillLocked: () => {
        logger.info(
          "Keeping tunnel open while additional tasks using it run on the Meticulous platform...",
        );
      },

      environment: environmentToString(environment),
      isLockable: environment.isCI,
      allowInvalidCert,
      proxyAllUrls,
      rewriteHostnameToAppUrl,
      enableDnsCache,
      http2Connections,
      ...(companionAssetsFolder && companionAssetsRegex
        ? {
            companionAssets: {
              folder: companionAssetsFolder,
              regex: companionAssetsRegex,
            },
          }
        : {}),
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
    allowInvalidCert: {
      boolean: true,
      description: "Allow the tunnel to accept invalid certificates.",
      default: false,
    },
    proxyAllUrls: {
      boolean: true,
      description:
        "Allow all URLs to be proxied to rather than just the app URL.",
      default: false,
    },
    rewriteHostnameToAppUrl: {
      boolean: true,
      description:
        "Rewrite the hostname of any requests sent through the tunnel to the app URL.",
      default: false,
    },
    enableDnsCache: {
      boolean: true,
      description:
        "Enable DNS caching, this is recommended if the tunnel will be making requests to a non-localhost domain",
      default: false,
    },
    http2Connections: {
      number: true,
      description:
        "Number of HTTP2 connections to establish for multiplexing (defaults to number of CPU cores)",
    },
    companionAssetsFolder: {
      string: true,
      description: "The folder to serve the companion assets from.",
      default: undefined,
    },
    companionAssetsRegex: {
      string: true,
      description: "The regex to match the companion assets.",
      default: undefined,
    },
  } as const)
  .handler(handler);
