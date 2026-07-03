import type * as Common from "@alwaysmeticulous/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordSessionCommand } from "../session.command";

const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const mocks = vi.hoisted(() => ({
  resolveApiTokenWithOAuth: vi.fn(),
  createClientWithOAuth: vi.fn(),
  getProject: vi.fn(),
  getRecordingCommandId: vi.fn(),
  postSessionIdNotification: vi.fn(),
  resolveProjectIdentifier: vi.fn(),
  fetchAsset: vi.fn(),
  recordSession: vi.fn(),
  getCommitSha: vi.fn(),
  getMeticulousLocalDataDir: vi.fn(),
}));

vi.mock("../../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

vi.mock("@alwaysmeticulous/common", async (importOriginal) => {
  const actual = await importOriginal<typeof Common>();
  return {
    ...actual,
    initLogger: () => loggerMock,
    getCommitSha: mocks.getCommitSha,
    getMeticulousLocalDataDir: mocks.getMeticulousLocalDataDir,
    DebugLogger: { create: vi.fn() },
  };
});

vi.mock("@alwaysmeticulous/client", () => ({
  resolveApiTokenWithOAuth: mocks.resolveApiTokenWithOAuth,
  createClientWithOAuth: mocks.createClientWithOAuth,
  getProject: mocks.getProject,
  getRecordingCommandId: mocks.getRecordingCommandId,
  postSessionIdNotification: mocks.postSessionIdNotification,
}));

vi.mock("@alwaysmeticulous/downloading-helpers", () => ({
  fetchAsset: mocks.fetchAsset,
}));

vi.mock("@alwaysmeticulous/record", () => ({
  recordSession: mocks.recordSession,
}));

vi.mock("../../../utils/resolve-project-identifier", () => ({
  resolveProjectIdentifier: mocks.resolveProjectIdentifier,
}));

const runHandler = (args: { apiToken?: string } = {}) =>
  (
    recordSessionCommand as { handler: (args: unknown) => Promise<void> }
  ).handler(args);

describe("record session command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveApiTokenWithOAuth.mockResolvedValue("oauth-token");
    mocks.resolveProjectIdentifier.mockReturnValue({ projectId: "project-id" });
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getProject.mockResolvedValue({
      recordingToken: "recording-token",
      organization: { name: "org" },
      name: "project",
    });
    mocks.getCommitSha.mockResolvedValue("commit-sha");
    mocks.getMeticulousLocalDataDir.mockReturnValue("/tmp/meticulous");
    mocks.getRecordingCommandId.mockResolvedValue("recording-command-id");
    mocks.fetchAsset.mockResolvedValue("snippet");
    mocks.recordSession.mockResolvedValue(undefined);
  });

  it("builds the client via createClientWithOAuth so the token refreshes mid-recording", async () => {
    await runHandler({});

    expect(mocks.createClientWithOAuth).toHaveBeenCalledTimes(1);
    expect(mocks.recordSession).toHaveBeenCalledTimes(1);
  });

  it("passes the raw apiToken option (not the resolved token) so the OAuth-refresh path is taken", async () => {
    await runHandler({});

    expect(mocks.createClientWithOAuth).toHaveBeenCalledWith({
      apiToken: undefined,
      enableOAuthLogin: true,
    });
  });
});
