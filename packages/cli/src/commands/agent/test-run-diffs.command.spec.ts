import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../../utils/cli-user-error";
import { testRunDiffsCommand } from "./test-run-diffs.command";

// Make wrapHandler a passthrough so handler errors propagate directly to tests
// rather than being swallowed by process.exit().
vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  resolveApiTokenWithOAuth: vi.fn(),
  getTestRun: vi.fn(),
  getTestRunDiffsSummary: vi.fn(),
  getTestRunDiffsSummaryCounts: vi.fn(),
  ensureTestRunFinished: vi.fn(),
  assertTestRunComplete: vi.fn(),
  isTestRunPartial: vi.fn(),
  resolveTestRunForCommitOrThrow: vi.fn(),
  logNotice: vi.fn(),
  logProgress: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  createClientWithOAuth: mocks.createClientWithOAuth,
  resolveApiTokenWithOAuth: mocks.resolveApiTokenWithOAuth,
  getTestRun: mocks.getTestRun,
  getTestRunDiffsSummary: mocks.getTestRunDiffsSummary,
  getTestRunDiffsSummaryCounts: mocks.getTestRunDiffsSummaryCounts,
}));

vi.mock("@alwaysmeticulous/common", () => ({
  logNotice: mocks.logNotice,
  logProgress: mocks.logProgress,
}));

vi.mock("../../utils/resolve-test-run-from-commit", () => ({
  ensureTestRunFinished: mocks.ensureTestRunFinished,
  assertTestRunComplete: mocks.assertTestRunComplete,
  isTestRunPartial: mocks.isTestRunPartial,
  resolveTestRunForCommitOrThrow: mocks.resolveTestRunForCommitOrThrow,
}));

class ProcessExitError extends Error {
  constructor(public readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

const runHandler = (overrides: Record<string, unknown> = {}) =>
  (
    testRunDiffsCommand as {
      handler: (args: unknown) => Promise<void>;
    }
  ).handler({
    apiToken: undefined,
    testRunId: "tr-1",
    commitSha: undefined,
    dontWaitForTestRunToComplete: false,
    includeReplayIds: false,
    includeMismatchFraction: false,
    includeDomDiffIds: false,
    includeAllDiffs: false,
    orderByReplayDiffs: false,
    includeReviews: false,
    includeReviewDecisions: false,
    onlyUnreviewed: false,
    onlyRejected: false,
    counts: false,
    json: false,
    ...overrides,
  });

let logSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

describe("test-run-diffs command polling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.resolveApiTokenWithOAuth.mockResolvedValue("token");
    mocks.getTestRun.mockResolvedValue({ status: "Success" });
    mocks.ensureTestRunFinished.mockResolvedValue("Success");
    mocks.assertTestRunComplete.mockReturnValue(undefined);
    mocks.isTestRunPartial.mockReturnValue(false);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new ProcessExitError(code);
    }) as never);
  });

  afterEach(() => {
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("retriggers once up front when the run starts out failed, then reports success", async () => {
    mocks.getTestRunDiffsSummary
      .mockResolvedValueOnce({ status: "failed", reason: "TIMED_OUT" }) // cold-start check
      .mockResolvedValueOnce({ status: "pending" }) // the retrigger call
      .mockResolvedValueOnce({ status: "complete", data: [] }); // first poll

    vi.useFakeTimers();
    const handlerPromise = runHandler();
    await vi.advanceTimersByTimeAsync(2_000);
    await handlerPromise;
    vi.useRealTimers();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(mocks.getTestRunDiffsSummary).toHaveBeenCalledTimes(3);
    expect(mocks.getTestRunDiffsSummary).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "tr-1",
      expect.objectContaining({ retrigger: true }),
    );
    // The poll after retriggering carries no retrigger param of its own.
    expect(mocks.getTestRunDiffsSummary).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      "tr-1",
      expect.not.objectContaining({ retrigger: true }),
    );
  });

  it("does not retrigger a second time if the freshly retriggered run also fails", async () => {
    mocks.getTestRunDiffsSummary
      .mockResolvedValueOnce({ status: "failed", reason: "TIMED_OUT" }) // cold-start check
      .mockResolvedValueOnce({ status: "pending" }) // the retrigger call
      .mockResolvedValueOnce({ status: "failed", reason: "FAILED" }); // first poll fails too

    vi.useFakeTimers();
    const handlerRejection =
      expect(runHandler()).rejects.toThrow(ProcessExitError);
    await vi.advanceTimersByTimeAsync(2_000);
    await handlerRejection;
    vi.useRealTimers();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.logNotice).toHaveBeenCalledWith(
      expect.stringContaining("failed (FAILED)"),
    );
    // Exactly one retrigger for the whole invocation: the initial cold-start
    // check plus the one retrigger call, nothing more.
    expect(mocks.getTestRunDiffsSummary).toHaveBeenCalledTimes(3);
  });

  it("does not retrigger when the run isn't already failed", async () => {
    mocks.getTestRunDiffsSummary.mockResolvedValue({
      status: "complete",
      data: [],
    });

    await runHandler();

    expect(mocks.getTestRunDiffsSummary).toHaveBeenCalledTimes(1);
    expect(mocks.getTestRunDiffsSummary).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ retrigger: true }),
    );
  });

  it("exits 1 immediately on an unrecognized status", async () => {
    mocks.getTestRunDiffsSummary.mockResolvedValue({
      status: "unexpected_bogus_status",
    });

    await expect(runHandler()).rejects.toThrow(ProcessExitError);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.logNotice).toHaveBeenCalledWith(
      expect.stringContaining('unexpected status "unexpected_bogus_status"'),
    );
  });

  it("exits 1 once the 10-minute deadline passes while still pending", async () => {
    mocks.getTestRunDiffsSummary.mockResolvedValue({ status: "pending" });
    const nowSpy = vi
      .spyOn(performance, "now")
      .mockReturnValueOnce(0) // t0
      .mockReturnValueOnce(0) // summaryDeadline base
      .mockReturnValueOnce(999_999_999); // deadline check inside the loop

    await expect(runHandler()).rejects.toThrow(ProcessExitError);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.logNotice).toHaveBeenCalledWith(
      expect.stringContaining("did not complete within 10 minutes"),
    );
    nowSpy.mockRestore();
  });

  it("prints TSV output once the computation completes", async () => {
    mocks.getTestRunDiffsSummary.mockResolvedValue({
      status: "complete",
      data: [],
    });

    await runHandler();

    expect(exitSpy).not.toHaveBeenCalled();
    const stdout = logSpy.mock.calls.flat().join("\n");
    expect(stdout.split("\n")[0]).toBe("replayDiffId\tscreenshotName");
  });

  it("requests and prints mismatchFraction only when opted in", async () => {
    mocks.getTestRunDiffsSummary.mockResolvedValue({
      status: "complete",
      data: [
        {
          replayDiffId: "rd-1",
          screenshotName: "end-state",
          mismatchFraction: 0.25,
        },
      ],
    });

    await runHandler({ includeMismatchFraction: true });

    expect(mocks.getTestRunDiffsSummary).toHaveBeenCalledWith(
      expect.anything(),
      "tr-1",
      expect.objectContaining({ includeMismatchFraction: true }),
    );
    expect(logSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      "replayDiffId\tscreenshotName\tmismatchFraction",
      "rd-1\tend-state\t0.25000",
    ]);
  });

  it("treats --onlyUnreviewed as implying --includeAllDiffs (isSelected column + backend flag)", async () => {
    mocks.getTestRunDiffsSummary.mockResolvedValue({
      status: "complete",
      data: [],
    });

    await runHandler({ onlyUnreviewed: true });

    expect(exitSpy).not.toHaveBeenCalled();
    // The request carries includeAllDiffs so the backend returns isSelected.
    expect(mocks.getTestRunDiffsSummary).toHaveBeenCalledWith(
      expect.anything(),
      "tr-1",
      expect.objectContaining({ includeAllDiffs: true, onlyUnreviewed: true }),
    );
    // ...and the TSV header includes the isSelected column.
    const stdout = logSpy.mock.calls.flat().join("\n");
    expect(stdout.split("\n")[0].split("\t")).toContain("isSelected");
  });

  it("treats --onlyRejected as implying --includeAllDiffs (isSelected column + backend flag)", async () => {
    mocks.getTestRunDiffsSummary.mockResolvedValue({
      status: "complete",
      data: [],
    });

    await runHandler({ onlyRejected: true });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(mocks.getTestRunDiffsSummary).toHaveBeenCalledWith(
      expect.anything(),
      "tr-1",
      expect.objectContaining({ includeAllDiffs: true, onlyRejected: true }),
    );
    const stdout = logSpy.mock.calls.flat().join("\n");
    expect(stdout.split("\n")[0].split("\t")).toContain("isSelected");
  });

  // Regression test: yargs' `conflicts` rejects on the option merely being
  // *present* in argv, which is true for every run since both flags default to
  // false — so `conflicts` would have rejected every invocation, defaulted or
  // not. The check lives in the handler instead (see the command's builder).
  it("rejects --onlyUnreviewed and --onlyRejected together before any network call", async () => {
    await expect(
      runHandler({ onlyUnreviewed: true, onlyRejected: true }),
    ).rejects.toThrow(CliUserError);

    expect(mocks.createClientWithOAuth).not.toHaveBeenCalled();
    expect(mocks.getTestRunDiffsSummary).not.toHaveBeenCalled();
  });

  it("allows neither --onlyUnreviewed nor --onlyRejected (both false, the default)", async () => {
    mocks.getTestRunDiffsSummary.mockResolvedValue({
      status: "complete",
      data: [],
    });

    await runHandler({ onlyUnreviewed: false, onlyRejected: false });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(mocks.getTestRunDiffsSummary).toHaveBeenCalled();
  });

  it.each(["includeReviews", "includeReviewDecisions"])(
    "maps --%s to review metadata in the request and output",
    async (flag) => {
      mocks.getTestRunDiffsSummary.mockResolvedValue({
        status: "complete",
        data: [],
      });

      await runHandler({ [flag]: true });

      expect(mocks.getTestRunDiffsSummary).toHaveBeenCalledWith(
        expect.anything(),
        "tr-1",
        expect.objectContaining({ includeReviews: true }),
      );
      expect(logSpy.mock.calls[0][0]).toContain("decision\topenComments");
    },
  );

  it("prints the counts from the dedicated endpoint (no summary poll) with --counts", async () => {
    mocks.getTestRunDiffsSummaryCounts.mockResolvedValue({
      numReplays: 5,
      numDiffs: 2,
      numApproved: 1,
      numIgnored: 0,
      numRejected: 0,
      numUnreviewed: 1,
    });

    await runHandler({ counts: true });

    expect(exitSpy).not.toHaveBeenCalled();
    // Counts come from the dedicated endpoint; the diffs-summary list isn't fetched.
    expect(mocks.getTestRunDiffsSummaryCounts).toHaveBeenCalledWith(
      expect.anything(),
      "tr-1",
    );
    expect(mocks.getTestRunDiffsSummary).not.toHaveBeenCalled();
    const stdout = logSpy.mock.calls.flat().join("\n");
    expect(stdout).toBe(
      [
        "numReplays:\t5",
        "numDiffs:\t2",
        "numApproved:\t1",
        "numIgnored:\t0",
        "numRejected:\t0",
        "numUnreviewed:\t1",
      ].join("\n"),
    );
  });

  it("prints the counts as JSON with --counts --json (still compatible)", async () => {
    mocks.getTestRunDiffsSummaryCounts.mockResolvedValue({
      numReplays: 5,
      numDiffs: 2,
      numApproved: 1,
      numIgnored: 0,
      numRejected: 0,
      numUnreviewed: 1,
    });

    await runHandler({ counts: true, json: true });

    expect(exitSpy).not.toHaveBeenCalled();
    const stdout = logSpy.mock.calls.flat().join("\n");
    expect(JSON.parse(stdout)).toEqual({
      numReplays: 5,
      numDiffs: 2,
      numApproved: 1,
      numIgnored: 0,
      numRejected: 0,
      numUnreviewed: 1,
    });
  });

  it("emits nothing for --counts on an in-progress run reported without waiting", async () => {
    // ensureTestRunFinished returns null (and logs the in-progress notice to
    // stderr) when the run is unfinished and --dontWaitForTestRunToComplete.
    mocks.ensureTestRunFinished.mockResolvedValue(null);

    await runHandler({ counts: true, dontWaitForTestRunToComplete: true });

    expect(exitSpy).not.toHaveBeenCalled();
    // No live counts to report — emit nothing rather than a misleading row of
    // zeros. The counts endpoint isn't hit either.
    expect(mocks.getTestRunDiffsSummaryCounts).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it.each([
    "includeReplayIds",
    "includeMismatchFraction",
    "includeDomDiffIds",
    "includeAllDiffs",
    "orderByReplayDiffs",
    "includeReviews",
    "includeReviewDecisions",
    "onlyUnreviewed",
    "onlyRejected",
  ])(
    "rejects --counts combined with --%s before any network call",
    async (flag) => {
      await expect(runHandler({ counts: true, [flag]: true })).rejects.toThrow(
        CliUserError,
      );

      // Rejected up front: neither the run nor either diffs endpoint is touched.
      expect(mocks.createClientWithOAuth).not.toHaveBeenCalled();
      expect(mocks.getTestRunDiffsSummaryCounts).not.toHaveBeenCalled();
      expect(mocks.getTestRunDiffsSummary).not.toHaveBeenCalled();
    },
  );

  // A base run exists to be compared against, so it has no diffs of its own —
  // rejected here rather than in the shared resolver, whose other caller
  // (coverage) accepts base runs.
  it("rejects a base run with a 'no changes/diffs' error", async () => {
    mocks.ensureTestRunFinished.mockResolvedValue("Partial");
    mocks.isTestRunPartial.mockReturnValue(true);

    await expect(runHandler()).rejects.toThrow(
      /is a base run other test runs compare against and consequently has no changes\/diffs/,
    );

    // Rejected before any diffs are fetched, and without consulting the
    // verdict-only assertion.
    expect(mocks.getTestRunDiffsSummary).not.toHaveBeenCalled();
    expect(mocks.assertTestRunComplete).not.toHaveBeenCalled();
  });
});
