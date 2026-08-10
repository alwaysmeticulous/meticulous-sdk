import type {
  TestRun,
  TestRunNetworkPatchingResult,
} from "@alwaysmeticulous/api";
import {
  getLatestTestRunResults,
  getTestRun,
  getTestRunNetworkPatchingResult,
  IN_PROGRESS_TEST_RUN_STATUS,
  isFetchError,
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

export type FindTestRunByCommitForCustomChecksOptions =
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
export const findTestRunByCommitForCustomChecks = async ({
  client,
  commitSha,
  ...waitOptions
}: FindTestRunByCommitForCustomChecksOptions): Promise<WaitForTestRunResult> => {
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
 *  4. Waits for the effective run's **base** test run to reach a terminal
 *     status too. Custom check snapshots are compared against the base run's,
 *     and the base run (typically the branch-point commit's run) can still be
 *     executing when the head run finishes: fetching snapshots at that point
 *     observes a partial — often empty — base side, and every check silently
 *     compares 0 sessions and records a vacuous verdict that can never be
 *     corrected (results are reported exactly once).
 *
 * If you are NOT going to report results for this run — e.g. a dry run that just
 * tests your custom check script — set `skipRegisteringExpectedCustomChecks:
 * true` so the run doesn't show a "waiting for checks" tab that never resolves.
 *
 * Resilient to runs where no patching happens, to patching that never finishes,
 * and to a base run that never finishes (each bounded by the timeout, after
 * which the best-known state is used rather than throwing). Throws only if the
 * head run doesn't reach a terminal status within the timeout.
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

  // Skipped / Aborted / ExecutionError runs have no (usable) sessions to check.
  // Return immediately without registering "expects custom checks" or waiting
  // on a base — callers should treat these as a no-op rather than reporting
  // vacuous results or leaving the Checks tab pending forever.
  if (
    testRun.status === "Skipped" ||
    testRun.status === "Aborted" ||
    testRun.status === "ExecutionError"
  ) {
    return { testRunId: testRun.id, testRun };
  }

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
  // expects custom check results — before the (potentially long) base-run wait
  // below and before the caller goes on to download snapshots and compute the
  // checks — so the UI shows the "Checks" tab / pending status while they're in
  // flight rather than only once the base run finishes. Reporting against the
  // same run id is the backstop that marks it if this best-effort call doesn't
  // land. Skipped for local experimentation, so fetching a real run's snapshots
  // doesn't make it show a "waiting for checks" tab.
  if (skipRegisteringExpectedCustomChecks) {
    phase.logger.info(
      `Not registering that test run ${result.testRunId} expects custom check results (skipRegisteringExpectedCustomChecks is set).`,
    );
  } else {
    await markExpectsCustomChecksBestEffort(phase, result.testRunId);
  }

  // Phase 4: wait for the effective run's base test run to complete, so the
  // snapshots the caller is about to download cover the full base side rather
  // than whatever had uploaded so far.
  await waitForBaseTestRunCompletion(phase, result.testRun);

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
 * Waits for the effective test run's **base** test run to reach a terminal
 * status, so the custom check snapshots downloaded next cover the complete base
 * side.
 *
 * Snapshot files are uploaded by each replay as it finishes, and the backend
 * lists a run's files from the replays recorded in its results — which keep
 * accumulating while the run executes. The head run's completion says nothing
 * about the base run (often the branch-point commit's run, executing in
 * parallel), so without this wait a check computed right after the head run
 * finishes can observe a partial or empty base side, silently compare 0
 * sessions, and permanently record a vacuous verdict (results are reported
 * exactly once).
 *
 * Never throws — the head run has already completed, so this must not introduce
 * a new failure mode:
 *  - No base test run configured → nothing to wait for (downloading snapshots
 *    will fail with the existing "no base test run" error).
 *  - Base run unreadable (deleted, or a token scoped to the head run only) →
 *    proceed immediately with a warning.
 *  - Transient errors → retry until the timeout, then proceed with a warning.
 *  - Base run still executing at the timeout → proceed with a warning
 *    (bounded staleness beats never reporting).
 */
export const waitForBaseTestRunCompletion = async (
  {
    client,
    pollIntervalMs,
    timeoutMs,
    startTime,
    logger,
    clock,
  }: WaitPhaseOptions,
  effectiveTestRun: TestRun,
): Promise<void> => {
  const baseTestRunId = getBaseTestRunId(effectiveTestRun);
  if (baseTestRunId == null || baseTestRunId === effectiveTestRun.id) {
    return;
  }

  let lastLoggedElapsedMs = 0;
  let sawInProgress = false;
  for (;;) {
    let baseTestRun: TestRun;
    try {
      baseTestRun = await getTestRun({ client, testRunId: baseTestRunId });
    } catch (error) {
      // A base run we're not allowed to read (or that no longer exists) will
      // never look complete from here: proceed rather than stalling the wait.
      if (
        isFetchError(error) &&
        (error.response?.status === 403 || error.response?.status === 404)
      ) {
        logger.warn(
          `Could not read base test run ${baseTestRunId}; computing custom checks without waiting for it. ${error}`,
        );
        return;
      }
      if (clock.now() - startTime > timeoutMs) {
        logger.warn(
          `Giving up waiting for base test run ${baseTestRunId} after a transient error; its snapshots may still be uploading, so comparisons may be incomplete. ${error}`,
        );
        return;
      }
      await clock.sleep(pollIntervalMs);
      continue;
    }

    if (!IN_PROGRESS_TEST_RUN_STATUS.includes(baseTestRun.status)) {
      if (sawInProgress) {
        logger.info(
          `Base test run ${baseTestRunId} completed (status: ${baseTestRun.status}); custom check snapshots are ready to compare.`,
        );
      }
      return;
    }
    sawInProgress = true;

    const elapsedMs = clock.now() - startTime;
    if (elapsedMs > timeoutMs) {
      logger.warn(
        `Timed out after ${Math.round(
          timeoutMs / 1000,
        )}s waiting for base test run ${baseTestRunId} to complete (current status: ${baseTestRun.status}); its snapshots may still be uploading, so comparisons may be incomplete.`,
      );
      return;
    }

    if (shouldLogProgress(lastLoggedElapsedMs, elapsedMs)) {
      logger.info(
        `Waiting for base test run ${baseTestRunId} to complete (current status: ${baseTestRun.status}) so its custom check snapshots are all uploaded before the checks compute. Time elapsed: ${Math.round(
          elapsedMs / 1000,
        )}s`,
      );
      lastLoggedElapsedMs = elapsedMs;
    }

    await clock.sleep(pollIntervalMs);
  }
};

/**
 * The base test run id the effective run was scheduled against, read from the
 * run's raw `configData`. The public `TestRun` type deliberately types
 * `configData` only partially — this field is an internal scheduling detail
 * rather than public API surface — so it is read untyped and validated at
 * runtime. It is the same field the backend's snapshot listing resolves the
 * base run from, so waiting on this run is guaranteed to match what the
 * snapshots are later compared against. Missing or malformed → `null` (no base
 * to wait for).
 */
const getBaseTestRunId = (testRun: TestRun): string | null => {
  const configData: unknown = testRun.configData;
  if (configData == null || typeof configData !== "object") {
    return null;
  }
  const testRunArguments = (configData as { arguments?: unknown }).arguments;
  if (testRunArguments == null || typeof testRunArguments !== "object") {
    return null;
  }
  const baseTestRunId = (testRunArguments as { baseTestRunId?: unknown })
    .baseTestRunId;
  return typeof baseTestRunId === "string" && baseTestRunId.length > 0
    ? baseTestRunId
    : null;
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
