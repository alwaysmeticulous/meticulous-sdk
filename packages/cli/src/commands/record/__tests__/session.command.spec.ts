import type * as Common from "@alwaysmeticulous/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
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

const runHandler = (args: Record<string, unknown> = {}) =>
  (
    recordSessionCommand as { handler: (args: unknown) => Promise<void> }
  ).handler(args);

describe("record session command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveApiTokenWithOAuth.mockResolvedValue("oauth-token");
    mocks.resolveProjectIdentifier.mockResolvedValue({
      projectId: "project-id",
    });
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

  it("passes --headless through when a remote debugging port is set", async () => {
    await (
      recordSessionCommand as { handler: (args: unknown) => Promise<void> }
    ).handler({ headless: true, remoteDebuggingPort: 9222 });

    expect(mocks.recordSession).toHaveBeenCalledWith(
      expect.objectContaining({ headless: true, remoteDebuggingPort: 9222 }),
    );
  });

  it("refuses --headless without a remote debugging port", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(
      (
        recordSessionCommand as { handler: (args: unknown) => Promise<void> }
      ).handler({ headless: true }),
    ).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.recordSession).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("seeds a saved login state, converted for the recording browser", async () => {
    const path = join(
      await mkdtemp(join(tmpdir(), "record-storage-")),
      "state.json",
    );
    await writeFile(
      path,
      JSON.stringify({
        cookies: [
          {
            name: "session",
            value: "abc",
            domain: "localhost",
            path: "/",
            expires: 1_900_000_000,
            httpOnly: true,
            secure: false,
            sameSite: "Lax",
          },
          {
            name: "transient",
            value: "x",
            domain: ".example.com",
            path: "/",
            expires: -1,
            httpOnly: false,
            secure: true,
          },
        ],
        origins: [
          {
            origin: "http://localhost:4173",
            localStorage: [{ name: "token", value: "jwt" }],
          },
          {
            origin: "https://idp.example.com",
            localStorage: [{ name: "other", value: "y" }],
          },
        ],
      }),
    );

    await runHandler({
      storageState: path,
      appUrl: "http://localhost:4173/dashboard",
    });

    expect(mocks.recordSession).toHaveBeenCalledWith(
      expect.objectContaining({
        storageToSeed: {
          cookies: [
            {
              name: "session",
              value: "abc",
              domain: "localhost",
              path: "/",
              expires: 1_900_000_000,
              httpOnly: true,
              secure: false,
              sameSite: "Lax",
            },
            {
              name: "transient",
              value: "x",
              domain: ".example.com",
              path: "/",
              httpOnly: false,
              secure: true,
            },
          ],
          localStorageEntries: [{ key: "token", value: "jwt" }],
        },
      }),
    );
  });

  it("refuses --storageState without --appUrl", async () => {
    await expect(
      runHandler({ storageState: "/tmp/state.json" }),
    ).rejects.toThrow("--storageState requires --appUrl");
    expect(mocks.recordSession).not.toHaveBeenCalled();
  });
});
