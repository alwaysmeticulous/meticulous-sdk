import type * as MeticulousClientModule from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUserError } from "../../utils/cli-user-error";
import { promoteSessionsCommand } from "./promote-sessions.command";

vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  promoteSessions: vi.fn(),
  isFetchError: vi.fn(
    (error: unknown) =>
      (error as { isAxiosError?: boolean } | null)?.isAxiosError === true,
  ),
  logNotice: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", async (importOriginal) => ({
  ...(await importOriginal<typeof MeticulousClientModule>()),
  createClientWithOAuth: mocks.createClientWithOAuth,
  promoteSessions: mocks.promoteSessions,
  isFetchError: mocks.isFetchError,
}));

vi.mock("@alwaysmeticulous/common", () => ({
  logNotice: mocks.logNotice,
  logProgress: vi.fn(),
  initLogger: vi.fn(),
}));

const runHandler = (overrides: Record<string, unknown> = {}) =>
  (
    promoteSessionsCommand as { handler: (args: unknown) => Promise<void> }
  ).handler({
    apiToken: undefined,
    testRunId: "tr-agent",
    sessionIds: undefined,
    json: false,
    ...overrides,
  });

const RESPONSE = {
  promotedSessionIds: ["s1", "s2"],
  alreadySelectedSessionIds: [],
  updatedBaseTestRunId: "tr-combined",
  notes: ["Combined run note."],
};

describe("agent promote-sessions", () => {
  const client = {};
  let stdout: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue(client);
    mocks.promoteSessions.mockResolvedValue(RESPONSE);
    stdout = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => {
      stdout.push(line);
    });
  });

  it("promotes every session of the run when --sessionIds is omitted", async () => {
    await runHandler();

    expect(mocks.promoteSessions).toHaveBeenCalledWith(
      client,
      "tr-agent",
      undefined,
    );
    expect(stdout).toEqual([
      "promotedSessionIds:\ts1,s2",
      "alreadySelectedSessionIds:\t",
      "updatedBaseTestRunId:\ttr-combined",
    ]);
    expect(mocks.logNotice).toHaveBeenCalledWith("Combined run note.");
  });

  it("passes a comma-separated subset", async () => {
    await runHandler({ sessionIds: "s1, s2,," });

    expect(mocks.promoteSessions).toHaveBeenCalledWith(client, "tr-agent", [
      "s1",
      "s2",
    ]);
  });

  it("prints the response verbatim under --json", async () => {
    await runHandler({ json: true });

    expect(JSON.parse(stdout.join("\n"))).toEqual(RESPONSE);
  });

  it("rejects an empty --sessionIds", async () => {
    await expect(runHandler({ sessionIds: ",," })).rejects.toBeInstanceOf(
      CliUserError,
    );
    expect(mocks.promoteSessions).not.toHaveBeenCalled();
  });

  it("turns a named refusal into a clean user error", async () => {
    mocks.promoteSessions.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          reason: "session-not-replayed",
          message: "Session s1 produced no replay.",
        },
      },
    });

    await expect(runHandler()).rejects.toThrow(
      new CliUserError("Session s1 produced no replay."),
    );
  });
});
