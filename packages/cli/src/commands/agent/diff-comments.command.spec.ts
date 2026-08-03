import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeJson } from "@alwaysmeticulous/common/json";
import { diffCommentsCommand } from "./diff-comments.command";

vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getDiffComments: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({ initLogger: vi.fn() }));
vi.mock("@alwaysmeticulous/client", () => ({
  createClientWithOAuth: mocks.createClientWithOAuth,
  getDiffComments: mocks.getDiffComments,
}));

const runHandler = (json: boolean, includeResolved = false) =>
  (
    diffCommentsCommand as { handler: (args: unknown) => Promise<void> }
  ).handler({
    replayDiffId: "rd-1",
    screenshotName: "after-event-5",
    includeResolved,
    json,
  });

const comments = [
  {
    id: "comment-1",
    x: 0.25,
    y: 0.5,
    text: "first\tline\nsecond line",
    author: "Ada Lovelace",
    replies: [
      {
        id: "reply-1",
        author: "Grace Hopper",
        text: "first reply",
      },
      {
        id: "reply-2",
        text: "second reply",
      },
    ],
  },
  {
    id: "comment-2",
    x: 0.75,
    y: 0.8,
    text: "second comment",
    replies: [],
  },
];

describe("diff-comments command", () => {
  let logSpy: {
    mock: { calls: unknown[][] };
    mockRestore: () => void;
  };
  const stdoutText = (): string =>
    logSpy.mock.calls.map(([value]) => String(value)).join("\n");
  const stdoutBytes = (): string =>
    logSpy.mock.calls.map(([value]) => `${String(value)}\n`).join("");

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getDiffComments.mockResolvedValue(comments);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => logSpy.mockRestore());

  it("emits JSON byte-identical to the MCP tool result", async () => {
    await runHandler(true);

    expect(stdoutBytes()).toBe(`${serializeJson(comments)}\n`);
    expect(mocks.getDiffComments).toHaveBeenCalledWith(
      expect.anything(),
      "rd-1",
      "after-event-5",
      { includeResolved: false },
    );
  });

  it("flattens each comment followed by its replies in oldest-first order", async () => {
    await runHandler(false);

    const lines = stdoutText().split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe(
      ["id", "replyToCommentId", "author", "text", "x", "y"].join("\t"),
    );
    expect(lines[1].split("\t")).toEqual([
      "comment-1",
      "",
      "Ada Lovelace",
      '"first\\tline\\nsecond line"',
      "0.25000",
      "0.50000",
    ]);
    expect(lines.slice(1).map((line) => line.split("\t")[0])).toEqual([
      "comment-1",
      "reply-1",
      "reply-2",
      "comment-2",
    ]);
    expect(lines[2].split("\t")).toEqual([
      "reply-1",
      "comment-1",
      "Grace Hopper",
      '"first reply"',
      "0.25000",
      "0.50000",
    ]);
    expect(lines[3].split("\t")).toEqual([
      "reply-2",
      "comment-1",
      "",
      '"second reply"',
      "0.25000",
      "0.50000",
    ]);
  });

  it("adds resolved comments and the isResolved column only when requested", async () => {
    mocks.getDiffComments.mockResolvedValue(
      comments.map((comment, index) => ({
        ...comment,
        isResolved: index === 0,
      })),
    );

    await runHandler(false, true);

    const lines = stdoutText().split("\n");
    expect(lines[0]).toBe(
      ["id", "replyToCommentId", "author", "text", "x", "y", "isResolved"].join(
        "\t",
      ),
    );
    expect(lines.slice(1).map((line) => line.split("\t").at(-1))).toEqual([
      "true",
      "true",
      "true",
      "false",
    ]);
    expect(mocks.getDiffComments).toHaveBeenCalledWith(
      expect.anything(),
      "rd-1",
      "after-event-5",
      { includeResolved: true },
    );
  });

  it("emits a header-only table when there are no comments", async () => {
    mocks.getDiffComments.mockResolvedValue([]);

    await runHandler(false);

    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
