import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testRunCheckCommand } from "./test-run-check.command";

vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getTestRun: vi.fn(),
  getTestRunCheckReport: vi.fn(),
  getTestRunCheckAvailableIds: vi.fn(),
  ensureTestRunFinished: vi.fn(),
  assertTestRunComplete: vi.fn(),
  isSessionPool: vi.fn(),
  isTestRunPartial: vi.fn(),
  resolveTestRunForCommitOrThrow: vi.fn(),
  logNotice: vi.fn(),
  logProgress: vi.fn(),
  printJson: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  createClientWithOAuth: mocks.createClientWithOAuth,
  getTestRun: mocks.getTestRun,
  getTestRunCheckReport: mocks.getTestRunCheckReport,
  getTestRunCheckAvailableIds: mocks.getTestRunCheckAvailableIds,
}));

vi.mock("@alwaysmeticulous/common", () => ({
  logNotice: mocks.logNotice,
  logProgress: mocks.logProgress,
}));

vi.mock("../../command-utils/print-json", () => ({
  printJson: mocks.printJson,
}));

vi.mock("../../utils/resolve-test-run-from-commit", () => ({
  ensureTestRunFinished: mocks.ensureTestRunFinished,
  assertTestRunComplete: mocks.assertTestRunComplete,
  isSessionPool: mocks.isSessionPool,
  isTestRunPartial: mocks.isTestRunPartial,
  resolveTestRunForCommitOrThrow: mocks.resolveTestRunForCommitOrThrow,
}));

class ProcessExitError extends Error {}

const runHandler = (overrides: Record<string, unknown> = {}) =>
  (
    testRunCheckCommand as {
      handler: (args: unknown) => Promise<void>;
    }
  ).handler({
    apiToken: undefined,
    testRunId: "tr-1",
    commitSha: undefined,
    checkType: undefined,
    checkId: "accessibility",
    availableIds: false,
    dontWaitForTestRunToComplete: false,
    json: false,
    project: undefined,
    ...overrides,
  });

let logSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

describe("test-run-check command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getTestRun.mockResolvedValue({ status: "Success" });
    mocks.ensureTestRunFinished.mockResolvedValue("Success");
    mocks.isTestRunPartial.mockReturnValue(false);
    mocks.isSessionPool.mockReturnValue(false);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new ProcessExitError();
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    exitSpy.mockRestore();
    vi.useRealTimers();
  });

  it("prints the completed report text", async () => {
    mocks.getTestRunCheckReport.mockResolvedValue({
      status: "complete",
      text: "# Accessibility",
    });

    await runHandler();

    expect(logSpy).toHaveBeenCalledWith("# Accessibility");
    expect(mocks.getTestRunCheckReport).toHaveBeenCalledWith(
      expect.anything(),
      "tr-1",
      "accessibility",
      { checkType: "builtin" },
    );
  });

  it("prints the download url on its own line for a report too large to inline", async () => {
    mocks.getTestRunCheckReport.mockResolvedValue({
      status: "complete",
      text: "Report is 512KB — too large to return inline. Download the full report from the accompanying url.",
      url: "https://example.com/signed-url",
    });

    await runHandler();

    expect(logSpy).toHaveBeenNthCalledWith(
      1,
      "Report is 512KB — too large to return inline. Download the full report from the accompanying url.",
    );
    expect(logSpy).toHaveBeenNthCalledWith(2, "https://example.com/signed-url");
  });

  it("does not print a second line when the report has no url", async () => {
    mocks.getTestRunCheckReport.mockResolvedValue({
      status: "complete",
      text: "# Accessibility",
    });

    await runHandler();

    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("polls processing results and prints the completed report as JSON", async () => {
    mocks.getTestRunCheckReport
      .mockResolvedValueOnce({ status: "processing" })
      .mockResolvedValueOnce({ status: "complete", text: "# Report" });
    vi.useFakeTimers();

    const result = runHandler({ json: true });
    await vi.advanceTimersByTimeAsync(2000);
    await result;

    expect(mocks.getTestRunCheckReport).toHaveBeenCalledTimes(2);
    expect(mocks.printJson).toHaveBeenCalledWith({
      status: "complete",
      text: "# Report",
    });
  });

  it("emits processing JSON and returns immediately when the run is unfinished and waiting is disabled", async () => {
    mocks.ensureTestRunFinished.mockResolvedValue(null);

    await runHandler({ json: true, dontWaitForTestRunToComplete: true });

    expect(mocks.printJson).toHaveBeenCalledWith({ status: "processing" });
    expect(mocks.getTestRunCheckReport).not.toHaveBeenCalled();
  });

  it("prints nothing when the run is unfinished, waiting is disabled, and --json is not set", async () => {
    mocks.ensureTestRunFinished.mockResolvedValue(null);

    await runHandler({ json: false, dontWaitForTestRunToComplete: true });

    expect(mocks.printJson).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(mocks.getTestRunCheckReport).not.toHaveBeenCalled();
  });

  it("reports an execution failure instead of continuing to poll", async () => {
    mocks.getTestRunCheckReport.mockResolvedValue({
      status: "failed",
      reason: "execution-error",
    });

    await expect(runHandler()).rejects.toThrow(ProcessExitError);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.logNotice).toHaveBeenCalledWith(
      expect.stringContaining("execution-error"),
    );
  });

  // A session-pool base can settle into Success/Failure without ever
  // becoming Partial, so isSessionPool is checked independently of
  // status (mirrors the backend's isBaseOrSessionPoolRun).
  it("rejects a settled session-pool run resolved via --testRunId", async () => {
    mocks.isSessionPool.mockReturnValue(true);

    await expect(runHandler()).rejects.toThrow(
      /is a base run other test runs compare against and consequently has no check reports/,
    );
    expect(mocks.getTestRunCheckReport).not.toHaveBeenCalled();
  });

  // Session-pool state is already known before the run needs to finish, so a
  // still-running session pool must be rejected immediately rather than
  // waiting on (or, with --dontWaitForTestRunToComplete, silently returning
  // processing JSON past) a run that will never have check reports.
  it("rejects a settled session-pool run without waiting for it to finish", async () => {
    mocks.isSessionPool.mockReturnValue(true);

    await expect(runHandler()).rejects.toThrow(
      /is a base run other test runs compare against and consequently has no check reports/,
    );
    expect(mocks.ensureTestRunFinished).not.toHaveBeenCalled();
  });

  it("resolves a test run from a commit when no testRunId is passed", async () => {
    mocks.resolveTestRunForCommitOrThrow.mockResolvedValue({
      testRunId: "tr-from-commit",
      status: "Success",
    });
    mocks.getTestRunCheckReport.mockResolvedValue({
      status: "complete",
      text: "report",
    });

    await runHandler({ testRunId: undefined, commitSha: "abc123" });

    expect(mocks.resolveTestRunForCommitOrThrow).toHaveBeenCalledWith(
      expect.anything(),
      "abc123",
      undefined,
    );
    expect(mocks.getTestRunCheckReport).toHaveBeenCalledWith(
      expect.anything(),
      "tr-from-commit",
      "accessibility",
      { checkType: "builtin" },
    );
  });

  it("rejects a missing --checkId when --availableIds is not set, without logging in first", async () => {
    await expect(runHandler({ checkId: undefined })).rejects.toThrow(
      /--checkId is required unless --availableIds is set/,
    );
    expect(mocks.getTestRunCheckReport).not.toHaveBeenCalled();
    expect(mocks.createClientWithOAuth).not.toHaveBeenCalled();
  });
});

describe("test-run-check --availableIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getTestRun.mockResolvedValue({ status: "Success" });
    mocks.isTestRunPartial.mockReturnValue(false);
    mocks.isSessionPool.mockReturnValue(false);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("prints a TSV table of the available check IDs", async () => {
    mocks.getTestRunCheckAvailableIds.mockResolvedValue([
      { checkType: "builtin", checkId: "accessibility" },
      { checkType: "custom", checkId: "my-check" },
    ]);

    await runHandler({ availableIds: true, checkId: undefined });

    expect(logSpy).toHaveBeenCalledWith("checkType\tcheckId");
    expect(logSpy).toHaveBeenCalledWith("builtin\taccessibility");
    expect(logSpy).toHaveBeenCalledWith("custom\tmy-check");
    expect(mocks.getTestRunCheckAvailableIds).toHaveBeenCalledWith(
      expect.anything(),
      "tr-1",
    );
    // Resolving session-pool state for an explicit --testRunId needs its
    // configData, but --availableIds still never waits for the run to finish.
    expect(mocks.getTestRun).toHaveBeenCalledWith({
      client: expect.anything(),
      testRunId: "tr-1",
    });
    expect(mocks.ensureTestRunFinished).not.toHaveBeenCalled();
  });

  it("prints the result as JSON when --json is set", async () => {
    mocks.getTestRunCheckAvailableIds.mockResolvedValue([
      { checkType: "builtin", checkId: "accessibility" },
    ]);

    await runHandler({ availableIds: true, checkId: undefined, json: true });

    expect(mocks.printJson).toHaveBeenCalledWith([
      { checkType: "builtin", checkId: "accessibility" },
    ]);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("still prints the TSV header when no checks have reported results yet", async () => {
    mocks.getTestRunCheckAvailableIds.mockResolvedValue([]);

    await runHandler({ availableIds: true, checkId: undefined });

    expect(logSpy).toHaveBeenCalledWith("checkType\tcheckId");
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(mocks.logNotice).toHaveBeenCalledWith(
      expect.stringContaining("tr-1"),
    );
  });

  it("omits the TSV header when no checks have reported results yet and --json is set", async () => {
    mocks.getTestRunCheckAvailableIds.mockResolvedValue([]);

    await runHandler({ availableIds: true, checkId: undefined, json: true });

    expect(logSpy).not.toHaveBeenCalled();
    expect(mocks.printJson).toHaveBeenCalledWith([]);
  });

  it("resolves a test run from a commit when no testRunId is passed", async () => {
    mocks.resolveTestRunForCommitOrThrow.mockResolvedValue({
      testRunId: "tr-from-commit",
      status: "Success",
    });
    mocks.getTestRunCheckAvailableIds.mockResolvedValue([]);

    await runHandler({
      availableIds: true,
      checkId: undefined,
      testRunId: undefined,
      commitSha: "abc123",
    });

    expect(mocks.resolveTestRunForCommitOrThrow).toHaveBeenCalledWith(
      expect.anything(),
      "abc123",
      undefined,
    );
    expect(mocks.getTestRunCheckAvailableIds).toHaveBeenCalledWith(
      expect.anything(),
      "tr-from-commit",
    );
  });

  // The backend already rejects a base run via assertNotBaseRun in
  // getTestRunCheckAvailableIds, but checking client-side first saves that
  // round trip and keeps --availableIds consistent with --checkId.
  it("rejects a settled session-pool run without calling getTestRunCheckAvailableIds", async () => {
    mocks.isSessionPool.mockReturnValue(true);

    await expect(
      runHandler({ availableIds: true, checkId: undefined }),
    ).rejects.toThrow(
      /is a base run other test runs compare against and consequently has no check reports/,
    );
    expect(mocks.getTestRunCheckAvailableIds).not.toHaveBeenCalled();
  });

  it("rejects a Partial base run without calling getTestRunCheckAvailableIds", async () => {
    mocks.getTestRun.mockResolvedValue({ status: "Partial" });
    mocks.isTestRunPartial.mockReturnValue(true);

    await expect(
      runHandler({ availableIds: true, checkId: undefined }),
    ).rejects.toThrow(
      /is a base run other test runs compare against and consequently has no check reports/,
    );
    expect(mocks.getTestRunCheckAvailableIds).not.toHaveBeenCalled();
  });

  it("rejects combining --availableIds with --checkId", async () => {
    await expect(
      runHandler({ availableIds: true, checkId: "accessibility" }),
    ).rejects.toThrow(/--availableIds cannot be combined with: --checkId/);
    expect(mocks.getTestRunCheckAvailableIds).not.toHaveBeenCalled();
  });

  it("rejects combining --availableIds with an explicit non-default --checkType", async () => {
    await expect(
      runHandler({
        availableIds: true,
        checkId: undefined,
        checkType: "custom",
      }),
    ).rejects.toThrow(/--availableIds cannot be combined with: --checkType/);
    expect(mocks.getTestRunCheckAvailableIds).not.toHaveBeenCalled();
  });

  it("rejects combining --availableIds with an explicit --checkType matching the default", async () => {
    // --checkType=builtin is redundant with the default, but still an
    // explicit selector the user typed — the incompatibility is about the
    // flag being passed at all, not about its resolved value.
    await expect(
      runHandler({
        availableIds: true,
        checkId: undefined,
        checkType: "builtin",
      }),
    ).rejects.toThrow(/--availableIds cannot be combined with: --checkType/);
    expect(mocks.getTestRunCheckAvailableIds).not.toHaveBeenCalled();
  });

  it("allows --availableIds when --checkType is left at its implicit default", async () => {
    mocks.getTestRunCheckAvailableIds.mockResolvedValue([]);

    await runHandler({
      availableIds: true,
      checkId: undefined,
      checkType: undefined,
    });

    expect(mocks.getTestRunCheckAvailableIds).toHaveBeenCalled();
  });

  it("rejects combining --availableIds with --dontWaitForTestRunToComplete", async () => {
    await expect(
      runHandler({
        availableIds: true,
        checkId: undefined,
        dontWaitForTestRunToComplete: true,
      }),
    ).rejects.toThrow(
      /--availableIds cannot be combined with: --dontWaitForTestRunToComplete/,
    );
    expect(mocks.getTestRunCheckAvailableIds).not.toHaveBeenCalled();
  });
});
