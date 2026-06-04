import type { TestRun } from "@alwaysmeticulous/api";
import {
  COMPLETED_TEST_RUN_STATUSES,
  getLatestTestRunResults,
  getTestRun,
  type MeticulousClient,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";

// Mirrors the base-test-run polling in the SDK's `pollWhileBaseNotFound`: poll on
// a fixed interval, cap the total wait, and log progress at most once per
// PROGRESS_LOG_INTERVAL_MS so a long-running script isn't silent.
const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1_000;
const PROGRESS_LOG_INTERVAL_MS = 30_000;

export interface WaitForTestRunCompletionOptions {
  /** How often to poll the test run's status, in ms. Defaults to 10000. */
  pollIntervalMs?: number;
  /**
   * Maximum time to wait for the test run to complete before throwing, in ms.
   * Defaults to 30 minutes.
   */
  timeoutMs?: number;
}

export interface WaitForTestRunResult {
  testRunId: string;
  testRun: TestRun;
}

export type FindTestRunByCommitAndWaitForCompletionOptions =
  WaitForTestRunCompletionOptions & {
    client: MeticulousClient;
    commitSha: string;
  };

/**
 * Resolves the latest test run for a commit and waits for it to reach a terminal
 * status, returning it. Throws if no test run exists for the commit, or if it
 * does not complete within the timeout.
 */
export const findTestRunByCommitAndWaitForCompletion = async ({
  client,
  commitSha,
  ...waitOptions
}: FindTestRunByCommitAndWaitForCompletionOptions): Promise<WaitForTestRunResult> => {
  const latest = await getLatestTestRunResults({ client, commitSha });
  if (!latest) {
    throw new Error(
      `No test run found for commit ${commitSha}. A test run must be triggered for the commit before its custom check results can be reported.`,
    );
  }
  initLogger().info(
    `Found test run ${latest.id} for commit ${commitSha}; waiting for it to complete...`,
  );
  return findTestRunByIdAndWaitForCompletion({
    client,
    testRunId: latest.id,
    ...waitOptions,
  });
};

export type FindTestRunByIdAndWaitForCompletionOptions =
  WaitForTestRunCompletionOptions & {
    client: MeticulousClient;
    testRunId: string;
  };

/**
 * Waits for a known test run to reach a terminal status, returning it. Throws if
 * it does not complete within the timeout.
 */
export const findTestRunByIdAndWaitForCompletion = async ({
  client,
  testRunId,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: FindTestRunByIdAndWaitForCompletionOptions): Promise<WaitForTestRunResult> => {
  const logger = initLogger();
  const startTime = Date.now();
  let lastLoggedElapsedMs = 0;

  for (;;) {
    const testRun = await getTestRun({ client, testRunId });
    if (COMPLETED_TEST_RUN_STATUSES.includes(testRun.status)) {
      return { testRunId: testRun.id, testRun };
    }

    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > timeoutMs) {
      throw new Error(
        `Timed out after ${Math.round(
          timeoutMs / 1000,
        )}s waiting for test run ${testRunId} to complete (current status: ${testRun.status}).`,
      );
    }

    // Log progress at most once every PROGRESS_LOG_INTERVAL_MS (mirroring the
    // base-test-run wait) so a script blocked here for minutes isn't silent.
    if (
      lastLoggedElapsedMs === 0 ||
      elapsedMs - lastLoggedElapsedMs >= PROGRESS_LOG_INTERVAL_MS
    ) {
      logger.info(
        `Waiting for test run ${testRunId} to complete (current status: ${testRun.status}). Time elapsed: ${Math.round(
          elapsedMs / 1000,
        )}s`,
      );
      lastLoggedElapsedMs = elapsedMs;
    }

    await sleep(pollIntervalMs);
  }
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
