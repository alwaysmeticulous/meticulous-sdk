import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timelineDiffCommand } from "./timeline-diff.command";

// Make wrapHandler a passthrough so handler errors propagate directly to tests.
vi.mock("../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getTimelineDiff: vi.fn(),
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
}));

vi.mock("@alwaysmeticulous/client", () => ({
  createClientWithOAuth: mocks.createClientWithOAuth,
  getTimelineDiff: mocks.getTimelineDiff,
  MAX_TIMELINE_LIMIT: 1000,
  TIMELINE_DISPLAY_KINDS: ["user", "network", "screenshot", "url"],
}));

const runHandler = (args: Record<string, unknown> = {}) =>
  (
    timelineDiffCommand as { handler: (args: unknown) => Promise<void> }
  ).handler({
    replayDiffId: "rd-1",
    json: false,
    ...args,
  });

let logSpy: ReturnType<typeof vi.spyOn>;
const stdoutText = () => logSpy.mock.calls.flat().join("\n");

const RESPONSE = {
  notes: [
    "2 differences across 120 filtered events (of 331 total); base replay base-1, head replay head-1",
  ],
  entries: [
    {
      diff: "identical",
      timeMs: 0,
      kind: "screenshot",
      eventId: "after-event-0",
    },
    {
      diff: "changed",
      timeMs: 10,
      kind: "user",
      eventId: "user:3",
      description: 'pointerdown on (conf: 0.99) button "Save"',
      changes: ["confidence 0.70 -> 0.99", "element button -> a"],
    },
    {
      diff: "added",
      timeMs: 20,
      kind: "network",
      eventId: "head:7",
      description: "POST /graphql (Save) -> 200",
    },
  ],
};

describe("timeline-diff command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getTimelineDiff.mockResolvedValue(RESPONSE);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  // The same bare row list get_timeline_diff returns.
  it("emits the bare entries as JSON, with the notes on stderr", async () => {
    await runHandler({ json: true });

    expect(JSON.parse(stdoutText())).toEqual(RESPONSE.entries);
    expect(mocks.logNotice.mock.calls.flat()).toEqual(RESPONSE.notes);
  });

  it("emits only a TSV table using the compact prefix symbol, with the notes on stderr", async () => {
    await runHandler({ json: false });

    expect(stdoutText().split("\n")).toEqual([
      "diff\teventId\ttimeMs\tkind\tdescription\tcount\tchanges",
      " \tafter-event-0\t0\tscreenshot\t\t\t",
      '!\tuser:3\t10\tuser\tpointerdown on (conf: 0.99) button "Save"\t\tconfidence 0.70 -> 0.99; element button -> a',
      "+\thead:7\t20\tnetwork\tPOST /graphql (Save) -> 200\t\t",
    ]);
    expect(mocks.logNotice.mock.calls.flat()).toEqual(RESPONSE.notes);
  });

  it.each([
    ["user,network", ["user", "network"]],
    ["all", "all"],
  ])(
    "forwards --kinds=%s, the row filters and paging",
    async (kinds, parsed) => {
      await runHandler({
        includeIdenticalEvents: true,
        kinds,
        screenshotName: "after-event-12",
        limit: 50,
        offset: 50,
      });

      expect(mocks.getTimelineDiff).toHaveBeenCalledWith(
        {},
        "rd-1",
        expect.objectContaining({
          includeIdenticalEvents: true,
          kinds: parsed,
          screenshotName: "after-event-12",
          limit: 50,
          offset: 50,
        }),
      );
    },
  );

  it.each([
    ["all,user", /can.t be combined/],
    ["user,bogus", /Unknown event kind/],
  ])("rejects --kinds=%s before calling the backend", async (kinds, error) => {
    await expect(runHandler({ kinds })).rejects.toThrow(error);
    expect(mocks.getTimelineDiff).not.toHaveBeenCalled();
  });

  // A tab or newline would shift every later column of the row.
  it("keeps a multi-line description inside its own TSV column", async () => {
    mocks.getTimelineDiff.mockResolvedValue({
      entries: [
        {
          diff: "changed",
          timeMs: 10,
          kind: "console",
          eventId: "head:2",
          description: "Error: boom\n    at foo\t(bar.ts:1)",
          changes: ["message differs"],
        },
      ],
    });

    await runHandler({ json: false });

    expect(stdoutText().split("\n")[1]).toBe(
      "!\thead:2\t10\tconsole\tError: boom at foo (bar.ts:1)\t\tmessage differs",
    );
  });
});
