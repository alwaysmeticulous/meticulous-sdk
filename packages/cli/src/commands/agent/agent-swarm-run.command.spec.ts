import type * as Client from "@alwaysmeticulous/client";
import { serializeJson } from "@alwaysmeticulous/common/json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../../utils/cli-user-error";
import { agentSwarmRunCommand } from "./agent-swarm-run.command";

vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getAgentSwarmRun: vi.fn(),
  getCommitSha: vi.fn(),
  logNotice: vi.fn(),
  pollWhileProcessing: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: vi.fn(),
  logNotice: mocks.logNotice,
  logProgress: vi.fn(),
  getCommitSha: mocks.getCommitSha,
  hasUncommittedChanges: vi.fn(() => Promise.resolve(false)),
  getUntrackedFiles: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@alwaysmeticulous/client", async (importOriginal) => ({
  ...(await importOriginal<typeof Client>()),
  createClientWithOAuth: mocks.createClientWithOAuth,
  getAgentSwarmRun: mocks.getAgentSwarmRun,
}));
vi.mock("../../utils/poll-while-processing", () => ({
  pollWhileProcessing: mocks.pollWhileProcessing,
}));

const run = (command: unknown, args: Record<string, unknown>) =>
  (command as { handler: (args: unknown) => Promise<void> }).handler(args);

const defaults = {
  swarmRunId: undefined,
  testRunId: undefined,
  commitSha: undefined,
  prNumber: undefined,
  project: undefined,
  status: undefined,
  dontWaitForSwarmRunToComplete: false,
  json: false,
};

const runResponse = {
  run: {
    swarmRunId: "run-1",
    status: "succeeded",
    phase: "succeeded",
    commitSha: "abc",
    url: "https://app.meticulous.ai/run-1",
  },
  resultSource: "result",
  counts: {
    total: 2,
    pass: 1,
    fail: 1,
    blocked: 0,
    skipped: 0,
    notStarted: 0,
    running: 0,
  },
  cases: [
    {
      caseIndex: 0,
      title: "Search",
      status: "pass",
      stepCount: 1,
      comparisonCount: 0,
      regressionCount: 0,
      usedSyntheticMockData: false,
    },
    {
      caseIndex: 1,
      title: "Checkout\ttotal",
      status: "blocked",
      blockedBy: "environment",
      outcomeSummary: "The API\ntimed out.",
      takeaway: "The total is wrong.",
      stepCount: 2,
      comparisonCount: 0,
      regressionCount: 0,
      usedSyntheticMockData: false,
    },
  ],
} as unknown as Client.AgentSwarmRunResponse;

const processing = {
  status: "processing",
  message: "Agent swarm run run-1 is running (1/2 cases done).",
};

describe("agent agent-swarm-run", () => {
  const client = {};
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue(client);
    mocks.getCommitSha.mockImplementation((commitSha: string | undefined) =>
      Promise.resolve(commitSha ?? "head-sha"),
    );
    mocks.getAgentSwarmRun.mockResolvedValue(runResponse);
    mocks.pollWhileProcessing.mockImplementation(
      async (request: () => Promise<unknown>) => request(),
    );
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => logSpy.mockRestore());

  it("prints the cases as TSV and the run on stderr", async () => {
    await run(agentSwarmRunCommand, { ...defaults, swarmRunId: "run-1" });

    expect(logSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      "caseIndex\tstatus\tblockedBy\ttitle\toutcomeSummary\ttakeaway",
      "0\tpass\t\tSearch\t\t",
      "1\tblocked\tenvironment\tCheckout total\tThe API timed out.\tThe total is wrong.",
    ]);
    expect(mocks.logNotice).toHaveBeenCalledWith(
      "Agent swarm run run-1: succeeded (commit abc) — 2 cases: 1 pass, 1 fail, 0 blocked",
    );
    expect(mocks.logNotice).not.toHaveBeenCalledWith(
      "https://app.meticulous.ai/run-1",
    );
    expect(mocks.logNotice).not.toHaveBeenCalledWith(
      expect.stringContaining("Takeaway"),
    );
  });

  it("names a superseding run on the same status line", async () => {
    mocks.getAgentSwarmRun.mockResolvedValue({
      ...runResponse,
      supersededBySwarmRunId: "run-2",
    });

    await run(agentSwarmRunCommand, { ...defaults, swarmRunId: "run-1" });

    expect(mocks.logNotice).toHaveBeenCalledWith(
      "Agent swarm run run-1: succeeded (commit abc) — 2 cases: 1 pass, 1 fail, 0 blocked — superseded by newer run run-2",
    );
    expect(mocks.logNotice).toHaveBeenCalledTimes(1);
  });

  it("prints the header even when no case matches", async () => {
    mocks.getAgentSwarmRun.mockResolvedValue({ ...runResponse, cases: [] });

    await run(agentSwarmRunCommand, {
      ...defaults,
      swarmRunId: "run-1",
      status: "fail",
    });

    expect(logSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      "caseIndex\tstatus\tblockedBy\ttitle\toutcomeSummary\ttakeaway",
    ]);
    expect(mocks.logNotice).toHaveBeenCalledWith(
      "Agent swarm run run-1 has no cases with status fail.",
    );
  });

  it("lets a not-testable run's reason explain its missing cases", async () => {
    mocks.getAgentSwarmRun.mockResolvedValue({
      ...runResponse,
      cases: [],
      notTestable: { category: "backend-only", reason: "No frontend change." },
    });

    await run(agentSwarmRunCommand, { ...defaults, swarmRunId: "run-1" });

    expect(mocks.logNotice).toHaveBeenCalledWith(
      "Not testable (backend-only): No frontend change.",
    );
    expect(mocks.logNotice).not.toHaveBeenCalledWith(
      expect.stringContaining("has no cases"),
    );
  });

  it("passes the status filter through and prints the JSON", async () => {
    await run(agentSwarmRunCommand, {
      ...defaults,
      swarmRunId: "run-1",
      status: "fail,blocked",
      json: true,
    });

    expect(mocks.getAgentSwarmRun).toHaveBeenCalledWith(
      client,
      { swarmRunId: "run-1" },
      { status: "fail,blocked" },
    );
    expect(logSpy).toHaveBeenCalledWith(serializeJson(runResponse));
  });

  it.each([
    [{ testRunId: "tr-1" }, { testRunId: "tr-1" }],
    [
      { prNumber: 12, project: "org/proj" },
      { prNumber: 12, project: "org/proj" },
    ],
    [{ commitSha: "abc" }, { commitSha: "abc", project: undefined }],
    [{}, { commitSha: "head-sha", project: undefined }],
  ])("selects the run from %o", async (selector, expected) => {
    await run(agentSwarmRunCommand, { ...defaults, ...selector });

    expect(mocks.getAgentSwarmRun).toHaveBeenCalledWith(client, expected, {
      status: undefined,
    });
  });

  it.each([
    { swarmRunId: "run-1", commitSha: "abc" },
    { testRunId: "tr-1", prNumber: 12 },
  ])("rejects naming the run twice: %o", async (selector) => {
    await expect(
      run(agentSwarmRunCommand, { ...defaults, ...selector }),
    ).rejects.toBeInstanceOf(CliUserError);
    expect(mocks.getAgentSwarmRun).not.toHaveBeenCalled();
  });

  it("waits for an unfinished run by default", async () => {
    await run(agentSwarmRunCommand, { ...defaults, swarmRunId: "run-1" });

    expect(mocks.pollWhileProcessing).toHaveBeenCalledTimes(1);
  });

  it("relays the processing body once with --dontWaitForSwarmRunToComplete --json", async () => {
    mocks.getAgentSwarmRun.mockResolvedValue(processing);

    await run(agentSwarmRunCommand, {
      ...defaults,
      swarmRunId: "run-1",
      dontWaitForSwarmRunToComplete: true,
      json: true,
    });

    expect(mocks.pollWhileProcessing).not.toHaveBeenCalled();
    expect(mocks.getAgentSwarmRun).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls).toEqual([[serializeJson(processing)]]);
    expect(mocks.logNotice).toHaveBeenCalledWith(processing.message);
  });

  it("prints nothing on stdout for an unfinished run without --json", async () => {
    mocks.getAgentSwarmRun.mockResolvedValue(processing);

    await run(agentSwarmRunCommand, {
      ...defaults,
      swarmRunId: "run-1",
      dontWaitForSwarmRunToComplete: true,
    });

    expect(logSpy).not.toHaveBeenCalled();
    expect(mocks.logNotice).toHaveBeenCalledWith(processing.message);
  });
});
