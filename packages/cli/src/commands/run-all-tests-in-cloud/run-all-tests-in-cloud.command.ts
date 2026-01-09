import { SessionRelevance } from "@alwaysmeticulous/api";
import {
  createClient,
  getApiToken,
  getGitHubCloudReplayBaseTestRun,
  IN_PROGRESS_TEST_RUN_STATUS,
} from "@alwaysmeticulous/client";
import { defer, getCommitSha, initLogger } from "@alwaysmeticulous/common";
import {
  executeRemoteTestRun,
  TunnelData,
} from "@alwaysmeticulous/remote-replay-launcher";
import * as Sentry from "@sentry/node";
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
import { prepareForMeticulousTests } from "../prepare-for-meticulous-tests/prepare-for-meticulous-tests.command";

const POLL_FOR_BASE_TEST_RUN_INTERVAL_MS = 10_000;
const POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

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
  companionAssetsZip?: string | undefined;
  companionAssetsRegex?: string | undefined;
  hadPreparedForTests: boolean;
  triggerScript?: string | undefined;
  postComment?: boolean | undefined;
  redactPassword?: boolean | undefined;
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
  companionAssetsZip,
  companionAssetsRegex,
  hadPreparedForTests,
  triggerScript,
  postComment,
  redactPassword,
}) => {
  const logger = initLogger();
  const commitSha = await getCommitSha(commitSha_);

  if (!!companionAssetsFolder && !!companionAssetsZip) {
    logger.error(
      "You cannot provide both --companionAssetsFolder and --companionAssetsZip. Please provide only one.",
    );
    process.exit(1);
  }

  const hasCompanionAssets = !!companionAssetsFolder || !!companionAssetsZip;
  if (hasCompanionAssets !== !!companionAssetsRegex) {
    logger.error(
      "You must provide both --companionAssetsFolder/--companionAssetsZip and --companionAssetsRegex, or neither",
    );
    process.exit(1);
  }

  if (!commitSha) {
    logger.error(
      "No commit sha found, you must be in a git repository or provide one with --commitSha",
    );
    process.exit(1);
  }

  const apiToken_ = getApiToken(apiToken);
  if (!apiToken_) {
    logger.error(
      "You must provide an API token by using the --apiToken parameter",
    );
    process.exit(1);
  }

  if (!hadPreparedForTests && triggerScript) {
    // If we have a script to trigger a run, this signals that the user is not sure whether the base test run is available.
    // In this case, we trigger the preparation for meticulous tests.
    // Do this only if we did not prepare for the tests.
    await prepareForMeticulousTests({
      apiToken: apiToken_,
      headCommit: commitSha,
      triggerScript,
      logger,
    });
  }

  if (hadPreparedForTests || triggerScript) {
    // If we prepared to run all tests in cloud, then we need to wait for base to be available.
    // The preprocessing step starts to compute base, but it might take some time to have it available.
    await waitForBase({ apiToken: apiToken_, commitSha, logger });
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
      //  `pnpm cli:dev run-all-tests-in-cloud --appUrl <your app URL> --commitSha <a valid commit SHA> 2>&1 | cat`
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
      apiToken: apiToken_,
      commitSha,
      appUrl,

      secureTunnelHost,

      ...(keepTunnelOpenPromise
        ? { keepTunnelOpenPromise: keepTunnelOpenPromise.promise }
        : {}),

      onTunnelCreated: (data) => {
        tunnelData = data;
        const passwordDisplay = redactPassword
          ? "[REDACTED]"
          : data.basicAuthPassword;
        logger.info(
          `\nExposing local service running at ${appUrl}: ${data.url} user: ${data.basicAuthUser} password: ${passwordDisplay}`,
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
              const passwordDisplay = redactPassword
                ? "[REDACTED]"
                : tunnelData.basicAuthPassword;
              logger.info(
                `Your app can be accessed from ${tunnelData.url} username: ${tunnelData.basicAuthUser} password: ${passwordDisplay}`,
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
      ...(postComment ? { postComment } : {}),
      ...(hasCompanionAssets && companionAssetsRegex
        ? {
            companionAssets: {
              folder: companionAssetsFolder,
              zip: companionAssetsZip,
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

/**
 * Waits for base run to be available, polling until found or timeout.
 * Timeout is set to 30 minutes, and after that we just proceed without a base.
 * Projects that are not hosted on Github are not currently supported.
 */
const waitForBase = async ({
  apiToken,
  commitSha,
  logger,
}: {
  apiToken: string | null;
  commitSha: string;
  logger: log.Logger;
}): Promise<void> => {
  const client = createClient({ apiToken });
  const startTime = Date.now();

  // Non-Github-hosted projects are currently not supported
  let cloudReplayBaseTestRun = await getGitHubCloudReplayBaseTestRun({
    client,
    headCommitSha: commitSha,
  });

  let testRun = cloudReplayBaseTestRun.baseTestRun;
  let lastTimeElapsed = 0;

  while (!testRun) {
    const timeElapsed = Date.now() - startTime;
    if (timeElapsed > POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS) {
      const timeoutError = new Error(
        `Timed out after ${POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS / 1000} seconds waiting for base test run`,
      );
      logger.error(timeoutError.message);
      Sentry.captureException(timeoutError, {
        tags: {
          command: "run-all-tests-in-cloud",
          failureType: "base-test-run-timeout",
        },
        extra: {
          commitSha,
          timeoutMs: POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS,
          baseCommitSha: cloudReplayBaseTestRun.baseCommitSha,
        },
      });
      // We proceed without base
      break;
    }
    if (lastTimeElapsed == 0 || timeElapsed - lastTimeElapsed >= 30000) {
      // Log at most once every 30 seconds
      logger.info(
        `Waiting for base test run to be created. Time elapsed: ${timeElapsed}ms`,
      );
      lastTimeElapsed = timeElapsed;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, POLL_FOR_BASE_TEST_RUN_INTERVAL_MS),
    );

    cloudReplayBaseTestRun = await getGitHubCloudReplayBaseTestRun({
      client,
      headCommitSha: commitSha,
    });

    testRun = cloudReplayBaseTestRun.baseTestRun;
    if (testRun) {
      const waitTimeMs = Date.now() - startTime;
      Sentry.captureEvent({
        message: "Base test run found after waiting for it",
        level: "info",
        tags: {
          command: "run-all-tests-in-cloud",
          eventType: "base-test-run-found",
        },
        extra: {
          commitSha,
          baseCommitSha: cloudReplayBaseTestRun.baseCommitSha,
          waitTimeMs,
          waitTimeSec: Math.round(waitTimeMs / 1000),
        },
      });
    }
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
    companionAssetsZip: {
      string: true,
      description: "The zip file to serve the companion assets from.",
      default: undefined,
    },
    companionAssetsRegex: {
      string: true,
      description: "The regex to match the companion assets.",
      default: undefined,
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
    postComment: {
      boolean: true,
      description:
        "Post comments on the pull request, even if comments are still disabled for the project.",
      default: false,
    },
    redactPassword: {
      boolean: true,
      description: "Redact the tunnel password from log output.",
      default: false,
    },
  } as const)
  .handler(handler);
