import { serializeJson } from "@alwaysmeticulous/common/json";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import { checkCommentsCommand } from "../check-comments.command";
import { ignoreCheckCommand } from "../ignore-check.command";

vi.mock("../../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  assertTestRunInProjectOrThrow: vi.fn(),
  createClientWithOAuth: vi.fn(),
  ignoreCheck: vi.fn(),
  getCheckComments: vi.fn(),
  logNotice: vi.fn(),
  resolveTestRunForPullRequestOrThrow: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: vi.fn(),
  logNotice: mocks.logNotice,
}));
vi.mock("@alwaysmeticulous/client", () => ({
  createClientWithOAuth: mocks.createClientWithOAuth,
  ignoreCheck: mocks.ignoreCheck,
  getCheckComments: mocks.getCheckComments,
}));
vi.mock("../../../utils/resolve-test-run-from-commit", () => ({
  assertTestRunInProjectOrThrow: mocks.assertTestRunInProjectOrThrow,
  resolveTestRunForPullRequestOrThrow:
    mocks.resolveTestRunForPullRequestOrThrow,
}));

const run = (command: unknown, args: Record<string, unknown>) =>
  (command as { handler: (args: unknown) => Promise<void> }).handler(args);

const target = {
  testRunId: "tr-1",
  checkId: "network-requests",
  checkType: undefined,
};
const targetOptions = { ...target, prNumber: undefined, project: undefined };

describe("check review commands", () => {
  let logSpy: MockInstance<typeof console.log>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.ignoreCheck.mockResolvedValue({});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => logSpy.mockRestore());

  it("ignore-check records the verdict with its reason and confirms it on stderr only", async () => {
    await run(ignoreCheckCommand, {
      ...targetOptions,
      checkType: "custom",
      reason: "Bundle grew by 40KB",
      json: false,
    });

    expect(mocks.ignoreCheck).toHaveBeenCalledWith({
      client: expect.anything(),
      ...target,
      checkType: "custom",
      reason: "Bundle grew by 40KB",
    });
    expect(logSpy).not.toHaveBeenCalled();
    expect(mocks.logNotice).toHaveBeenCalledWith("Check ignored.");
  });

  it("resolves --prNumber to the pull request's latest run", async () => {
    mocks.resolveTestRunForPullRequestOrThrow.mockResolvedValue({
      testRunId: "tr-pr",
      status: "Success",
    });

    await run(ignoreCheckCommand, {
      ...targetOptions,
      testRunId: undefined,
      prNumber: 42,
      project: "org/proj",
      reason: "Bundle grew by 40KB",
      json: false,
    });

    expect(mocks.resolveTestRunForPullRequestOrThrow).toHaveBeenCalledWith(
      expect.anything(),
      42,
      "org/proj",
    );
    expect(mocks.ignoreCheck).toHaveBeenCalledWith({
      client: expect.anything(),
      testRunId: "tr-pr",
      checkId: "network-requests",
      checkType: undefined,
      reason: "Bundle grew by 40KB",
    });
  });

  it.each([
    ["neither --testRunId nor --prNumber", { testRunId: undefined }],
    ["both --testRunId and --prNumber", { prNumber: 42 }],
  ])("refuses %s before logging in", async (_label, selector) => {
    await expect(
      run(ignoreCheckCommand, {
        ...targetOptions,
        ...selector,
        reason: "Bundle grew by 40KB",
        json: false,
      }),
    ).rejects.toThrow(/--testRunId/);
    expect(mocks.createClientWithOAuth).not.toHaveBeenCalled();
  });

  it("emits the MCP-identical empty object with --json", async () => {
    await run(ignoreCheckCommand, {
      ...targetOptions,
      reason: "Bundle grew by 40KB",
      json: true,
    });

    expect(`${String(logSpy.mock.calls[0][0])}\n`).toBe(
      `${serializeJson({})}\n`,
    );
    expect(mocks.logNotice).not.toHaveBeenCalled();
  });

  it("check-comments prints one row per comment as TSV", async () => {
    mocks.getCheckComments.mockResolvedValue([
      {
        id: "comment-1",
        isAgentAuthored: true,
        text: "Verdict: ignore\n\nUnrelated request",
      },
      {
        id: "comment-2",
        author: "Ada",
        isAgentAuthored: true,
        text: "Verdict: ignore\n\nFlake",
        isResolved: true,
      },
    ]);

    await run(checkCommentsCommand, {
      ...targetOptions,
      includeResolved: true,
      json: false,
    });

    expect(logSpy.mock.calls.map((call) => call[0])).toEqual([
      "id\tauthor\tisAgentAuthored\ttext\tisResolved",
      'comment-1\t\ttrue\t"Verdict: ignore\\n\\nUnrelated request"\tfalse',
      'comment-2\tAda\ttrue\t"Verdict: ignore\\n\\nFlake"\ttrue',
    ]);
  });
});
