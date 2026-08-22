import type { TestRunStatus } from "@alwaysmeticulous/api";
import {
  completeBaseRun,
  createClientWithOAuth,
  getTestRun,
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
  assertTestRunComplete,
  isTestRunFailed,
  isTestRunComplete,
  POLL_TIMEOUT_MS,
  resolveTestRunForCommitOrThrow,
} from "../../utils/resolve-test-run-from-commit";

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
  } else if (result.unexecutedSessionCount > result.unobtainableSessionCount) {
    logNotice(
      `Test run ${resolvedTestRunId} has nothing further to schedule right now, but ${result.unexecutedSessionCount} of its ${result.configuredSessionCount} selected sessions still lack a result — likely still in flight from an earlier call.`,
    );
  } else {
    logNotice(
      `Test run ${resolvedTestRunId} has ${result.unobtainableSessionCount} of its ${result.configuredSessionCount} selected sessions that can no longer be replayed on it, and nothing left to schedule.`,
    );
  }

  // Wait by default, so the run this returns is one nothing more can be
  // scheduled for — the point of completing it.
  let { status, unexecutedSessionCount, unobtainableSessionCount } = result;
  if (!dontWaitForTestRunToComplete && !hasReplayedAllItCan(result)) {
    ({ status, unexecutedSessionCount, unobtainableSessionCount } =
      await waitForBaseRunCompletion(client, resolvedTestRunId, result));
  }

  const output = {
    ...result,
    status,
    unexecutedSessionCount,
    unobtainableSessionCount,
  };
  if (json) {
    printJson(output);
  } else {
    printKeyValueLines(output);
  }
};

/**
 * Whether the run is as complete as replaying can make it — what this command
 * waits for, computed from the cheap read-only poll so the loop needs no
 * write-path call to finish.
 *
 * `unexecutedSessionCount` reaching `unobtainableSessionCount` is the
 * scheduling half: nothing is left that replaying could still supply.
 * `isTestRunComplete` — a usable `Success`/`Failure` verdict, matching the
 * backend's own gate — is the artifact half: results land per-chunk as soon as
 * replays finish, but the coverage `js-coverage` serves is only rewritten by a
 * later, separate post-process step, which is also what settles a pool's
 * status. Without it, a pool that has just been appended to looks done while
 * the artifact still describes the old subset.
 *
 * Note this says nothing about whether the result is *good enough* for any
 * particular consumer — whether a remainder that can never be replayed is a
 * small enough share of the set to ignore is `js-coverage`'s question, and it
 * answers it with the numbers when it refuses. This command's job ends at
 * "nothing more can be scheduled".
 */
const hasReplayedAllItCan = ({
  status,
  unexecutedSessionCount,
  unobtainableSessionCount,
}: {
  status: TestRunStatus;
  unexecutedSessionCount: number;
  unobtainableSessionCount: number;
}): boolean =>
  unexecutedSessionCount <= unobtainableSessionCount &&
  isTestRunComplete(status);

/** Reject a whole-run terminal failure instead of polling a state that cannot recover. */
const assertCoverageCanStillBecomeServable = (
  testRunId: string,
  status: TestRunStatus,
): void => {
  if (isTestRunFailed(status) || status === "Skipped") {
    assertTestRunComplete(testRunId, status, { resultName: "coverage" });
  }
};

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
 * Waits until the run has replayed everything it can (see
 * {@link hasReplayedAllItCan}), polling the plain, read-only `getTestRun`
 * every {@link POLL_INTERVAL_MS} rather than re-invoking `complete-base-run`
 * itself (idempotent, but a write — see its own docstring) on every tick:
 * `getTestRun` carries enough to track progress (see
 * {@link countUnexecutedSessions}), so most ticks need no write-path traffic at
 * all. `complete-base-run` is re-invoked at the coarser
 * {@link RESCHEDULE_INTERVAL_MS}, which is what picks up anything newly
 * eligible to (re-)schedule (see `BaseRunCompletionService.completeBaseRun`)
 * and what refreshes `unobtainableSessionCount`; `getTestRun` only observes
 * progress, it can't cause it.
 *
 * A session pool's `status` by itself is not a wait-worthy signal: it can
 * rest in `Partial` indefinitely between requests (not "still running"), and
 * can equally sit in a stale `Success`/`Failure` from before this call's work
 * even starts (scheduling doesn't itself move the status). Sessions that could
 * still replay running out is the signal that scheduling is done; `status`
 * leaving `Partial` is the signal that the coverage artifact has caught up
 * with that.
 *
 * Gives up after {@link POLL_TIMEOUT_MS} — the same deadline
 * `awaitTestRunCompletion` uses for a regular test run — and returns
 * whatever it has rather than erroring: a base run's remaining sessions can
 * legitimately take longer than that to replay, so timing out here isn't a
 * failure, just an "ask again later." A remainder that is definitively beyond
 * recovering is not waited on at all — it satisfies {@link hasReplayedAllItCan},
 * so the command returns immediately and reports it.
 */
const waitForBaseRunCompletion = async (
  client: MeticulousClient,
  testRunId: string,
  initial: CompleteBaseRunResponse,
): Promise<
  Pick<
    CompleteBaseRunResponse,
    "status" | "unexecutedSessionCount" | "unobtainableSessionCount"
  >
> => {
  logProgress(`Waiting for test run ${testRunId} to finish replaying...`);
  let { unexecutedSessionCount, unobtainableSessionCount } = initial;
  let status: TestRunStatus = initial.status;
  let lastRescheduledAtMs = performance.now();
  const deadline = performance.now() + POLL_TIMEOUT_MS;
  while (
    !hasReplayedAllItCan({
      status,
      unexecutedSessionCount,
      unobtainableSessionCount,
    })
  ) {
    if (performance.now() >= deadline) {
      logNotice(
        unexecutedSessionCount > unobtainableSessionCount
          ? `Test run ${testRunId} still has ${unexecutedSessionCount - unobtainableSessionCount} session(s) that could still replay but have no result after ${Math.round(POLL_TIMEOUT_MS / 60_000)} minutes. It may still be running — check back later, or re-run this command to keep waiting.`
          : `Test run ${testRunId} has replayed everything it can, but its coverage still hasn't finished being recomputed for the full set after ${Math.round(POLL_TIMEOUT_MS / 60_000)} minutes (status: ${status}). Check back later, or re-run this command to keep waiting.`,
      );
      return { status, unexecutedSessionCount, unobtainableSessionCount };
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const testRun = await getTestRun({ client, testRunId });
    unexecutedSessionCount = countUnexecutedSessions(testRun);
    status = testRun.status;
    // A run that has gone fatally terminal will never serve coverage, so stop
    // rather than polling a state that cannot recover.
    assertCoverageCanStillBecomeServable(testRunId, status);
    const now = performance.now();
    if (now - lastRescheduledAtMs >= RESCHEDULE_INTERVAL_MS) {
      lastRescheduledAtMs = now;
      ({ unexecutedSessionCount, unobtainableSessionCount, status } =
        await requestCompletion(client, testRunId));
    }
  }
  return { status, unexecutedSessionCount, unobtainableSessionCount };
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
    "Replay the selected sessions which a base run has not run yet. Outputs testRunId, status, unexecutedSessionCount, unobtainableSessionCount, sessionsScheduled and configuredSessionCount, one per line. A base run (in particular associated with a main branch commit) runs sessions on demand for whichever PRs compare against it, so only part of its selected set has run at any point. Useful when a run needs to stand for its whole commit rather than one PR's slice — 'agent js-coverage', for instance, refuses an incomplete base run. Waits up to 10 minutes for nothing more to be schedulable (unexecutedSessionCount down to unobtainableSessionCount, the sessions that can never gain a result), returning whatever it has if that isn't reached by then; pass --dontWaitForTestRunToComplete to return as soon as the work is scheduled. Running it twice is a no-op, not an error.",
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
