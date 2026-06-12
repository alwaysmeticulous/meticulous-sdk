import type {
  TestRun,
  TestRunNetworkPatchingResult,
} from "@alwaysmeticulous/api";
import {
  getLatestTestRunResults,
  getTestRun,
  getTestRunNetworkPatchingResult,
  IN_PROGRESS_TEST_RUN_STATUS,
  type MeticulousClient,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";

type SdkLogger = ReturnType<typeof initLogger>;

/**
 * Seam for the wall clock and sleeping, so the polling/grace logic can be
 * unit-tested deterministically without real timers.
 */
export interface WaitClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const REAL_CLOCK: WaitClock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};

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
 *
 * If network patching (session repair) is or may be triggered for the run, the
 * results surfaced in the Meticulous UI come from the merged test run, not the
 * original run. In that case this waits for patching to settle and returns the
 * merged test run, so that custom check results reported against the returned id
 * are attached to the run the user actually sees. Resilient to runs where no
 * patching happens, and to patching that never finishes (bounded by the timeout,
 * after which the best-known effective test run is returned rather than throwing).
 */
export const findTestRunByIdAndWaitForCompletion = async ({
  client,
  testRunId,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: FindTestRunByIdAndWaitForCompletionOptions): Promise<WaitForTestRunResult> => {
  const phase: WaitPhaseOptions = {
    client,
    testRunId,
    pollIntervalMs,
    timeoutMs,
    startTime: REAL_CLOCK.now(),
    logger: initLogger(),
    clock: REAL_CLOCK,
  };

  // Phase 1: wait for the requested test run to reach a terminal status.
  const testRun = await pollUntilTestRunComplete(phase);

  // Phase 2: resolve the effective (merged) test run, accounting for network
  // patching. Returns the original test run id when no patching applies.
  const effectiveTestRunId = await resolveEffectiveTestRunId(phase);

  if (effectiveTestRunId === testRun.id) {
    return { testRunId: testRun.id, testRun };
  }

  phase.logger.info(
    `Test run ${testRunId} was network patched; reporting against merged test run ${effectiveTestRunId}.`,
  );
  // Phase 3: fetch the merged run, falling back to the (already-terminal)
  // original run if it can't be fetched, so a transient error here doesn't fail
  // the whole wait after the run has completed.
  return fetchEffectiveTestRunOrFallback(phase, effectiveTestRunId, testRun);
};

interface WaitPhaseOptions {
  client: MeticulousClient;
  testRunId: string;
  pollIntervalMs: number;
  timeoutMs: number;
  startTime: number;
  logger: SdkLogger;
  clock: WaitClock;
}

export const pollUntilTestRunComplete = async ({
  client,
  testRunId,
  pollIntervalMs,
  timeoutMs,
  startTime,
  logger,
  clock,
}: WaitPhaseOptions): Promise<TestRun> => {
  let lastLoggedElapsedMs = 0;

  for (;;) {
    const testRun = await getTestRun({ client, testRunId });
    // Done once the run leaves the in-progress states — matching how the rest of
    // the SDK determines completion. This also returns for `Partial` (lazy
    // session pools), which is terminal enough and would otherwise hang here
    // until the timeout.
    if (!IN_PROGRESS_TEST_RUN_STATUS.includes(testRun.status)) {
      return testRun;
    }

    const elapsedMs = clock.now() - startTime;
    if (elapsedMs > timeoutMs) {
      throw new Error(
        `Timed out after ${Math.round(
          timeoutMs / 1000,
        )}s waiting for test run ${testRunId} to complete (current status: ${testRun.status}).`,
      );
    }

    // Log progress at most once every PROGRESS_LOG_INTERVAL_MS (mirroring the
    // base-test-run wait) so a script blocked here for minutes isn't silent.
    if (shouldLogProgress(lastLoggedElapsedMs, elapsedMs)) {
      logger.info(
        `Waiting for test run ${testRunId} to complete (current status: ${testRun.status}). Time elapsed: ${Math.round(
          elapsedMs / 1000,
        )}s`,
      );
      lastLoggedElapsedMs = elapsedMs;
    }

    await clock.sleep(pollIntervalMs);
  }
};

/**
 * Polls the backend for the effective test run to report custom check results
 * against, waiting while network patching (session repair) is in progress.
 *
 * Returns the merged test run id once patching settles, or the original test run
 * id when no patching applies. Resilient by design — it always returns an id
 * rather than throwing, since the run has already completed by this point:
 * - Older backends without the endpoint (404 → `null`) → original run.
 * - Transient backend errors → keep retrying until the timeout, then fall back
 *   to the original run (rather than surfacing a brand-new failure mode in a
 *   window that previously couldn't fail).
 * - Patching never settling → on timeout, the best-known effective id.
 */
export const resolveEffectiveTestRunId = async ({
  client,
  testRunId,
  pollIntervalMs,
  timeoutMs,
  startTime,
  logger,
  clock,
}: WaitPhaseOptions): Promise<string> => {
  let lastLoggedElapsedMs = 0;

  for (;;) {
    let result: TestRunNetworkPatchingResult | null;
    try {
      result = await getTestRunNetworkPatchingResult({ client, testRunId });
    } catch (error) {
      // Transient error talking to the backend. The run already completed, so
      // don't fail the wait — retry until the timeout, then fall back to the
      // original run.
      if (clock.now() - startTime > timeoutMs) {
        logger.warn(
          `Giving up resolving the network-patched test run for ${testRunId} after a transient error; reporting against the original run. ${error}`,
        );
        return testRunId;
      }
      await clock.sleep(pollIntervalMs);
      continue;
    }

    // Older backends don't support this endpoint; fall back to the original run.
    if (!result) {
      return testRunId;
    }
    if (!result.isNetworkPatchingInProgress) {
      return result.effectiveTestRunId;
    }

    const elapsedMs = clock.now() - startTime;
    if (elapsedMs > timeoutMs) {
      logger.warn(
        `Timed out after ${Math.round(
          timeoutMs / 1000,
        )}s waiting for network patching of test run ${testRunId} to complete; reporting against ${result.effectiveTestRunId}.`,
      );
      return result.effectiveTestRunId;
    }

    if (shouldLogProgress(lastLoggedElapsedMs, elapsedMs)) {
      logger.info(
        `Test run ${testRunId} is being network patched; waiting for the merged test run to complete. Time elapsed: ${Math.round(
          elapsedMs / 1000,
        )}s`,
      );
      lastLoggedElapsedMs = elapsedMs;
    }

    await clock.sleep(pollIntervalMs);
  }
};

/**
 * Fetches the resolved (merged) test run, retrying transient errors until the
 * timeout and then falling back to the already-resolved original run. This keeps
 * the guarantee that the wait returns a terminal run once the original is done,
 * even if the merged run can't be fetched.
 */
export const fetchEffectiveTestRunOrFallback = async (
  {
    client,
    pollIntervalMs,
    timeoutMs,
    startTime,
    logger,
    clock,
  }: WaitPhaseOptions,
  effectiveTestRunId: string,
  originalTestRun: TestRun,
): Promise<WaitForTestRunResult> => {
  for (;;) {
    try {
      const effectiveTestRun = await getTestRun({
        client,
        testRunId: effectiveTestRunId,
      });
      return { testRunId: effectiveTestRun.id, testRun: effectiveTestRun };
    } catch (error) {
      if (clock.now() - startTime > timeoutMs) {
        logger.warn(
          `Could not fetch merged test run ${effectiveTestRunId} after a transient error; reporting against the original run ${originalTestRun.id}. ${error}`,
        );
        return { testRunId: originalTestRun.id, testRun: originalTestRun };
      }
      await clock.sleep(pollIntervalMs);
    }
  }
};

// Log progress at most once every PROGRESS_LOG_INTERVAL_MS so a script blocked
// here for minutes isn't silent.
const shouldLogProgress = (
  lastLoggedElapsedMs: number,
  elapsedMs: number,
): boolean =>
  lastLoggedElapsedMs === 0 ||
  elapsedMs - lastLoggedElapsedMs >= PROGRESS_LOG_INTERVAL_MS;
