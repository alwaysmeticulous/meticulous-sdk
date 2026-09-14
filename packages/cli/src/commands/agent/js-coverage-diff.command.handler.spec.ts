import type * as MeticulousClientModule from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsCoverageDiffCommand } from "./js-coverage-diff.command";

// Passthrough, so handler errors propagate to the test rather than exiting.
vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getTestRun: vi.fn(),
  getTestRunJsCoverageDiff: vi.fn(),
  getReplayDiffJsCoverage: vi.fn(),
  logNotice: vi.fn(),
  initLogger: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", async (importOriginal) => ({
  ...(await importOriginal<typeof MeticulousClientModule>()),
  createClientWithOAuth: mocks.createClientWithOAuth,
  getTestRun: mocks.getTestRun,
  getTestRunJsCoverageDiff: mocks.getTestRunJsCoverageDiff,
  getReplayDiffJsCoverage: mocks.getReplayDiffJsCoverage,
}));

vi.mock("@alwaysmeticulous/common", () => ({
  logNotice: mocks.logNotice,
  logProgress: vi.fn(),
  initLogger: mocks.initLogger,
  getCommitSha: vi.fn(),
  getUntrackedFiles: vi.fn().mockResolvedValue([]),
  hasUncommittedChanges: vi.fn().mockResolvedValue(false),
}));

const runHandler = (overrides: Record<string, unknown> = {}) =>
  (
    jsCoverageDiffCommand as {
      handler: (args: unknown) => Promise<void>;
    }
  ).handler({
    apiToken: undefined,
    replayDiffId: undefined,
    screenshotName: undefined,
    testRunId: "tr-head",
    commitSha: undefined,
    project: undefined,
    globFilter: undefined,
    summary: false,
    limit: undefined,
    offset: undefined,
    dontWaitForTestRunToComplete: false,
    json: false,
    ...overrides,
  });

const DELTA = {
  files: 3,
  filesAdded: 1,
  filesRemoved: 0,
  filesModified: 2,
  baseExecutedLines: 10,
  headExecutedLines: 14,
  uniqueLinesAdded: 5,
  regressedLines: 1,
};

describe("js-coverage-diff --summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getTestRun.mockResolvedValue({ status: "Success" });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  // The per-file rows are discarded on this path, and on a large repo they are
  // almost the whole response — so they must not be requested at all.
  it("asks the backend for the aggregate only", async () => {
    mocks.getTestRunJsCoverageDiff.mockResolvedValue({
      testRunId: "tr-head",
      baseTestRunId: "tr-base",
      executionSha: "abc123",
      baseExecutionSha: "def456",
      delta: DELTA,
    });

    await runHandler({ summary: true });

    expect(mocks.getTestRunJsCoverageDiff).toHaveBeenCalledWith(
      {},
      "tr-head",
      expect.objectContaining({ summaryOnly: true }),
    );
  });

  it("prints the flattened aggregate as JSON", async () => {
    mocks.getTestRunJsCoverageDiff.mockResolvedValue({
      testRunId: "tr-head",
      baseTestRunId: "tr-base",
      executionSha: "abc123",
      baseExecutionSha: "def456",
      delta: DELTA,
    });

    await runHandler({ summary: true, json: true });

    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      JSON.stringify(
        {
          testRunId: "tr-head",
          baseTestRunId: "tr-base",
          executionSha: "abc123",
          baseExecutionSha: "def456",
          ...DELTA,
        },
        null,
        2,
      ),
    );
  });

  it("requests the per-file rows when not summarising", async () => {
    mocks.getTestRunJsCoverageDiff.mockResolvedValue({
      testRunId: "tr-head",
      baseTestRunId: "tr-base",
      executionSha: "abc123",
      baseExecutionSha: "def456",
      diff: [
        {
          filePath: "src/a.ts",
          status: "modified",
          baseRanges: [[1, 2]],
          headRanges: [[1, 3]],
        },
      ],
      delta: DELTA,
    });

    await runHandler({ json: true });

    const [, , options] = mocks.getTestRunJsCoverageDiff.mock.calls[0];
    expect(options).not.toHaveProperty("summaryOnly");
    // `filePath` is remapped to `repoFilePath`, matching every other diff getter.
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      JSON.stringify(
        [
          {
            repoFilePath: "src/a.ts",
            status: "modified",
            baseRanges: [[1, 2]],
            headRanges: [[1, 3]],
          },
        ],
        null,
        2,
      ),
    );
  });
});

describe("js-coverage-diff paging", () => {
  const row = (path: string) => ({
    filePath: path,
    status: "modified" as const,
    baseRanges: [[1, 2]] as [number, number][],
    headRanges: [[1, 3]] as [number, number][],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getTestRun.mockResolvedValue({ status: "Success" });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("passes limit and offset to the backend", async () => {
    mocks.getTestRunJsCoverageDiff.mockResolvedValue({
      testRunId: "tr-head",
      baseTestRunId: "tr-base",
      executionSha: "abc123",
      baseExecutionSha: "def456",
      diff: [row("src/a.ts")],
      totalFiles: 4000,
      delta: DELTA,
    });

    await runHandler({ limit: 1, offset: 100 });

    expect(mocks.getTestRunJsCoverageDiff).toHaveBeenCalledWith(
      {},
      "tr-head",
      expect.objectContaining({ limit: 1, offset: 100 }),
    );
  });

  // The wording is the backend's (`agent.pagination.utils.ts`, tested there);
  // this command's job is to relay it, whatever it says.
  it("relays the backend's paging notice to stderr", async () => {
    mocks.getTestRunJsCoverageDiff.mockResolvedValue({
      testRunId: "tr-head",
      baseTestRunId: "tr-base",
      executionSha: "abc123",
      baseExecutionSha: "def456",
      diff: [row("src/a.ts"), row("src/b.ts")],
      totalFiles: 4000,
      delta: DELTA,
      notes: [
        "files 101-102 of 4000; use --offset and/or --limit to view more",
      ],
    });

    await runHandler({ limit: 2, offset: 100 });

    expect(mocks.logNotice).toHaveBeenCalledWith(
      "files 101-102 of 4000; use --offset and/or --limit to view more",
    );
  });

  it("says nothing about paging when the response carries no note", async () => {
    mocks.getTestRunJsCoverageDiff.mockResolvedValue({
      testRunId: "tr-head",
      baseTestRunId: "tr-base",
      executionSha: "abc123",
      baseExecutionSha: "def456",
      diff: [row("src/a.ts")],
      totalFiles: 1,
      delta: DELTA,
    });

    await runHandler();

    expect(mocks.logNotice).not.toHaveBeenCalledWith(
      expect.stringContaining("--offset"),
    );
  });
});

// With --dontWaitForTestRunToComplete, an unfinished run yields no runs to
// report on. The two output shapes need different empty forms, and `--summary`
// has to match `js-coverage --summary` rather than the per-file path: a zeroed
// or empty delta reads as "this commit changed no coverage" instead of "not
// ready yet".
describe("js-coverage-diff on an unfinished run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getTestRun.mockResolvedValue({ status: "Running" });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  const runUnfinished = (overrides: Record<string, unknown> = {}) =>
    runHandler({ dontWaitForTestRunToComplete: true, ...overrides });

  it("prints JSON null for --summary --json, not an empty list", async () => {
    await runUnfinished({ summary: true, json: true });

    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith("null");
    expect(mocks.getTestRunJsCoverageDiff).not.toHaveBeenCalled();
  });

  it("prints nothing at all for --summary in human mode", async () => {
    await runUnfinished({ summary: true });

    expect(console.log).not.toHaveBeenCalled();
  });

  it("still prints an empty list for the per-file path", async () => {
    await runUnfinished({ json: true });

    expect(console.log).toHaveBeenCalledWith("[]");
  });

  it("still prints the header row for the per-file path in human mode", async () => {
    await runUnfinished();

    expect(console.log).toHaveBeenCalledWith(
      "repoFilePath\tstatus\tbaseRanges\theadRanges",
    );
  });
});

// The two structural refusals a bare invocation is most likely to hit: HEAD
// resolves to a base run, or the run had no base to compare against. Both are
// user errors carrying a `reason`, and must not reach the generic error path —
// which pairs them with the unhelpful `--help` tip and reports them to Sentry.
describe("js-coverage-diff backend refusals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getTestRun.mockResolvedValue({ status: "Success" });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  const refusal = (reason: string, message: string) =>
    Object.assign(new Error(message), {
      response: {
        status: 400,
        data: { statusCode: 400, error: "Bad Request", message, reason },
      },
    });

  it.each([
    [
      "base-run-not-applicable",
      "Test run tr-head is a base run other test runs compare against, so it has no base of its own to compare coverage against.",
    ],
    [
      "no-base-test-run",
      "Test run tr-head was not compared against a base run, so there is no coverage to diff it against.",
    ],
    [
      "incomplete-base-run-as-diff-base",
      "Test run tr-head compares against base run tr-base, which replays its selected sessions on demand.",
    ],
  ])("relays a %s refusal as a clean user error", async (reason, message) => {
    mocks.getTestRunJsCoverageDiff.mockRejectedValue(refusal(reason, message));

    await expect(runHandler()).rejects.toMatchObject({
      name: "CliUserError",
      message,
    });
  });

  // Keyed on the reason, not the status: a genuine 400 with no reason is a
  // fault and must keep reaching Sentry.
  it("lets an unreasoned 400 through to the generic error path", async () => {
    const unreasoned = Object.assign(new Error("something broke"), {
      response: {
        status: 400,
        data: { statusCode: 400, error: "Bad Request", message: "broke" },
      },
    });
    mocks.getTestRunJsCoverageDiff.mockRejectedValue(unreasoned);

    await expect(runHandler()).rejects.toBe(unreasoned);
  });
});

describe("js-coverage-diff --replayDiffId paging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getTestRun.mockResolvedValue({ status: "Success" });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  const runReplayDiff = (overrides: Record<string, unknown> = {}) =>
    runHandler({
      testRunId: undefined,
      baseTestRunId: undefined,
      replayDiffId: "rd-1",
      ...overrides,
    });

  it("passes limit and offset to the backend", async () => {
    mocks.getReplayDiffJsCoverage.mockResolvedValue({
      base: null,
      head: null,
      diff: [],
      totalFiles: 0,
      filesAdded: 0,
      filesRemoved: 0,
      filesModified: 0,
    });

    await runReplayDiff({ limit: 10, offset: 20 });

    expect(mocks.getReplayDiffJsCoverage).toHaveBeenCalledWith(
      {},
      "rd-1",
      undefined,
      expect.objectContaining({ limit: 10, offset: 20 }),
    );
  });

  // The summary must describe the whole diff even when the rows are one page,
  // so it uses the backend's counts rather than counting the returned rows.
  it("summarises the whole diff, not the returned page", async () => {
    mocks.getReplayDiffJsCoverage.mockResolvedValue({
      base: null,
      head: null,
      diff: [
        {
          filePath: "src/a.ts",
          status: "modified",
          baseRanges: [[1, 2]],
          headRanges: [[1, 3]],
        },
      ],
      totalFiles: 300,
      filesAdded: 100,
      filesRemoved: 50,
      filesModified: 150,
    });

    await runReplayDiff({ limit: 1 });

    expect(mocks.logNotice).toHaveBeenCalledWith(
      "300 files with coverage changes (100 added, 50 removed, 150 modified)",
    );
  });

  // An older backend neither pages nor sends the counts, so the rows are the
  // whole diff and counting them is correct.
  it("falls back to counting rows when the backend sends no totals", async () => {
    mocks.getReplayDiffJsCoverage.mockResolvedValue({
      base: null,
      head: null,
      diff: [
        {
          filePath: "src/a.ts",
          status: "added",
          baseRanges: [],
          headRanges: [[1, 3]],
        },
        {
          filePath: "src/b.ts",
          status: "modified",
          baseRanges: [[1, 2]],
          headRanges: [[1, 5]],
        },
      ],
    });

    await runReplayDiff();

    expect(mocks.logNotice).toHaveBeenCalledWith(
      "2 files with coverage changes (1 added, 0 removed, 1 modified)",
    );
    expect(mocks.logNotice).not.toHaveBeenCalledWith(
      expect.stringContaining("--offset"),
    );
  });
});
