import type {
  TestRun,
  TestRunNetworkPatchingResult,
} from "@alwaysmeticulous/api";
import {
  getLatestTestRunResults,
  getTestRun,
  getTestRunNetworkPatchingResult,
  IN_PROGRESS_TEST_RUN_STATUS,
  markTestRunExpectsCustomChecks,
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
  /**
   * When true, skip registering with the backend that this test run will report
   * custom check results (the `expect-custom-checks` signal that makes the
   * "Checks" tab appear in the Meticulous UI). Defaults to false.
   *
   * Useful when iterating on a custom check locally against a real test run: you
   * can wait for the run and pull its snapshots without making that run show a
   * "waiting for checks" tab to everyone. Note that actually reporting results
   * (`reportCustomCheckResults`) still marks the run, so set this only while
   * experimenting and not reporting results to the real run.
   */
  skipRegisteringExpectedCustomChecks?: boolean;
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
 * Like {@link findTestRunForCustomChecks}, but takes a commit SHA instead of a
 * test run id: it resolves the latest test run for the commit first, then waits
 * for and returns the run to report custom check results against (registering it
 * as expecting custom checks along the way).
 *
 * Call this at the start of a custom check script when you have the commit SHA
 * rather than a test run id — before downloading snapshots or computing results.
 * For a dry run that will NOT report results (e.g. testing your check script),
 * set `skipRegisteringExpectedCustomChecks: true` so the run doesn't show a
 * "waiting for checks" tab that never resolves.
 *
 * Throws if no test run exists for the commit, or if it does not complete within
 * the timeout.
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
  return findTestRunForCustomChecks({
    client,
    testRunId: latest.id,
    ...waitOptions,
  });
};

export type FindTestRunForCustomChecksOptions =
  WaitForTestRunCompletionOptions & {
    client: MeticulousClient;
    testRunId: string;
  };

/**
 * Waits for a test run to be ready to run custom checks against, and returns the
 * test run you should report results for.
 *
 * Call this at the start of your custom check script — before downloading
 * snapshots or computing any results. It:
 *
 *  1. Waits for the test run to reach a terminal status.
 *  2. Resolves the "effective" run to report against. When network patching
 *     (session repair) is triggered, the results surfaced in the Meticulous UI
 *     come from the merged run, not the original, so this returns the merged run
 *     once patching settles (and the original when no patching applies). Report
 *     your results against the returned `testRunId` so they attach to the run
 *     the user actually sees.
 *  3. Registers that the returned run expects custom check results, so the UI
 *     shows the "Checks" tab while your checks are in flight (and doesn't time
 *     out waiting). This is why it must be called before you run the checks.
 *
 * If you are NOT going to report results for this run — e.g. a dry run that just
 * tests your custom check script — set `skipRegisteringExpectedCustomChecks:
 * true` so the run doesn't show a "waiting for checks" tab that never resolves.
 *
 * Resilient to runs where no patching happens, and to patching that never
 * finishes (bounded by the timeout, after which the best-known effective test
 * run is returned rather than throwing). Throws only if the run doesn't reach a
 * terminal status within the timeout.
 */
export const findTestRunForCustomChecks = async ({
  client,
  testRunId,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  skipRegisteringExpectedCustomChecks = false,
}: FindTestRunForCustomChecksOptions): Promise<WaitForTestRunResult> => {
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

  let result: WaitForTestRunResult;
  if (effectiveTestRunId === testRun.id) {
    result = { testRunId: testRun.id, testRun };
  } else {
    phase.logger.info(
      `Test run ${testRunId} was network patched; reporting against merged test run ${effectiveTestRunId}.`,
    );
    // Phase 3: fetch the merged run, falling back to the (already-terminal)
    // original run if it can't be fetched, so a transient error here doesn't
    // fail the whole wait after the run has completed.
    result = await fetchEffectiveTestRunOrFallback(
      phase,
      effectiveTestRunId,
      testRun,
    );
  }

  // Now that we've resolved the run the user will actually see (the merged run
  // when network patching applied, otherwise the original), register that it
  // expects custom check results — before the caller goes on to download
  // snapshots and compute the checks — so the UI shows the "Checks" tab while
  // they're in flight. Reporting against the same run id is the backstop that
  // marks it if this best-effort call doesn't land. Skipped for local
  // experimentation, so fetching a real run's snapshots doesn't make it show a
  // "waiting for checks" tab.
  if (skipRegisteringExpectedCustomChecks) {
    phase.logger.info(
      `Not registering that test run ${result.testRunId} expects custom check results (skipRegisteringExpectedCustomChecks is set).`,
    );
  } else {
    await markExpectsCustomChecksBestEffort(phase, result.testRunId);
  }

  return result;
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

/**
 * Best-effort registration that the resolved (effective) test run expects custom
 * check results. Never throws: the run has already completed by this point and
 * the only consequence of failure is that the "Checks" tab appears slightly
 * later (once results are reported, which also marks the run), so a transient
 * error or an older backend without the endpoint must not fail the wait.
 */
const markExpectsCustomChecksBestEffort = async (
  { client, logger }: WaitPhaseOptions,
  testRunId: string,
): Promise<void> => {
  try {
    await markTestRunExpectsCustomChecks({ client, testRunId });
  } catch (error) {
    logger.warn(
      `Could not register that test run ${testRunId} expects custom check results; the Checks tab will still appear once results are reported. ${error}`,
    );
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
