import { TestRun } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";

const POLL_FOR_BASE_TEST_RUN_INTERVAL_MS = 10_000;
const POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

type PollResult = {
  testRun?: TestRun | null;
  baseNotFound?: boolean | undefined;
  message?: string | undefined;
};

/**
 * Polls by repeatedly calling `retryFn` until a test run is found or the timeout is reached.
 * If the timeout is reached without finding a test run, calls `fallbackFn` with mustHaveBase: false.
 */
export const pollWhileBaseNotFound = async ({
  initialResult,
  retryFn,
  fallbackFn,
}: {
  initialResult: PollResult;
  retryFn: () => Promise<PollResult>;
  fallbackFn: () => Promise<PollResult>;
}): Promise<PollResult> => {
  const logger = initLogger();

  let testRun = initialResult.testRun ?? null;
  let baseNotFound = initialResult.baseNotFound;
  let message = initialResult.message;

  if (!testRun && baseNotFound) {
    const startTime = Date.now();
    let lastTimeElapsed = 0;

    logger.info("Waiting for base test run to be created...");

    while (!testRun && baseNotFound) {
      const timeElapsed = Date.now() - startTime;
      if (timeElapsed > POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS) {
        logger.warn(
          `Timed out after ${
            POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS / 1000
          } seconds waiting for base test run`,
        );
        break;
      }
      if (lastTimeElapsed === 0 || timeElapsed - lastTimeElapsed >= 30_000) {
        logger.info(
          `Waiting for base test run to be created. Time elapsed: ${Math.round(timeElapsed / 1000)}s`,
        );
        lastTimeElapsed = timeElapsed;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, POLL_FOR_BASE_TEST_RUN_INTERVAL_MS),
      );
      const retryResult = await retryFn();
      testRun = retryResult.testRun ?? null;
      baseNotFound = retryResult.baseNotFound;
      message = retryResult.message;
    }

    if (baseNotFound && !testRun) {
      logger.info("Base test run not found, proceeding without it.");
      const fallbackResult = await fallbackFn();
      testRun = fallbackResult.testRun ?? null;
      message = fallbackResult.message;
      baseNotFound = false;
    }
  }

  return { testRun, baseNotFound, message };
};
