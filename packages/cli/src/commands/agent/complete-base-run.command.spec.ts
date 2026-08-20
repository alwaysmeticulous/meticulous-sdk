import type * as MeticulousClientModule from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../../utils/cli-user-error";
import { completeBaseRunCommand } from "./complete-base-run.command";

// Make wrapHandler a passthrough so handler errors propagate directly to tests
// rather than being swallowed by process.exit().
vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  completeBaseRun: vi.fn(),
  getTestRun: vi.fn(),
  getTestRunForCommit: vi.fn(),
  isFetchError: vi.fn(),
  logNotice: vi.fn(),
  logProgress: vi.fn(),
  getCommitSha: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", async (importOriginal) => ({
  ...(await importOriginal<typeof MeticulousClientModule>()),
  createClientWithOAuth: mocks.createClientWithOAuth,
  completeBaseRun: mocks.completeBaseRun,
  getTestRun: mocks.getTestRun,
  getTestRunForCommit: mocks.getTestRunForCommit,
  isFetchError: mocks.isFetchError,
}));

vi.mock("@alwaysmeticulous/common", () => ({
  logNotice: mocks.logNotice,
  logProgress: mocks.logProgress,
  initLogger: vi.fn(),
  getCommitSha: mocks.getCommitSha,
  getUntrackedFiles: vi.fn().mockResolvedValue([]),
  hasUncommittedChanges: vi.fn().mockResolvedValue(false),
}));

const runHandler = (overrides: Record<string, unknown> = {}) =>
  (
    completeBaseRunCommand as { handler: (args: unknown) => Promise<void> }
  ).handler({
    apiToken: undefined,
    testRunId: "tr-base",
    commitSha: undefined,
    project: undefined,
    dontWaitForTestRunToComplete: true,
    json: false,
    ...overrides,
  });

const CONFIGURED_SESSION_IDS = ["sess-1", "sess-2", "sess-3"];

/**
 * A `getTestRun` fixture: `waitForBaseRunCompletion` polls this (not
 * `completeBaseRun`) to compute `unexecutedSessionCount` by diffing
 * `configData.testCases` against `resultData.results`, mirroring the
 * backend's own `findBaseRunSessionCompleteness`.
 */
const testRunFixture = ({
  status,
  executedSessionIds = [],
}: {
  status: string;
  executedSessionIds?: string[];
}) => ({
  status,
  configData: {
    testCases: CONFIGURED_SESSION_IDS.map((sessionId) => ({ sessionId })),
  },
  resultData: {
    results: executedSessionIds.map((sessionId) => ({ sessionId })),
  },
});

describe("complete-base-run handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getCommitSha.mockResolvedValue("sha-1");
    mocks.completeBaseRun.mockResolvedValue({
      testRunId: "tr-base",
      status: "Partial",
      sessionsScheduled: 2,
      configuredSessionCount: 3,
      unexecutedSessionCount: 2,
    });
    mocks.getTestRun.mockResolvedValue(
      testRunFixture({
        status: "Success",
        executedSessionIds: CONFIGURED_SESSION_IDS,
      }),
    );
    mocks.getTestRunForCommit.mockResolvedValue({
      testRunId: "tr-base",
      status: "Partial",
    });
    mocks.isFetchError.mockImplementation(
      (error: unknown) =>
        typeof error === "object" && error != null && "response" in error,
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("completes the run named by --testRunId without a commit lookup", async () => {
    await runHandler();
    expect(mocks.completeBaseRun).toHaveBeenCalledWith({}, "tr-base");
    expect(mocks.getTestRunForCommit).not.toHaveBeenCalled();
  });

  it("resolves the run from the current commit when no id is given", async () => {
    await runHandler({ testRunId: undefined });
    expect(mocks.completeBaseRun).toHaveBeenCalledWith({}, "tr-base");
  });

  it("rejects naming the run two ways at once", async () => {
    await expect(runHandler({ commitSha: "sha-2" })).rejects.toBeInstanceOf(
      CliUserError,
    );
    expect(mocks.completeBaseRun).not.toHaveBeenCalled();
  });

  it("says how much of the selected set it scheduled", async () => {
    await runHandler();
    expect(mocks.logNotice).toHaveBeenCalledWith(
      expect.stringMatching(/Scheduled 2 of test run tr-base's 3/),
    );
  });

  // Idempotent: asking again must read as "nothing to do", not as an error or as
  // work that was scheduled.
  it("reports an already-complete run as nothing to do", async () => {
    mocks.completeBaseRun.mockResolvedValue({
      testRunId: "tr-base",
      status: "Success",
      sessionsScheduled: 0,
      configuredSessionCount: 3,
      unexecutedSessionCount: 0,
    });

    await runHandler();
    expect(mocks.logNotice).toHaveBeenCalledWith(
      expect.stringMatching(/already replayed all 3/),
    );
  });

  // sessionsScheduled === 0 is also what a call sees while earlier-scheduled
  // work is still in flight — must not be read as "nothing to do" just
  // because this call itself scheduled nothing.
  it("reports a remainder still in flight distinctly from a complete run", async () => {
    mocks.completeBaseRun.mockResolvedValue({
      testRunId: "tr-base",
      status: "Partial",
      sessionsScheduled: 0,
      configuredSessionCount: 3,
      unexecutedSessionCount: 2,
    });

    await runHandler();
    expect(mocks.logNotice).toHaveBeenCalledWith(
      expect.stringMatching(/2 of its 3 selected sessions still lack a result/),
    );
    expect(mocks.logNotice).not.toHaveBeenCalledWith(
      expect.stringMatching(/already replayed all/),
    );
  });

  // The point of completing a run is being able to ask for its coverage, so
  // the default is to wait for it to finish — by polling the read-only
  // getTestRun (not re-posting complete-base-run) until both
  // `unexecutedSessionCount` reaches 0 AND `status` has left `Partial`
  // (coverage is only servable once post-process has caught up with the
  // fully-covered set — see `isCoverageServable`).
  it("waits for the run to finish by default", async () => {
    mocks.completeBaseRun.mockResolvedValue({
      testRunId: "tr-base",
      status: "Partial",
      sessionsScheduled: 2,
      configuredSessionCount: 3,
      unexecutedSessionCount: 2,
    });
    mocks.getTestRun
      .mockResolvedValueOnce(
        testRunFixture({ status: "Partial", executedSessionIds: ["sess-1"] }),
      )
      .mockResolvedValue(
        testRunFixture({
          status: "Success",
          executedSessionIds: CONFIGURED_SESSION_IDS,
        }),
      );

    vi.useFakeTimers();
    try {
      const handled = runHandler({ dontWaitForTestRunToComplete: false });
      await vi.runAllTimersAsync();
      await handled;
    } finally {
      vi.useRealTimers();
    }

    expect(mocks.getTestRun.mock.calls.length).toBeGreaterThan(1);
    // The whole point of polling getTestRun: no need to re-post
    // complete-base-run just to observe progress.
    expect(mocks.completeBaseRun).toHaveBeenCalledTimes(1);
  });

  // Progress must be read off the session-result diff, not the run's status —
  // which can stay put (or even look terminal) the entire time work is still
  // in flight, since a newly appended chunk's status transition happens
  // independently of the run-level status field.
  it("keeps polling while sessions remain unexecuted, even though the run's own status never changes", async () => {
    mocks.completeBaseRun.mockResolvedValue({
      testRunId: "tr-base",
      status: "Success",
      sessionsScheduled: 2,
      configuredSessionCount: 3,
      unexecutedSessionCount: 2,
    });
    mocks.getTestRun
      .mockResolvedValueOnce(
        testRunFixture({
          status: "Success",
          executedSessionIds: ["sess-1"],
        }),
      )
      .mockResolvedValueOnce(
        testRunFixture({
          status: "Success",
          executedSessionIds: ["sess-1", "sess-2"],
        }),
      )
      .mockResolvedValue(
        testRunFixture({
          status: "Success",
          executedSessionIds: CONFIGURED_SESSION_IDS,
        }),
      );

    vi.useFakeTimers();
    try {
      const handled = runHandler({
        dontWaitForTestRunToComplete: false,
        json: true,
      });
      await vi.runAllTimersAsync();
      await handled;
    } finally {
      vi.useRealTimers();
    }

    expect(mocks.getTestRun.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"unexecutedSessionCount": 0'),
    );
  });

  // `unexecutedSessionCount` reaching 0 doesn't mean coverage is servable
  // yet: session results land per-chunk as soon as replays finish, but the
  // coverage artifact is only rewritten by a later post-process run — which
  // is also what moves `status` off `Partial`. Must keep polling through that
  // gap rather than treating a flat 0 as done.
  it("keeps waiting once sessions are all executed but status is still Partial", async () => {
    mocks.completeBaseRun.mockResolvedValue({
      testRunId: "tr-base",
      status: "Partial",
      sessionsScheduled: 2,
      configuredSessionCount: 3,
      unexecutedSessionCount: 2,
    });
    mocks.getTestRun
      .mockResolvedValueOnce(
        testRunFixture({
          status: "Partial",
          executedSessionIds: CONFIGURED_SESSION_IDS,
        }),
      )
      .mockResolvedValue(
        testRunFixture({
          status: "Success",
          executedSessionIds: CONFIGURED_SESSION_IDS,
        }),
      );

    vi.useFakeTimers();
    try {
      const handled = runHandler({ dontWaitForTestRunToComplete: false });
      await vi.runAllTimersAsync();
      await handled;
    } finally {
      vi.useRealTimers();
    }

    expect(mocks.getTestRun.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mocks.getTestRun).toHaveBeenCalledWith({
      client: {},
      testRunId: "tr-base",
    });
  });

  // Appending chunks takes a pool through `Running`/`PostProcessing` before
  // post-process next rewrites the coverage artifact, mirroring the backend's
  // own gate (`AgentApiService.assertBaseRunCoverageComplete`) — a status
  // merely `!== "Partial"` would wrongly treat `Running` as settled and return
  // before `js-coverage` can actually serve this run.
  it("keeps waiting once sessions are all executed but status is still in-progress (Running)", async () => {
    mocks.getTestRun
      .mockResolvedValueOnce(
        testRunFixture({
          status: "Running",
          executedSessionIds: CONFIGURED_SESSION_IDS,
        }),
      )
      .mockResolvedValue(
        testRunFixture({
          status: "Success",
          executedSessionIds: CONFIGURED_SESSION_IDS,
        }),
      );

    vi.useFakeTimers();
    try {
      const handled = runHandler({ dontWaitForTestRunToComplete: false });
      await vi.runAllTimersAsync();
      await handled;
    } finally {
      vi.useRealTimers();
    }

    expect(mocks.getTestRun.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  // complete-base-run keeps finding nothing further to schedule, so waiting
  // out the full 45-minute timeout would be a long time to learn that. But a
  // healthy chunk can also show no progress for minutes at a time (it only
  // reports once the whole chunk finishes, and an ExecutionError chunk gets
  // retried automatically), so this must not fire quickly or claim certainty
  // about why it's stuck.
  it("gives up early, rather than waiting out the timeout, once polling shows no progress for the full stall grace period", async () => {
    // Both the read-only poll and the periodic reschedule report the same
    // stuck state throughout — nothing ever moves.
    mocks.completeBaseRun.mockResolvedValue({
      testRunId: "tr-base",
      status: "Partial",
      sessionsScheduled: 0,
      configuredSessionCount: 3,
      unexecutedSessionCount: 1,
    });
    mocks.getTestRun.mockResolvedValue(
      testRunFixture({
        status: "Partial",
        executedSessionIds: ["sess-1", "sess-2"],
      }),
    );

    vi.useFakeTimers();
    try {
      const handled = runHandler({ dontWaitForTestRunToComplete: false });
      const assertion = expect(handled).rejects.toThrow(
        /nothing further to schedule/,
      );
      await vi.runAllTimersAsync();
      await assertion;
    } finally {
      vi.useRealTimers();
    }

    // The stall grace period is minutes, not seconds — assert on call count
    // (10s polls) rather than a hardcoded duration, so this doesn't silently
    // stop exercising the real constant if it's retuned again later.
    expect(mocks.getTestRun.mock.calls.length).toBeGreaterThan(30);
    // Re-invoked periodically (every 60s) to retry anything newly eligible,
    // but far less often than every 10s poll.
    expect(mocks.completeBaseRun.mock.calls.length).toBeGreaterThan(1);
    expect(mocks.completeBaseRun.mock.calls.length).toBeLessThan(20);
  });

  // The periodic reschedule can pick up a session newly eligible again (e.g.
  // one whose only chunk reconciled to ExecutionError) well before the stall
  // grace period expires — real progress, even though the read-only poll
  // won't see `unexecutedSessionCount` move until that fresh chunk lands a
  // result. That must reset the grace period rather than let it expire
  // underneath work that was in fact just picked back up.
  it("does not give up when a periodic reschedule finds new work mid-stall", async () => {
    const start = performance.now();
    let hasRescheduled = false;
    mocks.completeBaseRun.mockImplementation(() => {
      let sessionsScheduled = 0;
      // Just before the original 10-minute grace period would otherwise
      // expire (counted from the first no-progress poll, a few seconds in).
      if (!hasRescheduled && performance.now() - start >= 9 * 60 * 1000) {
        sessionsScheduled = 1;
        hasRescheduled = true;
      }
      return {
        testRunId: "tr-base",
        status: "Partial",
        sessionsScheduled,
        configuredSessionCount: 3,
        unexecutedSessionCount: 1,
      };
    });
    mocks.getTestRun.mockResolvedValue(
      testRunFixture({
        status: "Partial",
        executedSessionIds: ["sess-1", "sess-2"],
      }),
    );

    vi.useFakeTimers();
    try {
      const handled = runHandler({ dontWaitForTestRunToComplete: false });
      const assertion = expect(handled).resolves.toBeUndefined();
      // Past the point the original grace period would have expired — without
      // the reset this would already have thrown "nothing further to
      // schedule".
      await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
      mocks.getTestRun.mockResolvedValue(
        testRunFixture({
          status: "Success",
          executedSessionIds: CONFIGURED_SESSION_IDS,
        }),
      );
      await vi.runAllTimersAsync();
      await assertion;
    } finally {
      vi.useRealTimers();
    }

    expect(hasRescheduled).toBe(true);
  });

  // A chunk bundling many sessions can plausibly go several minutes between
  // polls without any progress before it finishes — that must not be
  // mistaken for a permanent failure.
  it("does not give up during a stall shorter than the grace period", async () => {
    mocks.completeBaseRun.mockResolvedValue({
      testRunId: "tr-base",
      status: "Partial",
      sessionsScheduled: 0,
      configuredSessionCount: 3,
      unexecutedSessionCount: 2,
    });
    mocks.getTestRun.mockResolvedValue(
      testRunFixture({
        status: "Partial",
        executedSessionIds: ["sess-1"],
      }),
    );

    vi.useFakeTimers();
    try {
      const handled = runHandler({ dontWaitForTestRunToComplete: false });
      // ~5 minutes of no visible progress — comfortably past the old
      // 30s/3-poll threshold, well short of the new grace period — before the
      // remaining sessions' chunk finally reports.
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      mocks.getTestRun.mockResolvedValue(
        testRunFixture({
          status: "Success",
          executedSessionIds: CONFIGURED_SESSION_IDS,
        }),
      );
      await vi.runAllTimersAsync();
      await handled;
    } finally {
      vi.useRealTimers();
    }

    expect(mocks.getTestRun).toHaveBeenCalled();
  });

  it("does not wait when nothing was scheduled and nothing remains unexecuted", async () => {
    mocks.completeBaseRun.mockResolvedValue({
      testRunId: "tr-base",
      status: "Success",
      sessionsScheduled: 0,
      configuredSessionCount: 3,
      unexecutedSessionCount: 0,
    });

    await runHandler({ dontWaitForTestRunToComplete: false });
    expect(mocks.getTestRun).not.toHaveBeenCalled();
  });

  it.each(["not-a-base-run", "ephemeral-deployment"])(
    "turns the backend's %s refusal into a CliUserError",
    async (reason) => {
      mocks.completeBaseRun.mockRejectedValue({
        response: {
          status: 400,
          data: { reason, message: "Test run tr-base cannot be completed." },
        },
      });

      await expect(runHandler()).rejects.toBeInstanceOf(CliUserError);
      await expect(runHandler()).rejects.toThrow(/tr-base cannot be completed/);
    },
  );

  // Anything else is a genuine failure and must keep reaching the generic
  // (Sentry) path rather than being dressed up as a user error.
  it("leaves an unexpected failure alone", async () => {
    const serverError = { response: { status: 500, data: {} } };
    mocks.completeBaseRun.mockRejectedValue(serverError);
    await expect(runHandler()).rejects.toBe(serverError);
  });
});
