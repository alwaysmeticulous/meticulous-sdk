import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import yargs, { type Options as YargsOptions } from "yargs";
import { testRunsCommand } from "../test-runs.command";

// Make wrapHandler a passthrough so handler errors propagate directly to tests.
vi.mock("../../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getTestRuns: vi.fn(),
  getAgentCurrentProject: vi.fn(),
  logNotice: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logNotice: mocks.logNotice,
}));

vi.mock("@alwaysmeticulous/client", () => ({
  createClientWithOAuth: mocks.createClientWithOAuth,
  getTestRuns: mocks.getTestRuns,
  getAgentCurrentProject: mocks.getAgentCurrentProject,
}));

const runHandler = (args: Record<string, unknown> = {}) =>
  (testRunsCommand as { handler: (args: unknown) => Promise<void> }).handler({
    json: false,
    ...args,
  });

let logSpy: ReturnType<typeof vi.spyOn>;
const stdoutText = () => logSpy.mock.calls.flat().join("\n");
const noticeText = () => mocks.logNotice.mock.calls.flat().join("\n");

const TEST_RUNS = [
  {
    id: "run-2",
    createdAt: "2026-09-02T00:00:00.000Z",
    status: "Failure",
    commitSha: "sha-2",
    prNumber: "17",
    baseTestRunId: "base-1",
    diffCount: 3,
    durationSeconds: 150,
    checkWarningCount: 2,
    checkFailureCount: 0,
  },
  {
    id: "run-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    status: "Skipped",
    commitSha: "sha-1",
    prNumber: "17",
  },
];

describe("test-runs command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getTestRuns.mockResolvedValue({ testRuns: TEST_RUNS });
    mocks.getAgentCurrentProject.mockRejectedValue(new Error("offline"));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("emits JSON as a bare test-run array (matching the MCP tool)", async () => {
    await runHandler({ json: true });

    expect(JSON.parse(stdoutText())).toEqual(TEST_RUNS);
  });

  it("emits a TSV header matching the JSON keys, then one row per run", async () => {
    await runHandler();

    expect(stdoutText().split("\n")).toEqual([
      "id\tcreatedAt\tstatus\tcommitSha\tprNumber",
      "run-2\t2026-09-02T00:00:00.000Z\tFailure\tsha-2\t17",
      "run-1\t2026-09-01T00:00:00.000Z\tSkipped\tsha-1\t17",
    ]);
  });

  it("adds the requested columns, leaving a cell empty where a run has no value", async () => {
    await runHandler({
      includeBaseTestRunId: true,
      includeDiffCount: true,
      includeDurationSeconds: true,
      includeCheckIssueCounts: true,
    });

    expect(stdoutText().split("\n")).toEqual([
      "id\tcreatedAt\tstatus\tcommitSha\tprNumber\tbaseTestRunId\tdiffCount\tcheckWarningCount\tcheckFailureCount\tdurationSeconds",
      "run-2\t2026-09-02T00:00:00.000Z\tFailure\tsha-2\t17\tbase-1\t3\t2\t0\t150",
      "run-1\t2026-09-01T00:00:00.000Z\tSkipped\tsha-1\t17\t\t\t\t\t",
    ]);
  });

  it("prints a zero diff count rather than an empty cell", async () => {
    mocks.getTestRuns.mockResolvedValue({
      testRuns: [{ ...TEST_RUNS[1], status: "Success", diffCount: 0 }],
    });

    await runHandler({ includeDiffCount: true });

    expect(stdoutText().split("\n")[1]?.split("\t").at(-1)).toBe("0");
  });

  it("drops the prNumber column under --baseTestRuns", async () => {
    mocks.getTestRuns.mockResolvedValue({
      testRuns: [
        {
          id: "base-1",
          createdAt: "2026-09-01T00:00:00.000Z",
          status: "Partial",
          commitSha: "sha-b",
        },
      ],
    });

    await runHandler({ baseTestRuns: true });

    expect(stdoutText().split("\n")).toEqual([
      "id\tcreatedAt\tstatus\tcommitSha",
      "base-1\t2026-09-01T00:00:00.000Z\tPartial\tsha-b",
    ]);
  });

  it.each([{ includeBaseTestRunId: true }, { includeDiffCount: true }])(
    "rejects --limit above 100 with %j before calling the backend",
    async (args) => {
      await expect(runHandler({ ...args, limit: 101 })).rejects.toThrow(
        /--limit must be at most 100 with --includeBaseTestRunId or --includeDiffCount/,
      );
      expect(mocks.getTestRuns).not.toHaveBeenCalled();
    },
  );

  it("passes every option through to the client call", async () => {
    await runHandler({
      project: "org/proj",
      prNumber: "17",
      status: "Failure",
      createdSince: "2026-09-01",
      createdUntil: "2026-09-02",
      latestPerPullRequest: true,
      withCheckIssuesOnly: true,
      checkIds: "accessibility",
      includeDiffCount: true,
      includeCheckIssueCounts: true,
      limit: 5,
      offset: 10,
    });

    expect(mocks.getTestRuns).toHaveBeenCalledWith(
      {},
      {
        project: "org/proj",
        prNumber: "17",
        baseTestRuns: undefined,
        latestPerPullRequest: true,
        status: "Failure",
        withDiffsOnly: undefined,
        withCheckIssuesOnly: true,
        checkIds: "accessibility",
        createdSince: "2026-09-01",
        createdUntil: "2026-09-02",
        includeBaseTestRunId: undefined,
        includeDiffCount: true,
        includeDurationSeconds: undefined,
        includeCheckIssueCounts: true,
        limit: 5,
        offset: 10,
      },
    );
  });

  it("relays the backend's notes on stderr, keeping stdout for the result", async () => {
    mocks.getTestRuns.mockResolvedValue({
      testRuns: TEST_RUNS,
      notes: [
        "test runs 1-2, newest first; use --offset and/or --limit to view more",
      ],
    });

    await runHandler({ json: true });

    expect(JSON.parse(stdoutText())).toEqual(TEST_RUNS);
    expect(noticeText()).toBe(
      "test runs 1-2, newest first; use --offset and/or --limit to view more",
    );
  });

  it.each([
    [{}, "No pull request test runs found for this project."],
    [{ baseTestRuns: true }, "No base test runs found for this project."],
    [
      { prNumber: "17" },
      "No test runs for pull request 17 found for this project.",
    ],
    [
      { status: "Failure" },
      "No pull request test runs matching the filters found for this project.",
    ],
  ])("explains an empty first page for %j", async (args, message) => {
    mocks.getTestRuns.mockResolvedValue({ testRuns: [] });

    await runHandler(args);

    expect(stdoutText()).toBe("");
    expect(noticeText()).toContain(message);
  });

  it.each([
    [{}, true],
    [{ baseTestRuns: true }, true],
    [{ latestPerPullRequest: true }, true],
    [{ offset: 0 }, true],
    [{ prNumber: "17" }, false],
    [{ status: "Failure" }, false],
    [{ withDiffsOnly: true }, false],
    [{ withCheckIssuesOnly: true }, false],
    [{ createdSince: "2026-09-01" }, false],
  ])(
    "adds the project-selection hint to an empty first page for %j only when unfiltered (as the MCP tool does)",
    async (args, expectHint) => {
      mocks.getTestRuns.mockResolvedValue({ testRuns: [] });

      await runHandler(args);

      expect(mocks.getAgentCurrentProject).toHaveBeenCalledTimes(
        expectHint ? 1 : 0,
      );
    },
  );

  it("leaves an empty later page to the backend's notice", async () => {
    mocks.getTestRuns.mockResolvedValue({
      testRuns: [],
      notes: ["no test runs at offset 500; use a smaller --offset"],
    });

    await runHandler({ offset: 500 });

    expect(noticeText()).toBe(
      "no test runs at offset 500; use a smaller --offset",
    );
  });

  describe("yargs parsing layer", () => {
    const parse = (argv: string[]) =>
      yargs(argv)
        .options(testRunsCommand.builder as Record<string, YargsOptions>)
        .fail((msg) => {
          throw new Error(msg);
        })
        .parse() as Record<string, unknown>;

    it("keeps --prNumber a string", () => {
      expect(parse(["--prNumber", "0123"]).prNumber).toBe("0123");
    });

    it.each([
      [["--prNumber", "17", "--baseTestRuns"]],
      [["--includeBaseTestRunId", "--baseTestRuns"]],
      [["--includeDiffCount", "--baseTestRuns"]],
      [["--includeDurationSeconds", "--baseTestRuns"]],
      [["--latestPerPullRequest", "--baseTestRuns"]],
      [["--withCheckIssuesOnly", "--baseTestRuns"]],
      [["--includeCheckIssueCounts", "--baseTestRuns"]],
      [["--withDiffsOnly", "--status", "Success"]],
    ])("rejects %o as conflicting", (argv) => {
      expect(() => parse(argv)).toThrow(/mutually exclusive/);
    });

    it("rejects --checkIds without --withCheckIssuesOnly", () => {
      // yargs words the error differently across environments, but names the
      // implication either way.
      expect(() => parse(["--checkIds", "accessibility"])).toThrow(
        /checkIds -> withCheckIssuesOnly/,
      );
    });

    it.each([["0"], ["1001"], ["1.5"]])("rejects --limit %s", (limit) => {
      expect(() => parse(["--limit", limit])).toThrow(/--limit must be/);
    });

    it("rejects a negative --offset", () => {
      expect(() => parse(["--offset", "-1"])).toThrow(/--offset must be/);
    });
  });
});
