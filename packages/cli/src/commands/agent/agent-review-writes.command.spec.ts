import { serializeJson } from "@alwaysmeticulous/common/json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDiffCommentCommand } from "./create-diff-comment.command";
import { ignoreDiffCommand } from "./ignore-diff.command";
import { replyToDiffCommentCommand } from "./reply-to-diff-comment.command";

vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  createDiffComment: vi.fn(),
  replyToDiffComment: vi.fn(),
  ignoreDiff: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({ initLogger: vi.fn() }));
vi.mock("@alwaysmeticulous/client", () => ({
  createClientWithOAuth: mocks.createClientWithOAuth,
  createDiffComment: mocks.createDiffComment,
  replyToDiffComment: mocks.replyToDiffComment,
  ignoreDiff: mocks.ignoreDiff,
}));

const run = (command: unknown, args: Record<string, unknown>) =>
  (command as { handler: (args: unknown) => Promise<void> }).handler(args);

describe("agent review write commands", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.createDiffComment.mockResolvedValue({ commentId: "comment-1" });
    mocks.replyToDiffComment.mockResolvedValue({ commentId: "reply-1" });
    mocks.ignoreDiff.mockResolvedValue({ commentId: "comment-2" });
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => logSpy.mockRestore());

  it.each([createDiffCommentCommand, ignoreDiffCommand])(
    "requires approximate x and y coordinates",
    (command) => {
      const builder = command.builder as Record<
        string,
        { demandOption?: boolean }
      >;
      expect(builder.x.demandOption).toBe(true);
      expect(builder.y.demandOption).toBe(true);
    },
  );

  it("starts a coordinate-focused comment thread and returns its id", async () => {
    await run(createDiffCommentCommand, {
      replayDiffId: "rd-1",
      screenshotName: "end-state",
      text: "Check the total",
      x: 0.4,
      y: 0.6,
      json: false,
    });

    expect(mocks.createDiffComment).toHaveBeenCalledWith({
      client: expect.anything(),
      replayDiffId: "rd-1",
      screenshotName: "end-state",
      text: "Check the total",
      x: 0.4,
      y: 0.6,
    });
    expect(logSpy).toHaveBeenCalledWith("comment-1");
  });

  it("replies to a thread and emits MCP-identical JSON", async () => {
    await run(replyToDiffCommentCommand, {
      commentId: "comment-1",
      text: "Agreed",
      json: true,
    });

    expect(mocks.replyToDiffComment).toHaveBeenCalledWith({
      client: expect.anything(),
      commentId: "comment-1",
      text: "Agreed",
    });
    expect(`${String(logSpy.mock.calls[0][0])}\n`).toBe(
      `${serializeJson({ commentId: "reply-1" })}\n`,
    );
  });

  it("records an agent ignore and outputs the comment it wrote", async () => {
    await run(ignoreDiffCommand, {
      replayDiffId: "rd-1",
      screenshotName: "end-state",
      reason: "Expected variation",
      x: 0.2,
      y: 0.8,
      json: false,
    });

    expect(mocks.ignoreDiff).toHaveBeenCalledWith({
      client: expect.anything(),
      replayDiffId: "rd-1",
      screenshotName: "end-state",
      reason: "Expected variation",
      x: 0.2,
      y: 0.8,
    });
    expect(logSpy).toHaveBeenCalledWith("comment-2");
  });

  it("emits the ignore comment id as MCP-identical JSON", async () => {
    await run(ignoreDiffCommand, {
      replayDiffId: "rd-1",
      screenshotName: "end-state",
      reason: "Expected variation",
      x: 0.2,
      y: 0.8,
      json: true,
    });

    expect(`${String(logSpy.mock.calls[0][0])}\n`).toBe(
      `${serializeJson({ commentId: "comment-2" })}\n`,
    );
  });
});
