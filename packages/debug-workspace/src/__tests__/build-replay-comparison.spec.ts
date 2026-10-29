import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildReplayComparison } from "../build-replay-comparison";
import { DEBUG_DATA_DIRECTORY } from "../debug-constants";

const entry = (kind: string, virtualTimeStart: number) => ({
  kind,
  virtualTimeStart,
  virtualTimeEnd: virtualTimeStart,
  data: {},
});

describe("buildReplayComparison", () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "replay-comparison-"));
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  const writeReplay = (
    role: string,
    replayId: string,
    entries: unknown[],
    sessionId: string,
  ) => {
    const replayDir = join(
      workspaceDir,
      DEBUG_DATA_DIRECTORY,
      "replays",
      role,
      replayId,
    );
    mkdirSync(replayDir, { recursive: true });
    writeFileSync(
      join(replayDir, "timeline.ndjson"),
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
    writeFileSync(
      join(replayDir, "launchBrowserAndReplayParams.json"),
      JSON.stringify({ session: { id: sessionId } }),
    );
  };

  it("reports each replay's session and counts its timeline entries, stubbed requests and user events", () => {
    writeReplay(
      "head",
      "replay-head",
      [
        entry("initialNavigation", 0),
        entry("pollyReplay", 120),
        entry("jsReplay", 400),
        entry("jsReplay", 900),
        entry("screenshot", 1500.4),
      ],
      "session_p2",
    );
    writeReplay(
      "base",
      "replay-base",
      [
        entry("initialNavigation", 0),
        entry("pollyReplay", 120),
        entry("pollyReplay", 130),
        entry("jsReplay", 400),
      ],
      "session_p1",
    );

    expect(buildReplayComparison(workspaceDir)).toEqual([
      {
        replayId: "replay-head",
        role: "head",
        sessionId: "session_p2",
        totalEvents: 5,
        totalNetworkRequests: 1,
        totalUserEvents: 2,
        totalVirtualTimeMs: 1500,
        screenshotCount: null,
      },
      {
        replayId: "replay-base",
        role: "base",
        sessionId: "session_p1",
        totalEvents: 4,
        totalNetworkRequests: 2,
        totalUserEvents: 1,
        totalVirtualTimeMs: 400,
        screenshotCount: null,
      },
    ]);
  });

  it("counts the entries the timeline dropped past its per-kind cap", () => {
    writeReplay(
      "head",
      "replay-head",
      [
        entry("pollyReplay", 100),
        entry("pollyReplay", 200),
        {
          kind: "timelineEntryLimitReached",
          virtualTimeStart: 300,
          data: { entryKind: "pollyReplay", limit: 2, numOmitted: 40 },
        },
        entry("jsReplay", 400),
      ],
      "session",
    );

    expect(buildReplayComparison(workspaceDir)).toEqual([
      expect.objectContaining({
        totalEvents: 43,
        totalNetworkRequests: 42,
        totalUserEvents: 1,
      }),
    ]);
  });

  it("leaves the session and counts null for a replay without its files", () => {
    mkdirSync(
      join(
        workspaceDir,
        DEBUG_DATA_DIRECTORY,
        "replays",
        "head",
        "replay-head",
      ),
      { recursive: true },
    );

    expect(buildReplayComparison(workspaceDir)).toEqual([
      {
        replayId: "replay-head",
        role: "head",
        sessionId: null,
        totalEvents: null,
        totalNetworkRequests: null,
        totalUserEvents: null,
        totalVirtualTimeMs: null,
        screenshotCount: null,
      },
    ]);
  });
});
