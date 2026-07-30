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
  getTestRunJsCoverage: vi.fn(),
  getProjectJsCoverage: vi.fn(),
  getReplayJsCoverage: vi.fn(),
  isFetchError: vi.fn(),
  logNotice: vi.fn(),
  logProgress: vi.fn(),
  initLogger: vi.fn(),
}));

// Partial: the column-selection helpers are real logic this command depends on,
// only the network calls are stubbed.
vi.mock("@alwaysmeticulous/client", async (importOriginal) => ({
  ...(await importOriginal<typeof MeticulousClientModule>()),
  createClientWithOAuth: mocks.createClientWithOAuth,
  getTestRun: mocks.getTestRun,
  getTestRunJsCoverage: mocks.getTestRunJsCoverage,
  getProjectJsCoverage: mocks.getProjectJsCoverage,
  getReplayJsCoverage: mocks.getReplayJsCoverage,
  isFetchError: mocks.isFetchError,
}));

vi.mock("@alwaysmeticulous/common", () => ({
  logNotice: mocks.logNotice,
  logProgress: mocks.logProgress,
  initLogger: mocks.initLogger,
  // Used by the resolver's dirty-tree notice, which no test here exercises
  // (every case passes an explicit --testRunId).
  getCommitSha: vi.fn(),
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
      expect.stringMatching(/tr-1 is a base run .*grows over time/),
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
