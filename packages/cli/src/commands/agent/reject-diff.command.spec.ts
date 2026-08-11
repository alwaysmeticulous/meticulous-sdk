import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeJson } from "@alwaysmeticulous/common/json";
import { rejectDiffCommand } from "./reject-diff.command";

vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  rejectDiff: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({ initLogger: vi.fn() }));
vi.mock("@alwaysmeticulous/client", () => ({
  createClientWithOAuth: mocks.createClientWithOAuth,
  rejectDiff: mocks.rejectDiff,
}));

const runHandler = (json: boolean) =>
  (rejectDiffCommand as { handler: (args: unknown) => Promise<void> }).handler({
    replayDiffId: "rd-1",
    screenshotName: "end-state",
    reason: "The total is wrong",
    x: 0.4,
    y: 0.6,
    json,
  });

describe("reject-diff command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.rejectDiff.mockResolvedValue({ commentId: "comment-1" });
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => logSpy.mockRestore());

  it("requires approximate x and y coordinates", () => {
    const builder = rejectDiffCommand.builder as Record<
      string,
      { demandOption?: boolean }
    >;
    expect(builder.x.demandOption).toBe(true);
    expect(builder.y.demandOption).toBe(true);
  });

  it("records the agent rejection and outputs the comment it wrote", async () => {
    await runHandler(false);

    expect(mocks.rejectDiff).toHaveBeenCalledWith({
      client: expect.anything(),
      replayDiffId: "rd-1",
      screenshotName: "end-state",
      reason: "The total is wrong",
      x: 0.4,
      y: 0.6,
    });
    expect(logSpy).toHaveBeenCalledWith("comment-1");
  });

  it("emits the same object as MCP with --json", async () => {
    await runHandler(true);

    expect(logSpy).toHaveBeenCalledOnce();
    expect(`${String(logSpy.mock.calls[0][0])}\n`).toBe(
      `${serializeJson({ commentId: "comment-1" })}\n`,
    );
  });
});
