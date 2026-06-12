import { TestRunStatus } from "@alwaysmeticulous/api";
import {
  getTestRun,
  getTestRunForCommit,
  IN_PROGRESS_TEST_RUN_STATUS,
  MeticulousClient,
} from "@alwaysmeticulous/client";
import { getCommitSha } from "@alwaysmeticulous/common";
import { CliUserError } from "./cli-user-error";
import { resolveProjectIdentifier } from "./resolve-project-identifier";

const POLL_INTERVAL_MS = 10_000;

const log = (...args: unknown[]) => process.stderr.write(args.join(" ") + "\n");

export interface ResolvedTestRun {
  testRunId: string;
  status: TestRunStatus;
}

/** Whether a status means the run is still running (not yet usable). */
export const isTestRunInProgress = (status: TestRunStatus): boolean =>
  IN_PROGRESS_TEST_RUN_STATUS.includes(status);

/**
 * Resolves the latest test run (including one in progress) from a commit (an
 * explicit `commitSha`, or the local checkout's HEAD when omitted), throwing a
 * `CliUserError` when the commit can't be determined or no run matches it.
 */
export const resolveTestRunForCommitOrThrow = async (
  client: MeticulousClient,
  apiToken: string,
  commitSha: string | undefined,
): Promise<ResolvedTestRun> => {
  const sha = await getCommitSha(commitSha);
  if (!sha) {
    throw new CliUserError(
      "Could not determine a commit SHA. Pass --commitSha or --testRunId, or run inside a git repository.",
    );
  }
  const { projectId } = resolveProjectIdentifier(apiToken);
  const { testRunId, status } = await getTestRunForCommit(client, sha, {
    projectId,
  });
  if (testRunId == null || status == null) {
    throw new CliUserError(`No test run found for commit ${sha}.`);
  }
  log(`Resolved test run ${testRunId} for commit ${sha} (status: ${status}).`);
  return { testRunId, status };
};

/**
 * Best-effort variant for auto-retry paths: returns `null` (rather than
 * throwing) when the commit can't be determined, no project is selected, or no
 * run matches, so the caller can fall back to its original behaviour.
 */
export const tryResolveTestRunForCommit = async (
  client: MeticulousClient,
  apiToken: string,
  commitSha: string | undefined,
): Promise<ResolvedTestRun | null> => {
  try {
    const sha = await getCommitSha(commitSha);
    if (!sha) {
      return null;
    }
    const { projectId } = resolveProjectIdentifier(apiToken);
    const { testRunId, status } = await getTestRunForCommit(client, sha, {
      projectId,
    });
    return testRunId != null && status != null
      ? { testRunId, status }
      : null;
  } catch {
    return null;
  }
};

/**
 * Throws a `CliUserError` if the given test run is still in progress, since
 * coverage only exists once a run has finished. Used to guard an explicitly
 * passed `testRunId`, mirroring the in-progress check applied to runs resolved
 * from a commit.
 */
export const throwIfTestRunCoverageNotReady = async (
  client: MeticulousClient,
  testRunId: string,
): Promise<void> => {
  const testRun = await getTestRun({ client, testRunId });
  if (isTestRunInProgress(testRun.status)) {
    throw new CliUserError(
      `Test run ${testRunId} is still in progress (status: ${testRun.status}); coverage is not available yet.`,
    );
  }
};

/**
 * Polls a (possibly in-progress) test run until it reaches a terminal status,
 * logging each transition. Throws a `CliUserError` if the run finishes
 * unsuccessfully (`ExecutionError`/`Aborted`). Returns the final status.
 */
export const awaitTestRunCompletion = async (
  client: MeticulousClient,
  testRunId: string,
): Promise<TestRunStatus> => {
  let testRun = await getTestRun({ client, testRunId });
  if (isTestRunInProgress(testRun.status)) {
    log(`Waiting for test run ${testRunId} to complete...`);
  }
  while (isTestRunInProgress(testRun.status)) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    testRun = await getTestRun({ client, testRunId });
    log(`Test run status: ${testRun.status}`);
  }
  if (testRun.status === "ExecutionError" || testRun.status === "Aborted") {
    throw new CliUserError(
      `Test run ${testRunId} finished unsuccessfully (status: ${testRun.status}).`,
    );
  }
  return testRun.status;
};
