import type { TestRun } from "@alwaysmeticulous/api";
import type { ChunkPathOverlap } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";

const POLL_FOR_BASE_TEST_RUN_INTERVAL_MS = 10_000;
const POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

type PollResult = {
  testRun?: TestRun | null;
  baseNotFound?: boolean | undefined;
  message?: string | undefined;
  overlaps?: ChunkPathOverlap[] | undefined;
  overlapsTruncated?: boolean | undefined;
};

/**
 * Polls by repeatedly calling `retryFn` until a test run is found or the timeout is reached.
 * If the timeout is reached without finding a test run, calls `fallbackFn` (typically with
 * mustHaveBase: false) to create the test run without a base. For user-visible PR runs the
 * backend will conclude that run as `Skipped` without executing sessions.
 */
export const pollWhileBaseNotFound = async ({
  initialResult,
  retryFn,
  fallbackFn,
  fallbackLogMessage = "Base test run not found. Creating the test run without a base; no sessions will be executed.",
}: {
  initialResult: PollResult;
  retryFn: () => Promise<PollResult>;
  fallbackFn: () => Promise<PollResult>;
  /**
   * Logged just before `fallbackFn` runs. The default states that the test run
   * is created without a base and that no sessions will be executed (user-visible
   * PR runs conclude as `Skipped`). Main-branch / session-pool base runs can still
   * execute; callers on those paths may override this message. Callers whose
   * fallback does not create a base-less run (e.g. versionLookup manifests, which
   * fail instead) should override this so the log doesn't misreport a hard
   * failure as success.
   */
  fallbackLogMessage?: string;
}): Promise<PollResult> => {
  const logger = initLogger();

  let testRun = initialResult.testRun ?? null;
  let baseNotFound = initialResult.baseNotFound;
  let message = initialResult.message;
  // Track overlaps from whichever attempt ultimately resolves the manifest;
  // they aren't known on a baseNotFound response but arrive once it succeeds.
  let overlaps = initialResult.overlaps;
  let overlapsTruncated = initialResult.overlapsTruncated;

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
      overlaps = retryResult.overlaps;
      overlapsTruncated = retryResult.overlapsTruncated;
    }

    if (baseNotFound && !testRun) {
      logger.info(fallbackLogMessage);
      const fallbackResult = await fallbackFn();
      testRun = fallbackResult.testRun ?? null;
      message = fallbackResult.message;
      overlaps = fallbackResult.overlaps;
      overlapsTruncated = fallbackResult.overlapsTruncated;
      baseNotFound = fallbackResult.baseNotFound ?? false;
    }
  }

  return { testRun, baseNotFound, message, overlaps, overlapsTruncated };
};
