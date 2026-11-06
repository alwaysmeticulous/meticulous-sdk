import type { MeticulousClient } from "@alwaysmeticulous/client";
import { getReplayDiff, getTestRun } from "@alwaysmeticulous/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDebugContext } from "../resolve-debug-context";

vi.mock("@alwaysmeticulous/client", () => ({
  getReplayDiff: vi.fn(),
  getTestRun: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const resolve = () =>
  resolveDebugContext({
    client: {} as MeticulousClient,
    replayDiffId: "rd-1",
    replayIds: [],
    sessionId: undefined,
    screenshot: undefined,
  });

const mockReplayDiff = (headSessionId: string, baseSessionId: string) =>
  vi.mocked(getReplayDiff).mockResolvedValue({
    headReplay: { id: "head-1", sessionId: headSessionId },
    baseReplay: { id: "base-1", sessionId: baseSessionId },
  } as Awaited<ReturnType<typeof getReplayDiff>>);

describe("resolveDebugContext from a replay diff", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("downloads the base replay's session too when it replayed a different one", async () => {
    mockReplayDiff("session_p2", "session_p1");

    const context = await resolve();

    expect(context.sessionIds).toEqual(["session_p2", "session_p1"]);
    expect(context.replayDiffs[0].sessionId).toBe("session_p2");
  });

  it("downloads a shared session once", async () => {
    mockReplayDiff("session", "session");

    expect((await resolve()).sessionIds).toEqual(["session"]);
  });
});

describe("resolveDebugContext commit SHAs", () => {
  const HEAD_SHA = "df7aad61870c8d6a1a64daa62f444256c78b7740";
  const BASE_SHA = "a".repeat(64);

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  const resolveWithShas = (commitSha: string, baseCommitSha: string) => {
    vi.mocked(getReplayDiff).mockResolvedValue({
      headReplay: { id: "head-1", sessionId: "s", commitSha },
      baseReplay: { id: "base-1", sessionId: "s" },
      testRun: { id: "tr-1" },
    } as Awaited<ReturnType<typeof getReplayDiff>>);
    vi.mocked(getTestRun).mockResolvedValue({
      configData: { arguments: { baseCommitSha } },
    } as unknown as Awaited<ReturnType<typeof getTestRun>>);
    return resolve();
  };

  it("keeps valid SHA-1 and SHA-256 commit SHAs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const context = await resolveWithShas(HEAD_SHA, BASE_SHA);

    expect(context.commitSha).toBe(HEAD_SHA);
    expect(context.baseCommitSha).toBe(BASE_SHA);
    expect(warn).not.toHaveBeenCalled();
  });

  it("strips a -snapshot-<id> suffix to use the underlying commit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const context = await resolveWithShas(
      `${HEAD_SHA}-snapshot-5898853`,
      `${BASE_SHA}-snapshot-12`,
    );

    expect(context.commitSha).toBe(HEAD_SHA);
    expect(context.baseCommitSha).toBe(BASE_SHA);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    "--output=/tmp/x",
    `${HEAD_SHA};touch /tmp/x`,
    `${HEAD_SHA}-unclean`,
    "none",
    "--output=x-snapshot-1",
    `${HEAD_SHA}-snapshot-abc`,
  ])("drops the invalid commit SHA %j and says so", async (sha) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const context = await resolveWithShas(sha, sha);

    expect(context.commitSha).toBeUndefined();
    expect(context.baseCommitSha).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(JSON.stringify(sha)),
    );
  });

  it.each(["unknown", "experiment"])(
    "drops the sentinel commit SHA %j without warning",
    async (sha) => {
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      const context = await resolveWithShas(sha, sha);

      expect(context.commitSha).toBeUndefined();
      expect(context.baseCommitSha).toBeUndefined();
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it("treats an empty commit SHA as absent without warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const context = await resolveWithShas("", "");

    expect(context.commitSha).toBeUndefined();
    expect(context.baseCommitSha).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("resolveDebugContext from two replay IDs", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  const resolveReplays = (sessionIds: Record<string, string>) =>
    resolveDebugContext({
      client: {
        get: vi.fn((url: string) => {
          const id = url.split("/").pop() ?? "";
          return Promise.resolve({
            data: { id, sessionId: sessionIds[id], projectId: "p" },
          });
        }),
      } as unknown as MeticulousClient,
      replayDiffId: undefined,
      replayIds: Object.keys(sessionIds),
      sessionId: undefined,
      screenshot: undefined,
    });

  it("accepts a patched copy of the same session without warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const context = await resolveReplays({
      head: "session_p1704825600000",
      base: "session",
    });

    expect(context.replayIds).toEqual(["head", "base"]);
    expect(context.sessionIds).toEqual(["session_p1704825600000", "session"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns, rather than exits, when the replays replayed different sessions", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const context = await resolveReplays({ head: "s1", base: "s2" });

    expect(context.sessionIds).toEqual(["s1", "s2"]);
    expect(warn).toHaveBeenCalledOnce();
  });
});
