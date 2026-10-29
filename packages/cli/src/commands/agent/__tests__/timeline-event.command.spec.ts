import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timelineEventDiffCommand } from "../timeline-event-diff.command";
import { timelineEventCommand } from "../timeline-event.command";

// Make wrapHandler a passthrough so handler errors propagate directly to tests.
vi.mock("../../../command-utils/sentry.utils", () => ({
  wrapHandler: (fn: (...args: unknown[]) => Promise<void>) => fn,
}));

const mocks = vi.hoisted(() => ({
  createClientWithOAuth: vi.fn(),
  getTimelineEvent: vi.fn(),
  getTimelineEventDiff: vi.fn(),
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
  getTimelineEvent: mocks.getTimelineEvent,
  getTimelineEventDiff: mocks.getTimelineEventDiff,
  MAX_TIMELINE_LIMIT: 1000,
  TIMELINE_DISPLAY_KINDS: ["user", "network", "screenshot"],
}));

type Handler = { handler: (args: unknown) => Promise<void> };

const runEvent = (args: Record<string, unknown> = {}) =>
  (timelineEventCommand as Handler).handler({
    replayId: "r-1",
    eventId: "after-event-0",
    json: false,
    ...args,
  });

const runEventDiff = (args: Record<string, unknown> = {}) =>
  (timelineEventDiffCommand as Handler).handler({
    replayDiffId: "rd-1",
    eventId: "after-event-0",
    json: false,
    ...args,
  });

let logSpy: ReturnType<typeof vi.spyOn>;
const stdoutLines = () => logSpy.mock.calls.flat();

const SCREENSHOT = {
  eventId: "after-event-0",
  timeMs: 0,
  kind: "screenshot",
  entryKind: "screenshot",
  screenshot: { screenshotName: "after-event-0", mismatchFraction: 0.25 },
};

describe("timeline-event commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClientWithOAuth.mockResolvedValue({});
    mocks.getTimelineEvent.mockResolvedValue(SCREENSHOT);
    mocks.getTimelineEventDiff.mockResolvedValue({
      eventId: "after-event-0",
      fields: [{ diff: "changed", field: "timeMs", base: 0, head: 40 }],
    });
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("timeline-event prints one line per field, keyed by its --json path", async () => {
    await runEvent();

    expect(stdoutLines()).toEqual([
      "eventId:\tafter-event-0",
      "timeMs:\t0",
      "kind:\tscreenshot",
      "entryKind:\tscreenshot",
      "screenshot.screenshotName:\tafter-event-0",
      "screenshot.mismatchFraction:\t0.250",
    ]);
  });

  it("timeline-event prints the response as is under --json", async () => {
    await runEvent({ json: true });

    expect(JSON.parse(stdoutLines().join("\n"))).toEqual(SCREENSHOT);
  });

  it("timeline-event-diff marks the fields that differ", async () => {
    await runEventDiff();

    expect(stdoutLines()).toEqual([
      "eventId:\tafter-event-0",
      "! timeMs:\t0 -> 40",
    ]);
  });

  it.each([
    ["timeline-event", runEvent, mocks.getTimelineEvent],
    ["timeline-event-diff", runEventDiff, mocks.getTimelineEventDiff],
  ])(
    "%s fails once, without polling, on an unfinished replay",
    async (_name, run, getter) => {
      const refusal = new Error(
        "Replay r-1 is still Running; its timeline is available once it has finished.",
      );
      getter.mockRejectedValue(refusal);

      await expect(run({ json: true })).rejects.toBe(refusal);

      expect(getter).toHaveBeenCalledTimes(1);
      expect(stdoutLines()).toEqual([]);
    },
  );
});
