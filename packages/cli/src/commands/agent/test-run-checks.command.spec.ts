import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testRunChecksCommand } from "./test-run-checks.command";

vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getTestRun: vi.fn(),
  getTestRunCheckReport: vi.fn(),
  ensureTestRunFinished: vi.fn(),
  assertTestRunComplete: vi.fn(),
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
  isTestRunPartial: mocks.isTestRunPartial,
  resolveTestRunForCommitOrThrow: mocks.resolveTestRunForCommitOrThrow,
}));

class ProcessExitError extends Error {}

const runHandler = (overrides: Record<string, unknown> = {}) =>
  (
    testRunChecksCommand as {
      handler: (args: unknown) => Promise<void>;
    }
  ).handler({
    apiToken: undefined,
    testRunId: "tr-1",
    commitSha: undefined,
    checkType: "builtin",
    checkId: "accessibility",
    dontWaitForTestRunToComplete: false,
    json: false,
    project: undefined,
    ...overrides,
  });

let logSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

describe("test-run-checks command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getTestRun.mockResolvedValue({ status: "Success" });
    mocks.ensureTestRunFinished.mockResolvedValue("Success");
    mocks.isTestRunPartial.mockReturnValue(false);
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
});
