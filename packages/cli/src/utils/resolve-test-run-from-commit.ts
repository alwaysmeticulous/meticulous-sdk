import type { TestRunStatus } from "@alwaysmeticulous/api";
import type { MeticulousClient } from "@alwaysmeticulous/client";
import {
  getTestRun,
  getTestRunForCommit,
  IN_PROGRESS_TEST_RUN_STATUS,
} from "@alwaysmeticulous/client";
import {
  getCommitSha,
  getUntrackedFiles,
  hasUncommittedChanges,
  logNotice,
  logProgress,
} from "@alwaysmeticulous/common";
import { CliUserError } from "./cli-user-error";
import { appendProjectSelectionHint } from "./project-selection-hint";

const POLL_INTERVAL_MS = 10_000;

/** Give up waiting for a run after this long, rather than polling forever. */
const POLL_TIMEOUT_MS = 10 * 60_000;

/**
 * Logs which commit a by-commit test-run lookup resolved to, with consistent
 * wording across the agent commands. The lookup is by commit, so uncommitted
 * local changes aren't reflected: when the tree is dirty it logs `commitSha
 * (ignoring local changes)` unconditionally (not just under `--verbose`) so the
 * caveat is never missed — there's no ephemeral-commit capture here, unlike
 * `upload-build`. The clean and explicit-`--commitSha` cases are `--verbose`-only.
 */
export const logResolvedCommitSha = async (
  commitSha: string | undefined,
  resolvedSha: string,
): Promise<void> => {
  if (commitSha != null) {
    logProgress(`commitSha (provided): ${resolvedSha}`);
  } else if (await hasLocalChanges()) {
    logNotice(`commitSha (ignoring local changes): ${resolvedSha}`);
  } else {
    logProgress(`commitSha (local): ${resolvedSha}`);
  }
};

/**
 * True when the working tree differs from HEAD in any way the by-commit lookup
 * won't reflect — tracked modifications/staged changes *or* untracked files.
 * (`hasUncommittedChanges` alone ignores untracked files.)
 */
const hasLocalChanges = async (): Promise<boolean> =>
  (await hasUncommittedChanges()) || (await getUntrackedFiles()).length > 0;

export interface ResolvedTestRun {
  testRunId: string;
  status: TestRunStatus;
}

/** Whether a status means the run is still running (not yet usable). */
export const isTestRunInProgress = (status: TestRunStatus): boolean =>
  IN_PROGRESS_TEST_RUN_STATUS.includes(status);

/**
 * Statuses where the run has finished with a usable verdict, so diffs/coverage
 * are available. "Failure" just means notable differences were found — the run
 * itself completed successfully.
 */
const COMPLETE_TEST_RUN_STATUS: TestRunStatus[] = ["Success", "Failure"];

/** Whether the run has finished with a usable verdict (results are ready). */
export const isTestRunComplete = (status: TestRunStatus): boolean =>
  COMPLETE_TEST_RUN_STATUS.includes(status);

/** Statuses where the run failed fatally and won't produce usable results. */
const FAILED_TEST_RUN_STATUS: TestRunStatus[] = ["Aborted", "ExecutionError"];

/** Whether the run failed fatally (results are unavailable/unreliable). */
export const isTestRunFailed = (status: TestRunStatus): boolean =>
  FAILED_TEST_RUN_STATUS.includes(status);

/**
 * Whether the run is a session-pool base: it executes sessions on demand for
 * other PRs (lazy session execution) rather than representing a specific
 * change, and never finishes on its own — it stays `Partial` until some future
 * PR requests more of its sessions. So it isn't a proper test run with a
 * comparable set of diffs.
 */
export const isTestRunPartial = (status: TestRunStatus): boolean =>
  status === "Partial";

/**
 * Asserts a resolved run has finished with a usable verdict (Success/Failure),
 * distinguishing a fatal failure (`Aborted`/`ExecutionError`) from a run that
 * simply isn't finished yet.
 *
 * `Partial` base runs are deliberately not special-cased here: whether one is
 * usable depends on what's being fetched (they have no diffs, but they do have
 * coverage), so each command decides its own policy — and its own wording —
 * before calling this. A `Partial` run that reaches here is reported as not
 * complete, which is true but unhelpful, so intercept it first.
 */
export const assertTestRunComplete = (
  testRunId: string,
  status: TestRunStatus,
  { resultName = "results" }: { resultName?: string } = {},
): void => {
  if (status === "Skipped") {
    throw new CliUserError(
      `Test run ${testRunId} was skipped (no base test run was found, so nothing ran); ${resultName} are not available.`,
    );
  }
  if (isTestRunFailed(status)) {
    throw new CliUserError(
      `Test run ${testRunId} finished unsuccessfully (status: ${status}).`,
    );
  }
  if (!isTestRunComplete(status)) {
    throw new CliUserError(
      `Test run ${testRunId} is not complete (status: ${status}); ${resultName} not yet available.`,
    );
  }
};

/**
 * Resolves the latest test run (including one in progress) from a commit (an
 * explicit `commitSha`, or the local checkout's HEAD when omitted), throwing a
 * `CliUserError` when the commit can't be determined or no run matches it.
 *
 * `project` is a one-off override (resolved flexibly server-side); when
 * omitted, project-scoped tokens use their own project and OAuth tokens fall
 * back to the caller's stored default (`meticulous auth set-project`).
 *
 * Logs the resolved commit (see {@link logResolvedCommitSha}) and the test run
 * id (under `--verbose`).
 */
export const resolveTestRunForCommitOrThrow = async (
  client: MeticulousClient,
  commitSha: string | undefined,
  project?: string,
): Promise<ResolvedTestRun> => {
  const sha = await getCommitSha(commitSha);
  if (!sha) {
    throw new CliUserError(
      "Could not determine a commit SHA. Pass --commitSha or --testRunId, or run inside a git repository.",
    );
  }
  await logResolvedCommitSha(commitSha, sha);

  const { testRunId, status } = await getTestRunForCommit(client, sha, {
    project,
  });
  if (testRunId == null || status == null) {
    throw new CliUserError(
      await appendProjectSelectionHint(
        `No test run found for commit ${sha}.`,
        client,
        project,
      ),
    );
  }
  logProgress(`Resolved test run id: ${testRunId}`);
  return { testRunId, status };
};

/**
 * Best-effort variant for auto-retry paths: returns `null` (rather than
 * throwing) when the commit can't be determined, no project is selected, or no
 * run matches, so the caller can fall back to its original behaviour.
 */
export const tryResolveTestRunForCommit = async (
  client: MeticulousClient,
  commitSha: string | undefined,
  project?: string,
): Promise<ResolvedTestRun | null> => {
  try {
    const sha = await getCommitSha(commitSha);
    if (!sha) {
      return null;
    }
    const { testRunId, status } = await getTestRunForCommit(client, sha, {
      project,
    });
    return testRunId != null && status != null ? { testRunId, status } : null;
  } catch (error) {
    // A CliUserError (e.g. no project selected for an OAuth caller) is an
    // actionable configuration problem the user must address, not a reason to
    // silently skip the fallback — let it propagate so its message surfaces.
    if (error instanceof CliUserError) {
      throw error;
    }
    return null;
  }
};

/**
 * Polls a (possibly in-progress) test run until it reaches a terminal status,
 * logging a single "Waiting for test run X to complete..." line when it starts
 * waiting (no per-poll output — per-poll lines are noisy context for agents).
 * Throws a `CliUserError` if the run doesn't reach a terminal status within
 * `POLL_TIMEOUT_MS`, or — unless `throwOnFailure: false` — if it finishes
 * unsuccessfully (`ExecutionError`/`Aborted`). Returns the final status.
 */
export const awaitTestRunCompletion = async (
  client: MeticulousClient,
  testRunId: string,
  { throwOnFailure = true }: { throwOnFailure?: boolean } = {},
): Promise<TestRunStatus> => {
  let testRun = await getTestRun({ client, testRunId });
  if (isTestRunInProgress(testRun.status)) {
    logProgress(`Waiting for test run ${testRunId} to complete...`);
  }
  const deadline = performance.now() + POLL_TIMEOUT_MS;
  while (isTestRunInProgress(testRun.status)) {
    if (performance.now() >= deadline) {
      throw new CliUserError(
        `Test run ${testRunId} has not completed after 10 minutes (status: ${testRun.status}). ` +
          "It may still be running — check back later, or re-run with --dontWaitForTestRunToComplete to return immediately.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    testRun = await getTestRun({ client, testRunId });
  }
  if (throwOnFailure && isTestRunFailed(testRun.status)) {
    throw new CliUserError(
      `Test run ${testRunId} finished unsuccessfully (status: ${testRun.status}).`,
    );
  }
  return testRun.status;
};

/**
 * Ensures a resolved run is finished before its results are used. By default
 * blocks until completion (a single "Waiting for test run X to complete..."
 * line); with `dontWait`, reports "Test run X is not complete (status: Y)." and
 * returns `null` so the caller can stop without waiting. Returns the terminal
 * status, or `null` only when `dontWait` and the run is still in progress.
 */
export const ensureTestRunFinished = async (
  client: MeticulousClient,
  testRunId: string,
  status: TestRunStatus,
  {
    dontWait,
    throwOnFailure = true,
  }: { dontWait: boolean; throwOnFailure?: boolean },
): Promise<TestRunStatus | null> => {
  if (dontWait && isTestRunInProgress(status)) {
    logNotice(`Test run ${testRunId} is not complete (status: ${status}).`);
    return null;
  }
  return awaitTestRunCompletion(client, testRunId, { throwOnFailure });
};
