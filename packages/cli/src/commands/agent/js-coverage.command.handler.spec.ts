import type * as MeticulousClientModule from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../../utils/cli-user-error";
import { jsCoverageCommand } from "./js-coverage.command";

// Make wrapHandler a passthrough so handler errors propagate directly to tests
// rather than being swallowed by process.exit().
vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getTestRun: vi.fn(),
  getTestRunForCommit: vi.fn(),
  getTestRunJsCoverage: vi.fn(),
  getProjectJsCoverage: vi.fn(),
  getReplayJsCoverage: vi.fn(),
  isFetchError: vi.fn(),
  logNotice: vi.fn(),
  logProgress: vi.fn(),
  initLogger: vi.fn(),
  getCommitSha: vi.fn(),
}));

// Partial: the column-selection helpers are real logic this command depends on,
// only the network calls are stubbed.
vi.mock("@alwaysmeticulous/client", async (importOriginal) => ({
  ...(await importOriginal<typeof MeticulousClientModule>()),
  createClientWithOAuth: mocks.createClientWithOAuth,
  getTestRun: mocks.getTestRun,
  getTestRunForCommit: mocks.getTestRunForCommit,
  getTestRunJsCoverage: mocks.getTestRunJsCoverage,
  getProjectJsCoverage: mocks.getProjectJsCoverage,
  getReplayJsCoverage: mocks.getReplayJsCoverage,
  isFetchError: mocks.isFetchError,
}));

vi.mock("@alwaysmeticulous/common", () => ({
  logNotice: mocks.logNotice,
  logProgress: mocks.logProgress,
  initLogger: mocks.initLogger,
  getCommitSha: mocks.getCommitSha,
  getUntrackedFiles: vi.fn().mockResolvedValue([]),
  hasUncommittedChanges: vi.fn().mockResolvedValue(false),
}));

const runHandler = (overrides: Record<string, unknown> = {}) =>
  (
    jsCoverageCommand as {
      handler: (args: unknown) => Promise<void>;
    }
  ).handler({
    apiToken: undefined,
    testRunId: "tr-1",
    commitSha: undefined,
    latestForProject: false,
    project: undefined,
    replayId: undefined,
    screenshotName: undefined,
    headPlusTestRunIds: undefined,
    testRunIds: undefined,
    includeAllFiles: false,
    globFilter: undefined,
    prDiffOnly: false,
    includeExecutedRanges: false,
    includeExecutableRanges: false,
    includeUncoveredRanges: false,
    includeCoveragePercentage: false,
    dontWaitForTestRunToComplete: false,
    json: false,
    ...overrides,
  });

/** A backend 404 as the client surfaces it (an axios-shaped fetch error). */
const notFoundError = (message: string, reason?: string): unknown => ({
  response: { status: 404, data: { message, ...(reason ? { reason } : {}) } },
});

/** The backend's expected-empty-base-run 404 (see BASE_RUN_NO_COVERAGE_REASON). */
const baseRunEmptyError = (testRunId: string): unknown =>
  notFoundError(
    `Test run ${testRunId} is a base run whose sessions have not been replayed yet, so it has no coverage recorded.`,
    "base-run-no-coverage",
  );

describe("js-coverage handler on a base run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getTestRun.mockResolvedValue({ status: "Partial" });
    mocks.getTestRunJsCoverage.mockResolvedValue({ files: [] });
    mocks.isFetchError.mockImplementation(
      (error: unknown) =>
        typeof error === "object" && error != null && "response" in error,
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  // The whole point of the change: a Partial run is no longer refused before
  // the fetch, so coverage is actually requested for it.
  it("proceeds to fetch coverage rather than rejecting", async () => {
    await runHandler();
    expect(mocks.getTestRunJsCoverage).toHaveBeenCalledWith(
      {},
      "tr-1",
      expect.objectContaining({ includeExecutedRanges: true }),
    );
  });

  it("caveats the returned coverage as a moving total", async () => {
    await runHandler();
    expect(mocks.logNotice).toHaveBeenCalledWith(
      expect.stringMatching(/tr-1 is a base run:.*grows over time/),
    );
  });

  // Regression guard: this used to reach the generic error path, which pairs a
  // routine "this base run hasn't replayed anything yet" with the unhelpful
  // `--help` tip and reports it to Sentry.
  it("turns the expected-empty-base-run 404 into a CliUserError", async () => {
    mocks.getTestRunJsCoverage.mockRejectedValue(baseRunEmptyError("tr-1"));
    await expect(runHandler()).rejects.toBeInstanceOf(CliUserError);
    await expect(runHandler()).rejects.toThrow(
      /is a base run whose sessions have not/,
    );
  });

  // The caveat belongs with results that exist; a run with nothing recorded
  // shouldn't be told its coverage "grows over time" and then handed an error.
  it("emits no base-run notice when there is no coverage to caveat", async () => {
    mocks.getTestRunJsCoverage.mockRejectedValue(baseRunEmptyError("tr-1"));
    await expect(runHandler()).rejects.toThrow();
    expect(mocks.logNotice).not.toHaveBeenCalledWith(
      expect.stringMatching(/grows over time/),
    );
  });

  // A union can mix a base run with completed ones. Keying off "a base run was
  // involved" would blame the base run for a completed sibling's genuinely
  // missing artifact, and quietly keep that real fault out of Sentry.
  it("leaves a completed sibling's missing artifact as an unexpected error", async () => {
    const error = notFoundError("JS coverage artifact not found");
    mocks.getTestRunJsCoverage.mockRejectedValue(error);
    await expect(runHandler()).rejects.toBe(error);
  });

  // Only the expected-absence case is reinterpreted; anything else is still a
  // genuine failure and must keep reaching the generic (Sentry) path.
  it("leaves a non-404 failure alone", async () => {
    const serverError = { response: { status: 500, data: {} } };
    mocks.getTestRunJsCoverage.mockRejectedValue(serverError);
    await expect(runHandler()).rejects.toBe(serverError);
  });

  it("rejects --prDiffOnly before fetching", async () => {
    await expect(runHandler({ prDiffOnly: true })).rejects.toThrow(
      /has no PR diff to scope coverage to/,
    );
    expect(mocks.getTestRunJsCoverage).not.toHaveBeenCalled();
  });
});

// A session-pool base can settle into Success/Failure without ever becoming
// Partial, so it must get the same "grows over time" treatment as a Partial
// base run — keyed off isSessionPoolRun rather than status alone.
describe("js-coverage handler on a settled session-pool run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getTestRun.mockResolvedValue({
      status: "Success",
      configData: { arguments: { isSessionPool: true } },
    });
    mocks.getTestRunJsCoverage.mockResolvedValue({ files: [] });
    mocks.isFetchError.mockImplementation(
      (error: unknown) =>
        typeof error === "object" && error != null && "response" in error,
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("caveats the returned coverage as a moving total despite its Success status", async () => {
    await runHandler();
    expect(mocks.logNotice).toHaveBeenCalledWith(
      expect.stringMatching(/tr-1 is a base run:.*grows over time/),
    );
  });

  it("rejects --prDiffOnly before fetching", async () => {
    await expect(runHandler({ prDiffOnly: true })).rejects.toThrow(
      /has no PR diff to scope coverage to/,
    );
    expect(mocks.getTestRunJsCoverage).not.toHaveBeenCalled();
  });
});

// Unlike isNonEagerSessionPool (used elsewhere, e.g. the check-report write
// path), prDiffOnly and the base-run notice draw no eager/non-eager
// distinction: a session-pool run has no PR-diff of its own to scope
// coverage to here regardless of whether it also triggered eager session
// selection. Plain coverage is unaffected either way.
describe("js-coverage handler on an eagerly-executing session-pool run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getTestRun.mockResolvedValue({
      status: "Success",
      configData: {
        arguments: { isSessionPool: true, forceEagerExecution: true },
      },
    });
    mocks.getTestRunJsCoverage.mockResolvedValue({ files: [] });
    mocks.isFetchError.mockImplementation(
      (error: unknown) =>
        typeof error === "object" && error != null && "response" in error,
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("still caveats the returned coverage as a moving total", async () => {
    await runHandler();
    expect(mocks.logNotice).toHaveBeenCalledWith(
      expect.stringMatching(/tr-1 is a base run:.*grows over time/),
    );
  });

  it("rejects --prDiffOnly before fetching", async () => {
    await expect(runHandler({ prDiffOnly: true })).rejects.toThrow(
      /has no PR diff to scope coverage to/,
    );
    expect(mocks.getTestRunJsCoverage).not.toHaveBeenCalled();
  });

  it("still fetches plain coverage", async () => {
    await runHandler();
    expect(mocks.getTestRunJsCoverage).toHaveBeenCalled();
  });
});

describe("js-coverage handler on a completed run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getTestRun.mockResolvedValue({ status: "Success" });
    mocks.getTestRunJsCoverage.mockResolvedValue({ files: [] });
    mocks.isFetchError.mockImplementation(
      (error: unknown) =>
        typeof error === "object" && error != null && "response" in error,
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  // The base-run reinterpretation must not swallow a real 404 (e.g. a run whose
  // post-process genuinely failed to upload its artifact).
  it("leaves a missing coverage artifact as a plain fetch error", async () => {
    const error = notFoundError("JS coverage artifact not found");
    mocks.getTestRunJsCoverage.mockRejectedValue(error);
    await expect(runHandler()).rejects.toBe(error);
  });

  it("allows --prDiffOnly", async () => {
    await runHandler({ prDiffOnly: true });
    expect(mocks.getTestRunJsCoverage).toHaveBeenCalledWith(
      {},
      "tr-1",
      expect.objectContaining({ prDiffOnly: true }),
    );
  });
});

// Which run a commit resolves to is the backend's decision (it skips runs over
// a pinned session set); these cover what the handler does with the result.
describe("js-coverage handler resolving a run from a commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getCommitSha.mockResolvedValue("sha-1");
    mocks.getTestRun.mockResolvedValue({ status: "Success" });
    mocks.getTestRunForCommit.mockResolvedValue({
      testRunId: "tr-head",
      status: "Success",
    });
    mocks.getTestRunJsCoverage.mockResolvedValue({ files: [] });
    mocks.isFetchError.mockImplementation(
      (error: unknown) =>
        typeof error === "object" && error != null && "response" in error,
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("fetches coverage for the resolved run", async () => {
    await runHandler({ testRunId: undefined });
    expect(mocks.getTestRunJsCoverage).toHaveBeenCalledWith(
      {},
      "tr-head",
      expect.anything(),
    );
  });

  // The failure this whole path exists to prevent: before the lookup skipped
  // runs over a pinned session set, a just-triggered run won it, so
  // --headPlusTestRunIds naming that run unioned it with itself and returned one
  // run's coverage looking like a combined total.
  it("rejects unioning the resolved run with itself", async () => {
    await expect(
      runHandler({ testRunId: undefined, headPlusTestRunIds: "tr-head" }),
    ).rejects.toThrow(/tr-head is the run being queried/);
    expect(mocks.getTestRunJsCoverage).not.toHaveBeenCalled();
  });

  // Rejected on the id itself, not on "nothing left to union" — the request is
  // equally confused when other runs remain.
  it("rejects it even when other runs would remain", async () => {
    await expect(
      runHandler({ testRunId: undefined, headPlusTestRunIds: "tr-head,tr-2" }),
    ).rejects.toBeInstanceOf(CliUserError);
    expect(mocks.getTestRunJsCoverage).not.toHaveBeenCalled();
  });

  it("unions runs that are not the primary", async () => {
    await runHandler({ testRunId: undefined, headPlusTestRunIds: "tr-2,tr-3" });
    expect(mocks.getTestRunJsCoverage).toHaveBeenCalledWith(
      {},
      "tr-head",
      expect.objectContaining({ unionTestRunIds: ["tr-2", "tr-3"] }),
    );
  });
});
