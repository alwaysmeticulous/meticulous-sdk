import type { MeticulousClient } from "@alwaysmeticulous/client";
import { getReplayDiff } from "@alwaysmeticulous/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDebugContext } from "../resolve-debug-context";

vi.mock("@alwaysmeticulous/client", () => ({
  getReplayDiff: vi.fn(),
  getTestRun: vi.fn(),
}));

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
