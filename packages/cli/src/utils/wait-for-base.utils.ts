import {
  createClient,
  getGitHubCloudReplayBaseTestRun,
} from "@alwaysmeticulous/client";
import * as Sentry from "@sentry/node";
import log from "loglevel";

const POLL_FOR_BASE_TEST_RUN_INTERVAL_MS = 10_000;
const POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export interface WaitForBaseOptions {
  apiToken: string | null | undefined;
  commitSha: string;
  logger: log.Logger;
  commandName: string;
}

/**
 * Waits for base run to be available, polling until found or timeout.
 * Timeout is set to 30 minutes, and after that we just proceed without a base.
 * Projects that are not hosted on Github are not currently supported.
 */
export const waitForBase = async ({
  apiToken,
  commitSha,
  logger,
  commandName,
}: WaitForBaseOptions): Promise<void> => {
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
          command: commandName,
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
          command: commandName,
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
