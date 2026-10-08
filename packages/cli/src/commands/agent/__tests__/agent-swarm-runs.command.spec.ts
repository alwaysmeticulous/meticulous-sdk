import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import yargs, { type Options as YargsOptions } from "yargs";
import { agentSwarmRunsCommand } from "../agent-swarm-runs.command";

// Make wrapHandler a passthrough so handler errors propagate directly to tests.
vi.mock("../../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getAgentSwarmRuns: vi.fn(),
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
  getAgentSwarmRuns: mocks.getAgentSwarmRuns,
  getAgentCurrentProject: mocks.getAgentCurrentProject,
}));

const runHandler = (args: Record<string, unknown> = {}) =>
  (
    agentSwarmRunsCommand as { handler: (args: unknown) => Promise<void> }
  ).handler({
    json: false,
    ...args,
  });

let logSpy: ReturnType<typeof vi.spyOn>;
const stdoutText = () => logSpy.mock.calls.flat().join("\n");
const noticeText = () => mocks.logNotice.mock.calls.flat().join("\n");

const SWARM_RUNS = [
  {
    swarmRunId: "run-2",
    createdAt: "2026-09-02T00:00:00.000Z",
    status: "succeeded",
    commitSha: "sha-2",
    prNumber: "17",
    total: 3,
    pass: 2,
    fail: 1,
    blocked: 0,
    skipped: 0,
    running: 0,
    notStarted: 0,
  },
  {
    swarmRunId: "run-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    status: "succeeded",
    commitSha: "sha-1",
  },
];

describe("agent-swarm-runs command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getAgentSwarmRuns.mockResolvedValue({ swarmRuns: SWARM_RUNS });
    mocks.getAgentCurrentProject.mockRejectedValue(new Error("offline"));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("emits JSON as a bare run array (matching the MCP tool)", async () => {
    await runHandler({ json: true });

    expect(JSON.parse(stdoutText())).toEqual(SWARM_RUNS);
  });

  it("emits a TSV header matching the JSON keys, then one row per run", async () => {
    await runHandler();

    expect(stdoutText().split("\n")).toEqual([
      "swarmRunId\tcreatedAt\tstatus\tcommitSha\tprNumber",
      "run-2\t2026-09-02T00:00:00.000Z\tsucceeded\tsha-2\t17",
      "run-1\t2026-09-01T00:00:00.000Z\tsucceeded\tsha-1\t",
    ]);
  });

  it("adds the count columns, leaving cells empty where a run has no counts", async () => {
    await runHandler({ includeCounts: true });

    const lines = stdoutText().split("\n");
    expect(lines[0]).toBe(
      "swarmRunId\tcreatedAt\tstatus\tcommitSha\tprNumber\ttotal\tpass\tfail\tblocked\tskipped\trunning\tnotStarted",
    );
    expect(lines[1]?.split("\t").slice(5)).toEqual([
      "3",
      "2",
      "1",
      "0",
      "0",
      "0",
      "0",
    ]);
    expect(lines[2]?.split("\t").slice(5)).toEqual([
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  });

  it("rejects --limit above 25 with --includeCounts before calling the backend", async () => {
    await expect(
      runHandler({ includeCounts: true, limit: 26 }),
    ).rejects.toThrow(/--limit must be at most 25 with --includeCounts/);
    expect(mocks.getAgentSwarmRuns).not.toHaveBeenCalled();
  });

  it("passes every option through to the client call", async () => {
    await runHandler({
      project: "org/proj",
      prNumber: "17",
      status: "failed,timedOut",
      createdSince: "2026-09-01",
      createdUntil: "2026-09-02",
      includeCounts: true,
      limit: 5,
      offset: 10,
    });

    expect(mocks.getAgentSwarmRuns).toHaveBeenCalledWith(
      {},
      {
        project: "org/proj",
        prNumber: "17",
        status: "failed,timedOut",
        createdSince: "2026-09-01",
        createdUntil: "2026-09-02",
        includeCounts: true,
        limit: 5,
        offset: 10,
      },
    );
  });

  it("relays the backend's notes on stderr, keeping stdout for the result", async () => {
    const note =
      "Agent swarm runs 1-2, newest first; use --offset and/or --limit to view more";
    mocks.getAgentSwarmRuns.mockResolvedValue({
      swarmRuns: SWARM_RUNS,
      notes: [note],
    });

    await runHandler({ json: true });

    expect(JSON.parse(stdoutText())).toEqual(SWARM_RUNS);
    expect(noticeText()).toBe(note);
  });

  it.each([
    [{}, "No Agent swarm runs found for this project."],
    [
      { prNumber: "17" },
      "No Agent swarm runs for pull request 17 found for this project.",
    ],
    [
      { status: "failed" },
      "No Agent swarm runs matching the filters found for this project.",
    ],
  ])("explains an empty first page for %j", async (args, message) => {
    mocks.getAgentSwarmRuns.mockResolvedValue({ swarmRuns: [] });

    await runHandler(args);

    expect(stdoutText()).toBe("");
    expect(noticeText()).toContain(message);
  });

  it.each([
    [{}, true],
    [{ includeCounts: true }, true],
    [{ offset: 0 }, true],
    [{ prNumber: "17" }, false],
    [{ status: "failed" }, false],
    [{ createdSince: "2026-09-01" }, false],
    [{ createdUntil: "2026-09-01" }, false],
  ])(
    "adds the project-selection hint to an empty first page for %j only when unfiltered (as the MCP tool does)",
    async (args, expectHint) => {
      mocks.getAgentSwarmRuns.mockResolvedValue({ swarmRuns: [] });

      await runHandler(args);

      expect(mocks.getAgentCurrentProject).toHaveBeenCalledTimes(
        expectHint ? 1 : 0,
      );
    },
  );

  it("leaves an empty later page to the backend's notice", async () => {
    mocks.getAgentSwarmRuns.mockResolvedValue({
      swarmRuns: [],
      notes: ["no Agent swarm runs at offset 500; use a smaller --offset"],
    });

    await runHandler({ offset: 500 });

    expect(noticeText()).toBe(
      "no Agent swarm runs at offset 500; use a smaller --offset",
    );
  });

  describe("yargs parsing layer", () => {
    const parse = (argv: string[]) =>
      yargs(argv)
        .options(agentSwarmRunsCommand.builder as Record<string, YargsOptions>)
        .strict()
        .fail((msg) => {
          throw new Error(msg);
        })
        .parse() as Record<string, unknown>;

    it("keeps --prNumber a string", () => {
      expect(parse(["--prNumber", "0123"]).prNumber).toBe("0123");
    });

    it.each([["--commitSha"], ["--testRunId"]])(
      "no longer accepts %s",
      (flag) => {
        expect(() => parse([flag, "abc"])).toThrow(/Unknown argument/);
      },
    );

    it.each([["0"], ["1001"], ["1.5"]])("rejects --limit %s", (limit) => {
      expect(() => parse(["--limit", limit])).toThrow(/--limit must be/);
    });

    it("rejects a negative --offset", () => {
      expect(() => parse(["--offset", "-1"])).toThrow(/--offset must be/);
    });
  });
});
