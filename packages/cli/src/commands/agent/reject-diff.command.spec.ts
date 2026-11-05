import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeJson } from "@alwaysmeticulous/common/json";
import { rejectDiffCommand } from "./reject-diff.command";

vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  rejectDiff: vi.fn(),
  reviewDiffs: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({ initLogger: vi.fn() }));
vi.mock("@alwaysmeticulous/client", () => ({
  MAX_AGENT_DIFF_DECISION_BATCH_SIZE: 100,
  createClientWithOAuth: mocks.createClientWithOAuth,
  rejectDiff: mocks.rejectDiff,
  reviewDiffs: mocks.reviewDiffs,
}));

const run = (args: Record<string, unknown>) =>
  (rejectDiffCommand as { handler: (args: unknown) => Promise<void> }).handler({
    json: false,
    ...args,
  });

const SINGLE_DIFF = {
  replayDiffId: "rd-1",
  screenshotName: "end-state",
  reason: "The total is wrong",
  x: 0.4,
  y: 0.6,
};

const BATCH = [
  { ...SINGLE_DIFF },
  { ...SINGLE_DIFF, screenshotName: "after-event-3", reason: "Also wrong" },
];

describe("reject-diff command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.rejectDiff.mockResolvedValue({ commentId: "comment-1" });
    mocks.reviewDiffs.mockResolvedValue([
      { replayDiffId: "rd-1", screenshotName: "end-state", commentId: "c-1" },
      {
        replayDiffId: "rd-1",
        screenshotName: "after-event-3",
        commentId: "c-2",
      },
    ]);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => logSpy.mockRestore());

  it.each(["x", "y", "reason"])(
    "requires --%s for a single diff",
    async (option) => {
      await expect(
        run({ ...SINGLE_DIFF, [option]: undefined }),
      ).rejects.toThrow(`Missing required argument: ${option}`);
      expect(mocks.rejectDiff).not.toHaveBeenCalled();
    },
  );

  it("records the agent rejection and outputs the comment it wrote", async () => {
    await run(SINGLE_DIFF);

    expect(mocks.rejectDiff).toHaveBeenCalledWith({
      client: expect.anything(),
      ...SINGLE_DIFF,
    });
    expect(logSpy).toHaveBeenCalledWith("comment-1");
  });

  it("emits the same object as MCP with --json", async () => {
    await run({ ...SINGLE_DIFF, json: true });

    expect(logSpy).toHaveBeenCalledOnce();
    expect(`${String(logSpy.mock.calls[0][0])}\n`).toBe(
      `${serializeJson({ commentId: "comment-1" })}\n`,
    );
  });

  it("rejects every diff of --diffs in one call, outputting a row per diff", async () => {
    await run({ diffs: JSON.stringify(BATCH) });

    expect(mocks.reviewDiffs).toHaveBeenCalledWith({
      client: expect.anything(),
      verdict: "reject",
      diffs: BATCH,
    });
    expect(mocks.rejectDiff).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.map(([line]: unknown[]) => line)).toEqual([
      "replayDiffId\tscreenshotName\tcommentId",
      "rd-1\tend-state\tc-1",
      "rd-1\tafter-event-3\tc-2",
    ]);
  });

  it("emits the same list as MCP for --diffs with --json", async () => {
    await run({ diffs: JSON.stringify(BATCH), json: true });

    expect(`${String(logSpy.mock.calls[0][0])}\n`).toBe(
      `${serializeJson(await mocks.reviewDiffs.mock.results[0].value)}\n`,
    );
  });

  it.each([
    [
      "a single diff's options",
      { diffs: "[]", replayDiffId: "rd-1" },
      "cannot be combined with --replayDiffId",
    ],
    ["invalid JSON", { diffs: "[{" }, "not valid JSON"],
    [
      "a non-array",
      { diffs: '{"replayDiffId":"rd-1"}' },
      "JSON array of objects",
    ],
  ])("refuses --diffs with %s", async (_label, args, message) => {
    await expect(run(args)).rejects.toThrow(message);
    expect(mocks.reviewDiffs).not.toHaveBeenCalled();
  });
});
