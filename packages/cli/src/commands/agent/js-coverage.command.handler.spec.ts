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

/** A backend 400 rejecting the coverage request, as the client surfaces it. */
const rejectionError = (reason: string, message: string): unknown => ({
  response: { status: 400, data: { message, reason } },
});

// Which run gets requested, and how a base run's own coverage is handled, is
// now entirely the backend's call (see `getTestRunJsCoverageV2`): the CLI no
// longer inspects status itself before fetching, whether the run was named
// via --testRunId, --testRunIds, or resolved from a commit. These tests cover
// what the handler does with whatever the backend returns or rejects with.
describe("js-coverage handler naming a still-Partial run", () => {
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

  it("fetches coverage for it like any other run", async () => {
    await runHandler();
    expect(mocks.getTestRunJsCoverage).toHaveBeenCalledWith(
      {},
      "tr-1",
      expect.anything(),
    );
  });

  // The backend refuses a base run whose selected set hasn't fully replayed,
  // naming the remedy — relayed as a clean error rather than the generic path.
  it("maps the backend's incomplete-base-run refusal to a CliUserError", async () => {
    mocks.getTestRunJsCoverage.mockRejectedValue(
      rejectionError(
        "incomplete-base-run",
        "Test run tr-1 is a base run other test runs compare against: it replays its selected sessions on demand, and 2 of its 3 have not run, so its coverage understates this commit. Replay the rest with complete-base-run (MCP: complete_base_run) and ask again, or ask for the project's overall coverage instead (js-coverage --latestForProject / get_project_js_coverage).",
      ),
    );
    await expect(runHandler()).rejects.toBeInstanceOf(CliUserError);
    await expect(runHandler()).rejects.toThrow(/complete-base-run/);
  });

  it("says nothing about base runs when the backend served the coverage", async () => {
    await runHandler();
    expect(mocks.logNotice).not.toHaveBeenCalledWith(
      expect.stringMatching(/is a base run/),
    );
  });

  // A base run named among the runs to union in is sent to the backend like
  // anything else; the backend's rejection (an unreplayed remainder would
  // silently understate a combined total) is what turns into a clean error.
  it("maps the backend's union rejection to a CliUserError", async () => {
    mocks.getTestRun.mockImplementation(
      ({ testRunId }: { testRunId: string }) => ({
        status: testRunId === "tr-1" ? "Success" : "Partial",
      }),
    );
    mocks.getTestRunJsCoverage.mockRejectedValue(
      rejectionError(
        "incomplete-base-run-in-union",
        "tr-2 is a base run other runs compare against.",
      ),
    );
    await expect(
      runHandler({ testRunId: undefined, testRunIds: "tr-1,tr-2" }),
    ).rejects.toBeInstanceOf(CliUserError);
    await expect(
      runHandler({ testRunId: undefined, testRunIds: "tr-1,tr-2" }),
    ).rejects.toThrow(/tr-2 is a base run/);
    expect(mocks.getTestRunJsCoverage).toHaveBeenCalled();
  });

  // --prDiffOnly is sent through rather than pre-rejected; the backend's
  // refusal (a base run has no PR to scope a diff to) is what's mapped.
  it("maps the backend's --prDiffOnly refusal to a CliUserError", async () => {
    mocks.getTestRunJsCoverage.mockRejectedValue(
      rejectionError(
        "base-run-no-pr-diff",
        "Test run tr-1 is a base run other test runs compare against, so it has no PR diff to scope coverage to. Drop prDiffOnly to get its whole-run coverage.",
      ),
    );
    await expect(runHandler({ prDiffOnly: true })).rejects.toThrow(
      /drop prDiffOnly/i,
    );
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

  // Only the expected-refusal reasons are reinterpreted; anything else is
  // still a genuine failure and must keep reaching the generic (Sentry) path.
  it("leaves a non-404 failure alone", async () => {
    const serverError = { response: { status: 500, data: {} } };
    mocks.getTestRunJsCoverage.mockRejectedValue(serverError);
    await expect(runHandler()).rejects.toBe(serverError);
  });

  // The status read before the request is a snapshot: a run reported Success
  // can still turn out to be a base run with an unreplayed remainder (a settled
  // pool). The backend's refusal is routine, so it must not reach the generic
  // error path (unhelpful `--help` tip plus a Sentry report).
  it("turns the backend's base-run refusal into a CliUserError", async () => {
    mocks.getTestRunJsCoverage.mockRejectedValue(
      rejectionError(
        "incomplete-base-run",
        "Test run tr-1 is a base run other test runs compare against: it replays its selected sessions on demand, and 2 of its 3 have not run, so its coverage understates this commit.",
      ),
    );
    await expect(runHandler()).rejects.toBeInstanceOf(CliUserError);
    await expect(runHandler()).rejects.toThrow(/tr-1 is a base run/);
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

// A commit on the default branch usually resolves to a base run. Whether such a
// run's coverage is reportable depends on how much of its selected set has
// replayed, which only the backend knows (see agent-api.service.base-run.spec.ts)
// — the CLI relays whatever `getTestRunJsCoverage` returns or rejects with,
// exactly as for a run named explicitly. This re-covers that the
// commit-resolution path feeds the same fetch machinery.
describe("js-coverage handler resolving a commit to a base run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getCommitSha.mockResolvedValue("sha-1");
    mocks.getTestRunForCommit.mockResolvedValue({
      testRunId: "tr-base",
      status: "Partial",
    });
    // Re-reading the resolved run (the wait-for-completion step) sees the same
    // Partial status the lookup reported.
    mocks.getTestRun.mockResolvedValue({ status: "Partial" });
    mocks.getTestRunJsCoverage.mockResolvedValue({ files: [] });
    mocks.isFetchError.mockImplementation(
      (error: unknown) =>
        typeof error === "object" && error != null && "response" in error,
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("fetches coverage for the resolved run rather than branching on isBaseRun", async () => {
    await runHandler({ testRunId: undefined });
    expect(mocks.getTestRunJsCoverage).toHaveBeenCalledWith(
      {},
      "tr-base",
      expect.anything(),
    );
  });

  it("relays the backend's refusal for the resolved run as a clean error", async () => {
    mocks.getTestRunJsCoverage.mockRejectedValue(
      rejectionError(
        "incomplete-base-run",
        "Test run tr-base is a base run other test runs compare against: 2 of its 3 have not run. Replay the rest with complete-base-run (MCP: complete_base_run) and ask again.",
      ),
    );
    await expect(runHandler({ testRunId: undefined })).rejects.toBeInstanceOf(
      CliUserError,
    );
    await expect(runHandler({ testRunId: undefined })).rejects.toThrow(
      /tr-base is a base run/,
    );
  });
});
