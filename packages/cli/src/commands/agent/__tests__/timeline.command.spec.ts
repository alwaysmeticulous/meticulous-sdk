import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Options as YargsOptions } from "yargs";
import { timelineCommand } from "../timeline.command";

// Make wrapHandler a passthrough so handler errors propagate directly to tests.
vi.mock("../../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getReplayTimeline: vi.fn(),
  logNotice: vi.fn(),
}));

vi.mock("@alwaysmeticulous/common", () => ({
  initLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logNotice: mocks.logNotice,
  logProgress: vi.fn(),
}));

vi.mock("@alwaysmeticulous/client", () => ({
  createClientWithOAuth: mocks.createClientWithOAuth,
  getReplayTimeline: mocks.getReplayTimeline,
  MAX_TIMELINE_LIMIT: 1000,
  TIMELINE_DISPLAY_KINDS: ["user", "network", "screenshot"],
}));

const runHandler = (args: Record<string, unknown> = {}) =>
  (timelineCommand as { handler: (args: unknown) => Promise<void> }).handler({
    replayId: "r-1",
    json: false,
    ...args,
  });

let logSpy: ReturnType<typeof vi.spyOn>;
const stdoutLines = () => logSpy.mock.calls.flat();

const RESPONSE = {
  notes: [
    "2 filtered events (of 9 total); replay r-1",
    "rows 1-2 of 5; use --offset and/or --limit to view more",
  ],
  entries: [
    {
      timeMs: 0,
      kind: "screenshot",
      eventId: "after-event-0",
    },
    {
      timeMs: 15,
      kind: "user",
      eventId: "user:1",
      description: 'click on (conf: 0.92) button "Save"',
      count: 3,
    },
  ],
};

describe("timeline command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getReplayTimeline.mockResolvedValue(RESPONSE);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("prints a TSV whose headers are the --json keys, with the notes on stderr", async () => {
    await runHandler({});

    expect(stdoutLines()).toEqual([
      "eventId\ttimeMs\tkind\tdescription\tcount",
      "after-event-0\t0\tscreenshot\t\t",
      'user:1\t15\tuser\tclick on (conf: 0.92) button "Save"\t3',
    ]);
    expect(mocks.logNotice.mock.calls.flat()).toEqual(RESPONSE.notes);
  });

  // The same bare row list get_timeline returns.
  it("prints the bare rows under --json, still with the notes on stderr", async () => {
    await runHandler({ json: true });

    expect(JSON.parse(stdoutLines().join("\n"))).toEqual(RESPONSE.entries);
    expect(mocks.logNotice.mock.calls.flat()).toEqual(RESPONSE.notes);
  });

  it("forwards the filters and page to the client", async () => {
    await runHandler({
      kinds: "user,network",
      sinceMs: 10,
      screenshotName: "end-state",
      limit: 20,
      offset: 40,
    });

    expect(mocks.getReplayTimeline).toHaveBeenCalledWith(
      {},
      "r-1",
      expect.objectContaining({
        kinds: ["user", "network"],
        sinceMs: 10,
        screenshotName: "end-state",
        limit: 20,
        offset: 40,
      }),
    );
  });

  it.each([0, 1001, 2.5])("rejects --limit=%s", (limit) => {
    const { limit: option } = timelineCommand.builder as Record<
      string,
      YargsOptions
    >;

    expect(() => option.coerce?.(limit)).toThrow(
      "--limit must be an integer between 1 and 1000.",
    );
  });

  it("fails once, without polling, on an unfinished replay", async () => {
    const refusal = new Error(
      "Replay r-1 is still Running; its timeline is available once it has finished.",
    );
    mocks.getReplayTimeline.mockRejectedValue(refusal);

    await expect(runHandler({ json: true })).rejects.toBe(refusal);

    expect(mocks.getReplayTimeline).toHaveBeenCalledTimes(1);
    expect(stdoutLines()).toEqual([]);
  });
});
