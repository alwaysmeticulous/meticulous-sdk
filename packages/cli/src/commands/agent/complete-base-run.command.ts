import type { TestRunStatus } from "@alwaysmeticulous/api";
import {
  completeBaseRun,
  createClientWithOAuth,
  getTestRun,
  IN_PROGRESS_TEST_RUN_STATUS,
  type CompleteBaseRunResponse,
  type MeticulousClient,
  type TestRun,
} from "@alwaysmeticulous/client";
import { logNotice, logProgress } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { errorResponseBody } from "../../utils/error-response-body";
import {
  POLL_TIMEOUT_MS as STALL_GRACE_MS,
  resolveTestRunForCommitOrThrow,
} from "../../utils/resolve-test-run-from-commit";

/**
 * How long to wait for a completed base run to finish. Longer than the usual
 * poll deadline: this waits out a full test run's replays (every selected
 * session), not a run that was already most of the way through.
 */
const COMPLETION_TIMEOUT_MS = 45 * 60 * 1000;

/** How often to re-check completion while waiting. */
const POLL_INTERVAL_MS = 10_000;

/**
 * How often to re-invoke `complete-base-run` itself (the write that actually
 * schedules/retries sessions) while waiting, rather than on every
 * {@link POLL_INTERVAL_MS} tick. Most ticks only need a cheap read: a live
 * chunk resolves on its own, and the read-only `getTestRun` poll already
 * shows that. Re-running the write path is only useful for picking up a
 * session that has newly become eligible again (e.g. a chunk that just
 * reconciled to `ExecutionError` — see `computeCoveredSessionIds`), which
 * happens on the timescale of a workflow concluding, not seconds — so a much
 * coarser cadence still retries promptly without hitting the append-only
 * transaction and its lock on every tick.
 */
const RESCHEDULE_INTERVAL_MS = 60_000;

/**
 * `STALL_GRACE_MS` (imported as `POLL_TIMEOUT_MS`) is how long
 * `unexecutedSessionCount` must stay flat (no new sessions scheduled, count
 * unchanged) before giving up early rather than waiting out the full timeout.
 * A session pool has no status this command can wait on — see
 * {@link waitForBaseRunCompletion} — so a stall is detected from the
 * completeness count itself: sessions genuinely in flight keep moving as
 * their chunk completes, while sessions `completeBaseRun` currently has
 * nothing further to schedule for stay flat indefinitely. A chunk replays
 * many sessions together and only reports once the whole chunk finishes, so a
 * perfectly healthy chunk can show no progress at all for several minutes —
 * this has to be sized in minutes, not seconds, or it reads normal replay
 * time as a dead end. Kept well under `COMPLETION_TIMEOUT_MS` so a
 * genuinely-stuck run is still reported long before the full timeout.
 */

interface Options {
  apiToken?: string | null | undefined;
  testRunId: string | undefined;
  commitSha: string | undefined;
  dontWaitForTestRunToComplete: boolean;
  json: boolean;
  project?: string | undefined;
}

const handler = async ({
  apiToken,
  testRunId,
  commitSha,
  dontWaitForTestRunToComplete,
  json,
  project,
}: Options): Promise<void> => {
  if (testRunId != null && commitSha != null) {
    throw new CliUserError(
      "Pass either --testRunId or --commitSha, not both: they name the run to complete two different ways.",
    );
  }
  const client = await createClientWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  // `resolveTestRunForCommitOrThrow` defaults to the local HEAD and logs the
  // resolved commit (warning if the tree is dirty), as the other commit-resolving
  // agent commands do.
  const resolvedTestRunId =
    testRunId ??
    (await resolveTestRunForCommitOrThrow(client, commitSha, project))
      .testRunId;
  const result = await requestCompletion(client, resolvedTestRunId);

  // Summary on stderr regardless of --json (which only changes stdout).
  // `sessionsScheduled === 0` alone doesn't mean "nothing to do" — it's also
  // what a call sees while earlier-scheduled work is still in flight, so that
  // case gets its own message rather than falsely claiming completion.
  if (result.sessionsScheduled > 0) {
    logNotice(
      `Scheduled ${result.sessionsScheduled} of test run ${resolvedTestRunId}'s ${result.configuredSessionCount} selected sessions for replay.`,
    );
  } else if (result.unexecutedSessionCount === 0) {
    logNotice(
      `Test run ${resolvedTestRunId} has already replayed all ${result.configuredSessionCount} of its selected sessions; nothing to do.`,
    );
  } else {
    logNotice(
      `Test run ${resolvedTestRunId} has nothing further to schedule right now, but ${result.unexecutedSessionCount} of its ${result.configuredSessionCount} selected sessions still lack a result — likely still in flight from an earlier call.`,
    );
  }

  // Wait by default, so the run this returns is one whose coverage can be
  // asked for straight away — the point of completing it. Nothing to wait for
  // once coverage is already servable.
  let { status, unexecutedSessionCount } = result;
  if (!dontWaitForTestRunToComplete && !isCoverageServable(result)) {
    ({ status, unexecutedSessionCount } = await waitForBaseRunCompletion(
      client,
      resolvedTestRunId,
      result,
    ));
  }

  if (json) {
    printJson({ ...result, status, unexecutedSessionCount });
  } else {
    printKeyValueLines({ ...result, status, unexecutedSessionCount });
  }
};

/**
 * Whether `js-coverage` will actually succeed for this run right now.
 * `unexecutedSessionCount === 0` alone isn't enough: session results land
 * per-chunk as soon as replays finish, but the coverage artifact `js-coverage`
 * serves is only rewritten by a later, separate post-process step — which is
 * also what settles a session pool's `status` into a genuinely completed one
 * once *its* snapshot of the configured set is fully covered (mirrors the
 * backend's own gate in `AgentApiService.assertBaseRunCoverageComplete`). So
 * both conditions must hold: nothing left unexecuted, and `status` has
 * settled rather than merely left `Partial` — appending chunks takes a pool
 * through `Running`/`PostProcessing` first (`IN_PROGRESS_TEST_RUN_STATUS`),
 * and the artifact isn't guaranteed to include the new results until
 * post-process next runs.
 */
const isCoverageServable = ({
  status,
  unexecutedSessionCount,
}: {
  status: TestRunStatus;
  unexecutedSessionCount: number;
}): boolean =>
  unexecutedSessionCount === 0 &&
  status !== "Partial" &&
  !IN_PROGRESS_TEST_RUN_STATUS.includes(status);

/**
 * The same session-completeness diff the backend's
 * `TestRunChunkService.findBaseRunSessionCompleteness` computes, done
 * client-side from a plain `getTestRun` read: `configData.testCases` is the
 * configured set, `resultData.results` is folded live as chunks complete (see
 * `TestRunService.getResults`), so diffing the two session-ID sets is exactly
 * `unexecutedSessionCount` without needing the write endpoint at all.
 */
const countUnexecutedSessions = (testRun: TestRun): number => {
  const resultSessionIds = new Set(
    (testRun.resultData?.results ?? []).map((result) => result.sessionId),
  );
  const configuredSessionIds = new Set(
    (testRun.configData.testCases ?? []).map((testCase) => testCase.sessionId),
  );
  let unexecutedSessionCount = 0;
  for (const sessionId of configuredSessionIds) {
    if (!resultSessionIds.has(sessionId)) {
      unexecutedSessionCount++;
    }
  }
  return unexecutedSessionCount;
};

/**
 * Waits until `complete-base-run`'s coverage is servable (see
 * {@link isCoverageServable}), polling the plain, read-only `getTestRun`
 * every {@link POLL_INTERVAL_MS} rather than re-invoking `complete-base-run`
 * itself (idempotent, but a write — see its own docstring) on every tick:
 * `getTestRun` already carries everything needed (see
 * {@link countUnexecutedSessions}), so most ticks need no write-path traffic
 * at all. `complete-base-run` is still re-invoked, at the coarser
 * {@link RESCHEDULE_INTERVAL_MS}, to actually pick up anything newly eligible
 * to (re-)schedule (see `BaseRunCompletionService.completeBaseRun`) —
 * `getTestRun` only observes progress, it can't cause it.
 *
 * A session pool's `status` by itself is not a wait-worthy signal: it can
 * rest in `Partial` indefinitely between requests (not "still running"), and
 * can equally sit in a stale `Success`/`Failure` from before this call's work
 * even starts (scheduling doesn't itself move the status). Unexecuted
 * sessions reaching `0` is the signal that scheduling is done; `status`
 * leaving `Partial` is the signal that the coverage artifact has caught up
 * with that.
 *
 * Gives up early — rather than waiting out the full timeout — once the
 * unexecuted count has stayed flat for {@link STALL_GRACE_MS}. Sessions
 * actually in flight (scheduled by this call or an earlier one) keep moving
 * as their chunks complete, and a session whose chunk failed with
 * `ExecutionError` (e.g. its pod never actually ran) gets rescheduled the
 * next time this reaches {@link RESCHEDULE_INTERVAL_MS} — so a *sustained*
 * flat count usually means the remainder is just taking longer than usual,
 * not that it's permanently stuck. This can't be told apart from a genuinely
 * wedged state with certainty, hence the hedged error message rather than a
 * confident diagnosis.
 */
const waitForBaseRunCompletion = async (
  client: MeticulousClient,
  testRunId: string,
  initial: CompleteBaseRunResponse,
): Promise<
  Pick<CompleteBaseRunResponse, "status" | "unexecutedSessionCount">
> => {
  logProgress(`Waiting for test run ${testRunId} to finish replaying...`);
  let unexecutedSessionCount = initial.unexecutedSessionCount;
  let status: TestRunStatus = initial.status;
  let stalledSinceMs: number | null = null;
  let lastRescheduledAtMs = performance.now();
  const deadline = performance.now() + COMPLETION_TIMEOUT_MS;
  while (!isCoverageServable({ status, unexecutedSessionCount })) {
    if (performance.now() >= deadline) {
      throw new CliUserError(
        unexecutedSessionCount > 0
          ? `Test run ${testRunId} still has ${unexecutedSessionCount} session(s) without a result after ${Math.round(COMPLETION_TIMEOUT_MS / 60_000)} minutes. It may still be running — check back later, or re-run with --dontWaitForTestRunToComplete to return immediately.`
          : `Test run ${testRunId} has replayed all its selected sessions, but its coverage still hasn't finished being recomputed for the full set after ${Math.round(COMPLETION_TIMEOUT_MS / 60_000)} minutes (status: ${status}). Check back later, or re-run with --dontWaitForTestRunToComplete to return immediately.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const testRun = await getTestRun({ client, testRunId });
    const newUnexecutedSessionCount = countUnexecutedSessions(testRun);
    const noProgress = newUnexecutedSessionCount === unexecutedSessionCount;
    unexecutedSessionCount = newUnexecutedSessionCount;
    status = testRun.status;
    if (isCoverageServable({ status, unexecutedSessionCount })) {
      break;
    }
    const now = performance.now();
    if (!noProgress) {
      stalledSinceMs = null;
    } else if (stalledSinceMs == null) {
      stalledSinceMs = now;
    } else if (now - stalledSinceMs >= STALL_GRACE_MS) {
      throw new CliUserError(
        unexecutedSessionCount > 0
          ? `Test run ${testRunId} still has ${unexecutedSessionCount} session(s) without a result, and complete-base-run has had nothing further to schedule for them for over ${Math.round(STALL_GRACE_MS / 60_000)} minutes — this may just need more time. Check back later, re-run with --dontWaitForTestRunToComplete to return immediately, or ask for the project's overall coverage instead (js-coverage --latestForProject).`
          : `Test run ${testRunId} has replayed all its selected sessions, but its coverage still hasn't finished being recomputed for the full set (status: ${status}) after over ${Math.round(STALL_GRACE_MS / 60_000)} minutes. This may just need more time — check back later, re-run with --dontWaitForTestRunToComplete to return immediately, or ask for the project's overall coverage instead (js-coverage --latestForProject).`,
      );
    }
    if (now - lastRescheduledAtMs >= RESCHEDULE_INTERVAL_MS) {
      lastRescheduledAtMs = now;
      const rescheduled = await requestCompletion(client, testRunId);
      unexecutedSessionCount = rescheduled.unexecutedSessionCount;
      status = rescheduled.status;
      // Picking up newly-eligible work here is real progress even though
      // `unexecutedSessionCount` itself won't move until it lands a result —
      // without this, the stall clock (armed on an earlier, unrelated tick)
      // can still time out right after a reschedule found something to do.
      if (rescheduled.sessionsScheduled > 0) {
        stalledSinceMs = null;
      }
    }
  }
  return { status, unexecutedSessionCount };
};

/**
 * The backend's response-body `reason`s marking a request it declines as a
 * caller mistake rather than a fault — matched instead of the prose (the same
 * convention `js-coverage` follows) so a genuine failure still reaches the
 * generic error path and Sentry. Kept in step with
 * `packages/webapp-backend/src/agent/complete-base-run.errors.ts`.
 */
const COMPLETION_REJECTION_REASONS = new Set([
  "not-a-base-run",
  "dead-end-status",
  "ephemeral-deployment",
]);

const requestCompletion = async (
  client: MeticulousClient,
  testRunId: string,
): Promise<CompleteBaseRunResponse> => {
  try {
    return await completeBaseRun(client, testRunId);
  } catch (error) {
    const body = errorResponseBody(error);
    if (
      body?.reason != null &&
      COMPLETION_REJECTION_REASONS.has(body.reason) &&
      body.message != null
    ) {
      throw new CliUserError(body.message);
    }
    throw error;
  }
};

const printKeyValueLines = (result: CompleteBaseRunResponse): void => {
  for (const [key, value] of Object.entries(result)) {
    console.log(`${key}:\t${value}`);
  }
};

export const completeBaseRunCommand: CommandModule<unknown, Options> = {
  command: "complete-base-run",
  describe:
    "Replay the selected sessions a base run has not run yet, so its coverage describes its commit. A base run (the usual outcome for a commit on your default branch) replays sessions on demand for whichever PRs compare against it, so it can sit at any fraction of the project's selected set, and agent js-coverage refuses it while any are missing or while its coverage hasn't finished being recomputed for the full set. This schedules the rest, then waits for its coverage to actually be servable (pass --dontWaitForTestRunToComplete to return as soon as the work is scheduled); a session pool's own status cannot be waited on directly, since it can rest indefinitely between requests. Outputs testRunId, status, unexecutedSessionCount, sessionsScheduled and configuredSessionCount, one per line; sessionsScheduled is 0 when the run had already replayed everything, or when everything left is already covered by a chunk from an earlier call (running this twice is a no-op, not an error), and unexecutedSessionCount is 0 once every selected session has a result — js-coverage additionally needs status to have settled into a completed status (not just left Partial: appending chunks passes through Running/PostProcessing first). Costs a full test run's replays, so ask for it when you want this commit's own coverage — for a rough project-level picture 'agent js-coverage --latestForProject' is free. Fails for a run that is not a base run, is itself a dead end at the whole-run level (status ExecutionError/Aborted — not a single chunk, which is retried automatically), or whose deployment was an ephemeral tunnel that is no longer reachable; if nothing has changed for a while, this command reports that rather than waiting out the full timeout.",
  builder: {
    apiToken: { string: true, description: "Meticulous API token." },
    testRunId: {
      string: true,
      description:
        "The base run to complete. Cannot be combined with --commitSha.",
    },
    commitSha: {
      string: true,
      description:
        "A commit SHA, used as an alternative to --testRunId: completes the latest test run for the commit. Defaults to the current git HEAD when neither is given.",
    },
    project: {
      string: true,
      description:
        "The project to look up the commit in (id, 'org/proj', or simply 'proj'). One-off override, when omitted uses the user-configured default project.",
    },
    dontWaitForTestRunToComplete: {
      boolean: true,
      default: false,
      description:
        "Return as soon as the replays are scheduled instead of the default of blocking until the run finishes; its coverage is only complete once it has.",
    },
    json: {
      boolean: true,
      default: false,
      description: "Output the result as JSON instead of one field per line.",
    },
  },
  handler: wrapHandler(handler),
};
