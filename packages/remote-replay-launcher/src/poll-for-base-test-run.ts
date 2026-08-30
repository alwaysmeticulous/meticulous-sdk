import type { TestRun } from "@alwaysmeticulous/api";
import type { ChunkPathOverlap } from "@alwaysmeticulous/client";
import { executeWithRetry, initLogger } from "@alwaysmeticulous/common";
import {
  DEPLOYMENT_IN_PROGRESS_RETRY,
  isDeploymentStillInProgress,
} from "./deployment-in-progress";

const POLL_FOR_BASE_TEST_RUN_INTERVAL_MS = 10_000;
const POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

type PollResult = {
  testRun?: TestRun | null;
  baseNotFound?: boolean | undefined;
  /**
   * Server-provided extension (in milliseconds) to the default polling
   * window, driven by a per-project feature flag on the backend.
   */
  extraBasePollTimeoutMs?: number | undefined;
  message?: string | undefined;
  /**
   * Set when the trigger created no test run solely because the session filter
   * excluded every session. Tracked through the poll so the caller can report
   * the distinct cause rather than a generic "no test run" failure.
   */
  allSessionsExcludedBySessionFilter?: boolean | undefined;
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
  let allSessionsExcludedBySessionFilter =
    initialResult.allSessionsExcludedBySessionFilter;
  // Server-driven extension of the polling window (per-project feature flag).
  // Tracked across retries so a change in the server's answer takes effect.
  let extraBasePollTimeoutMs = initialResult.extraBasePollTimeoutMs;
  // Track overlaps from whichever attempt ultimately resolves the manifest;
  // they aren't known on a baseNotFound response but arrive once it succeeds.
  let overlaps = initialResult.overlaps;
  let overlapsTruncated = initialResult.overlapsTruncated;

  if (!testRun && baseNotFound) {
    const startTime = Date.now();
    let lastTimeElapsed = 0;

    logger.info("Waiting for base test run to be created...");

    while (!testRun && baseNotFound) {
      const maxTimeoutMs =
        POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS + (extraBasePollTimeoutMs ?? 0);
      const timeElapsed = Date.now() - startTime;
      if (timeElapsed > maxTimeoutMs) {
        logger.warn(
          `Timed out after ${
            maxTimeoutMs / 1000
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
      const retryResult = await pollOnce(retryFn, logger);
      if (retryResult == null) {
        continue;
      }
      testRun = retryResult.testRun ?? null;
      baseNotFound = retryResult.baseNotFound;
      message = retryResult.message;
      allSessionsExcludedBySessionFilter =
        retryResult.allSessionsExcludedBySessionFilter;
      extraBasePollTimeoutMs = retryResult.extraBasePollTimeoutMs;
      overlaps = retryResult.overlaps;
      overlapsTruncated = retryResult.overlapsTruncated;
    }

    if (baseNotFound && !testRun) {
      logger.info(fallbackLogMessage);
      const fallbackResult = await runFallback(fallbackFn, logger);
      testRun = fallbackResult.testRun ?? null;
      message = fallbackResult.message;
      allSessionsExcludedBySessionFilter =
        fallbackResult.allSessionsExcludedBySessionFilter;
      overlaps = fallbackResult.overlaps;
      overlapsTruncated = fallbackResult.overlapsTruncated;
      baseNotFound = fallbackResult.baseNotFound ?? false;
    }
  }

  return {
    testRun,
    baseNotFound,
    message,
    allSessionsExcludedBySessionFilter,
    overlaps,
    overlapsTruncated,
  };
};

/**
 * Runs one poll, absorbing the responses that mean the deployment is still
 * being worked on elsewhere and returning `null` so the caller polls again.
 *
 * Coming back is the whole point of this loop, so an in-progress answer is not
 * a failure — treating it as one would abandon a run the trigger is in the
 * middle of creating. Everything else still throws: the loop's own deadline is
 * the only thing that should end it early.
 */
const pollOnce = async (
  retryFn: () => Promise<PollResult>,
  logger: ReturnType<typeof initLogger>,
): Promise<PollResult | null> => {
  try {
    return await retryFn();
  } catch (error) {
    if (!isDeploymentStillInProgress(error)) {
      throw error;
    }
    logger.debug(
      `Deployment is still being processed server-side; will poll again. ${String(error)}`,
    );
    return null;
  }
};

/**
 * Runs the fallback, which reaches the same endpoint the polls did and so can
 * lose its response the same way.
 *
 * A poll that loses one simply comes round again, but the fallback is the last
 * call this function makes: throwing here fails the command outright, having
 * already spent the whole base window, and discards a run the trigger is most
 * likely in the middle of creating. So it waits through a couple of losses
 * instead, on the same schedule as the upload paths' own completion call.
 */
const runFallback = async (
  fallbackFn: () => Promise<PollResult>,
  logger: ReturnType<typeof initLogger>,
): Promise<PollResult> =>
  executeWithRetry(fallbackFn, { ...DEPLOYMENT_IN_PROGRESS_RETRY, logger });
