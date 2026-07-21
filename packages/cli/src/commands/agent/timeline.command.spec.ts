import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timelineDiffCommand } from "./timeline.command";

// Make wrapHandler a passthrough so handler errors propagate directly to tests
// rather than being swallowed by process.exit().
vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getTimelineDiff: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => loggerMock,
}));

vi.mock("@alwaysmeticulous/client", () => ({
  createClientWithOAuth: mocks.createClientWithOAuth,
  getTimelineDiff: mocks.getTimelineDiff,
}));

const runHandler = (args: { json?: boolean } = {}) =>
  (
    timelineDiffCommand as { handler: (args: unknown) => Promise<void> }
  ).handler({
    replayDiffId: "rd-1",
    json: false,
    ...args,
  });

let logSpy: ReturnType<typeof vi.spyOn>;
const stdoutText = () => logSpy.mock.calls.flat().join("\n");

const ENTRIES = [
  { status: "identical", timeMs: 0, eventKind: "click", description: "a" },
  { status: "changed", timeMs: 10, eventKind: "nav", description: "b" },
  { status: "added", timeMs: 20, eventKind: "type", description: "c" },
  { status: "removed", timeMs: 30, eventKind: "scroll", description: "d" },
];

describe("timeline-diff command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getTimelineDiff.mockResolvedValue({ entries: ENTRIES });
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("emits JSON carrying the status enum in `diff` and the mapped fields", async () => {
    await runHandler({ json: true });

    expect(JSON.parse(stdoutText())).toEqual([
      { diff: "identical", timeMs: 0, event: "click", description: "a" },
      { diff: "changed", timeMs: 10, event: "nav", description: "b" },
      { diff: "added", timeMs: 20, event: "type", description: "c" },
      { diff: "removed", timeMs: 30, event: "scroll", description: "d" },
    ]);
  });

  it("emits a TSV header and one row per entry, using the compact prefix symbol", async () => {
    await runHandler({ json: false });

    const lines = stdoutText().split("\n");
    expect(lines[0]).toBe(
      ["diff", "timeMs", "event", "description"].join("\t"),
    );
    // The TSV `diff` column keeps a compact prefix symbol (unlike the JSON enum).
    expect(lines[1]).toBe([" ", 0, "click", "a"].join("\t"));
    expect(lines[2]).toBe(["!", 10, "nav", "b"].join("\t"));
  });

  it("emits an empty JSON array (not a message) when there are no entries", async () => {
    mocks.getTimelineDiff.mockResolvedValue({ entries: [] });

    await runHandler({ json: true });

    // A table-shaped command always emits valid JSON on stdout — [] when empty.
    expect(JSON.parse(stdoutText())).toEqual([]);
  });
});
