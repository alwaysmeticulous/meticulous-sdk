import type * as Client from "@alwaysmeticulous/client";
import { serializeJson } from "@alwaysmeticulous/common/json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../../utils/cli-user-error";
import { agentSwarmRunCaseCommand } from "./agent-swarm-run-case.command";

vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getAgentSwarmRunCase: vi.fn(),
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
  getAgentSwarmRunCase: mocks.getAgentSwarmRunCase,
}));
vi.mock("../../utils/poll-while-processing", () => ({
  pollWhileProcessing: mocks.pollWhileProcessing,
}));

const run = (command: unknown, args: Record<string, unknown>) =>
  (command as { handler: (args: unknown) => Promise<void> }).handler(args);

const defaults = {
  swarmRunId: "run-1",
  testRunId: undefined,
  commitSha: undefined,
  prNumber: undefined,
  project: undefined,
  caseIndex: 0,
  fixPrompt: false,
  dontWaitForSwarmRunToComplete: false,
  json: false,
};

describe("agent agent-swarm-run-case", () => {
  const client = {};
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue(client);
    mocks.getCommitSha.mockImplementation((commitSha: string | undefined) =>
      Promise.resolve(commitSha ?? "head-sha"),
    );
    mocks.pollWhileProcessing.mockImplementation(
      async (request: () => Promise<unknown>) => request(),
    );
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => logSpy.mockRestore());

  it("prints only the fix prompt with --fixPrompt", async () => {
    mocks.getAgentSwarmRunCase.mockResolvedValue({ fixPrompt: "Fix it." });

    await run(agentSwarmRunCaseCommand, { ...defaults, fixPrompt: true });

    expect(mocks.getAgentSwarmRunCase).toHaveBeenCalledWith(
      client,
      { swarmRunId: "run-1" },
      0,
    );
    expect(logSpy.mock.calls).toEqual([["Fix it."]]);
  });

  it("fails --fixPrompt when the case has none", async () => {
    mocks.getAgentSwarmRunCase.mockResolvedValue({});

    await expect(
      run(agentSwarmRunCaseCommand, { ...defaults, fixPrompt: true }),
    ).rejects.toBeInstanceOf(CliUserError);
  });

  it("rejects --fixPrompt with --json before any request", async () => {
    await expect(
      run(agentSwarmRunCaseCommand, {
        ...defaults,
        fixPrompt: true,
        json: true,
      }),
    ).rejects.toThrow(
      "--fixPrompt cannot be combined with --json: --fixPrompt prints only the bare prompt text, and --json output already includes it as fixPrompt.",
    );
    expect(mocks.createClientWithOAuth).not.toHaveBeenCalled();
    expect(mocks.getAgentSwarmRunCase).not.toHaveBeenCalled();
  });

  it("looks the run up from the current git HEAD by default", async () => {
    mocks.getAgentSwarmRunCase.mockResolvedValue({ fixPrompt: "Fix it." });

    await run(agentSwarmRunCaseCommand, {
      ...defaults,
      swarmRunId: undefined,
      caseIndex: 3,
      fixPrompt: true,
    });

    expect(mocks.getAgentSwarmRunCase).toHaveBeenCalledWith(
      client,
      { commitSha: "head-sha", project: undefined },
      3,
    );
  });

  it("relays the processing body once with --dontWaitForSwarmRunToComplete --json", async () => {
    const processing = {
      status: "processing",
      message: "Agent swarm run run-1 is scheduled.",
    };
    mocks.getAgentSwarmRunCase.mockResolvedValue(processing);

    await run(agentSwarmRunCaseCommand, {
      ...defaults,
      dontWaitForSwarmRunToComplete: true,
      json: true,
    });

    expect(mocks.pollWhileProcessing).not.toHaveBeenCalled();
    expect(logSpy.mock.calls).toEqual([[serializeJson(processing)]]);
    expect(mocks.logNotice).toHaveBeenCalledWith(processing.message);
  });
});
