import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeInvestigationFocus,
  MAX_FOCUS_SCREENSHOTS,
  NEIGHBOR_EVENT_RADIUS,
} from "../compute-investigation-focus";
import { DEBUG_DATA_DIRECTORY } from "../debug-constants";
import type { DebugContext } from "../debug.types";
import type { ScreenshotMapEntry } from "../generate-debug-workspace";

describe("computeInvestigationFocus", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "met-focus-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // free-form / single-replay
  // -------------------------------------------------------------------------

  it("emits free-form-replays when there is no diff and >1 replay", () => {
    const debugContext = makeDebugContext({
      replayIds: ["r1", "r2"],
    });
    const focus = computeInvestigationFocus({
      debugContext,
      screenshotMap: {},
      workspaceDir: workspace,
    });
    expect(focus).toEqual({
      kind: "free-form-replays",
      primaryScreenshots: [],
      primaryEventNumbers: [],
      primaryVtRange: null,
      totalDiffingScreenshots: 0,
    });
  });

  it("emits single-replay when there is exactly one replay and no diff", () => {
    const debugContext = makeDebugContext({ replayIds: ["only"] });
    const focus = computeInvestigationFocus({
      debugContext,
      screenshotMap: {},
      workspaceDir: workspace,
    });
    expect(focus.kind).toBe("single-replay");
    expect(focus.primaryScreenshots).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // screenshot mode
  // -------------------------------------------------------------------------

  it("returns just the targeted screenshot's head + base entries in screenshot mode", () => {
    const targetFilename = "screenshot-after-event-00010.png";
    const debugContext = makeDebugContext({
      screenshot: targetFilename,
      replayIds: ["head1", "base1"],
      replayDiffs: [
        { id: "diff1", headReplayId: "head1", baseReplayId: "base1" },
      ],
    });

    const screenshotMap: Record<string, ScreenshotMapEntry> = {
      [`head/head1/${targetFilename}`]: makeScreenshotEntry({
        replayId: "head1",
        replayRole: "head",
        filename: targetFilename,
        eventNumber: 10,
        virtualTimeStart: 1234,
      }),
      [`base/base1/${targetFilename}`]: makeScreenshotEntry({
        replayId: "base1",
        replayRole: "base",
        filename: targetFilename,
        eventNumber: 10,
        virtualTimeStart: 1230,
      }),
      [`head/head1/screenshot-after-event-00009.png`]: makeScreenshotEntry({
        replayId: "head1",
        replayRole: "head",
        filename: "screenshot-after-event-00009.png",
        eventNumber: 9,
        virtualTimeStart: 1100,
      }),
    };

    const focus = computeInvestigationFocus({
      debugContext,
      screenshotMap,
      workspaceDir: workspace,
    });

    expect(focus.kind).toBe("screenshot");
    expect(focus.primaryScreenshots).toHaveLength(1);
    expect(focus.primaryScreenshots[0]).toMatchObject({
      filename: targetFilename,
      eventNumber: 10,
      headReplayId: "head1",
      baseReplayId: "base1",
      headVirtualTimeStart: 1234,
      baseVirtualTimeStart: 1230,
      isNeighbor: false,
    });
    expect(focus.primaryEventNumbers).toEqual([10]);
    expect(focus.primaryVtRange).toEqual({ start: 1230, end: 1234 });
  });

  it("returns an orphan focus entry when --screenshot is set but there is no diff", () => {
    const targetFilename = "screenshot-after-event-00005.png";
    const debugContext = makeDebugContext({
      screenshot: targetFilename,
      replayIds: ["only"],
    });
    const screenshotMap: Record<string, ScreenshotMapEntry> = {
      [`other/only/${targetFilename}`]: makeScreenshotEntry({
        replayId: "only",
        replayRole: "other",
        filename: targetFilename,
        eventNumber: 5,
        virtualTimeStart: 500,
      }),
    };

    const focus = computeInvestigationFocus({
      debugContext,
      screenshotMap,
      workspaceDir: workspace,
    });
    expect(focus.kind).toBe("screenshot");
    expect(focus.primaryScreenshots).toHaveLength(1);
    expect(focus.primaryScreenshots[0].filename).toBe(targetFilename);
  });

  // -------------------------------------------------------------------------
  // replay-diff mode
  // -------------------------------------------------------------------------

  it("anchors on diffing screenshots and includes ±2 event-number neighbours", () => {
    const debugContext = makeDebugContext({
      replayIds: ["head1", "base1"],
      replayDiffs: [
        { id: "diff1", headReplayId: "head1", baseReplayId: "base1" },
      ],
    });

    const screenshotMap = makeContiguousScreenshotMap({
      headReplayId: "head1",
      baseReplayId: "base1",
      eventNumbers: [3, 4, 5, 6, 7, 8, 9, 10],
    });

    writeDiffJson(workspace, "diff1", [
      diffResult({
        eventNumber: 6,
        outcome: "pixel-diff",
        mismatchPixels: 100,
        mismatchFraction: 0.0042,
      }),
    ]);

    const focus = computeInvestigationFocus({
      debugContext,
      screenshotMap,
      workspaceDir: workspace,
    });

    expect(focus.kind).toBe("replay-diff");
    expect(focus.totalDiffingScreenshots).toBe(1);
    const filenames = focus.primaryScreenshots.map((s) => s.filename).sort();
    expect(filenames).toEqual([
      "screenshot-after-event-00004.png",
      "screenshot-after-event-00005.png",
      "screenshot-after-event-00006.png",
      "screenshot-after-event-00007.png",
      "screenshot-after-event-00008.png",
    ]);
    const diffEntry = focus.primaryScreenshots.find(
      (s) => s.eventNumber === 6,
    );
    expect(diffEntry?.isNeighbor).toBe(false);
    expect(diffEntry?.mismatchFraction).toBeCloseTo(0.0042);
    expect(diffEntry?.mismatchPercent).toBe("0.4200%");
    expect(
      focus.primaryScreenshots.find((s) => s.eventNumber === 4)?.isNeighbor,
    ).toBe(true);
  });

  it("dedupes neighbours that overlap with other diffing screenshots", () => {
    const debugContext = makeDebugContext({
      replayIds: ["h", "b"],
      replayDiffs: [{ id: "diff1", headReplayId: "h", baseReplayId: "b" }],
    });
    const screenshotMap = makeContiguousScreenshotMap({
      headReplayId: "h",
      baseReplayId: "b",
      eventNumbers: [10, 11, 12, 13, 14],
    });
    writeDiffJson(workspace, "diff1", [
      diffResult({ eventNumber: 11, mismatchPixels: 5, mismatchFraction: 0.001 }),
      diffResult({ eventNumber: 13, mismatchPixels: 3, mismatchFraction: 0.0005 }),
    ]);

    const focus = computeInvestigationFocus({
      debugContext,
      screenshotMap,
      workspaceDir: workspace,
    });

    const eventNumbers = focus.primaryScreenshots
      .map((s) => s.eventNumber)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(eventNumbers).toEqual([10, 11, 12, 13, 14]);
    expect(focus.primaryScreenshots.filter((s) => !s.isNeighbor)).toHaveLength(2);
  });

  it("skips screenshots whose outcome is no-diff and zero mismatchPixels", () => {
    const debugContext = makeDebugContext({
      replayIds: ["h", "b"],
      replayDiffs: [{ id: "diff1", headReplayId: "h", baseReplayId: "b" }],
    });
    const screenshotMap = makeContiguousScreenshotMap({
      headReplayId: "h",
      baseReplayId: "b",
      eventNumbers: [1],
    });
    writeDiffJson(workspace, "diff1", [
      diffResult({ eventNumber: 1, outcome: "no-diff", mismatchPixels: 0 }),
    ]);
    const focus = computeInvestigationFocus({
      debugContext,
      screenshotMap,
      workspaceDir: workspace,
    });
    expect(focus.totalDiffingScreenshots).toBe(0);
    expect(focus.primaryScreenshots).toEqual([]);
  });

  it("includes outcome-only diffs (e.g. missing screenshots) even with no pixel data", () => {
    const debugContext = makeDebugContext({
      replayIds: ["h", "b"],
      replayDiffs: [{ id: "diff1", headReplayId: "h", baseReplayId: "b" }],
    });
    const screenshotMap = makeContiguousScreenshotMap({
      headReplayId: "h",
      baseReplayId: "b",
      eventNumbers: [42],
    });
    writeDiffJson(workspace, "diff1", [
      diffResult({ eventNumber: 42, outcome: "missing-base" }),
    ]);
    const focus = computeInvestigationFocus({
      debugContext,
      screenshotMap,
      workspaceDir: workspace,
    });
    expect(focus.totalDiffingScreenshots).toBe(1);
    expect(focus.primaryScreenshots[0].eventNumber).toBe(42);
  });

  it("caps primaryScreenshots at MAX_FOCUS_SCREENSHOTS, keeping highest-mismatch first", () => {
    const debugContext = makeDebugContext({
      replayIds: ["h", "b"],
      replayDiffs: [{ id: "diff1", headReplayId: "h", baseReplayId: "b" }],
    });

    const eventCount = MAX_FOCUS_SCREENSHOTS + 20;
    const eventNumbers = Array.from({ length: eventCount }, (_, i) => i);
    const screenshotMap = makeContiguousScreenshotMap({
      headReplayId: "h",
      baseReplayId: "b",
      eventNumbers,
    });
    writeDiffJson(
      workspace,
      "diff1",
      eventNumbers.map((n) =>
        diffResult({
          eventNumber: n,
          mismatchPixels: 1 + n,
          mismatchFraction: (1 + n) / 100000,
        }),
      ),
    );

    const focus = computeInvestigationFocus({
      debugContext,
      screenshotMap,
      workspaceDir: workspace,
    });
    expect(focus.totalDiffingScreenshots).toBe(eventCount);
    expect(focus.primaryScreenshots).toHaveLength(MAX_FOCUS_SCREENSHOTS);
    expect(focus.primaryScreenshots.every((s) => !s.isNeighbor)).toBe(true);
    const fractions = focus.primaryScreenshots.map((s) => s.mismatchFraction);
    expect(fractions[0]).toBeGreaterThan(fractions[fractions.length - 1] ?? 0);
  });

  it("keeps NEIGHBOR_EVENT_RADIUS aligned with documented behaviour", () => {
    expect(NEIGHBOR_EVENT_RADIUS).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

interface DebugContextOverrides {
  testRunId?: string | undefined;
  replayDiffs?: Array<{
    id: string;
    headReplayId: string;
    baseReplayId: string;
  }>;
  replayIds?: string[];
  sessionIds?: string[];
  screenshot?: string | undefined;
}

const makeDebugContext = (
  overrides: DebugContextOverrides = {},
): DebugContext => {
  const replayDiffs = (overrides.replayDiffs ?? []).map((d) => ({
    id: d.id,
    headReplayId: d.headReplayId,
    baseReplayId: d.baseReplayId,
    sessionId: undefined,
    numScreenshotDiffs: 0,
  }));
  return {
    testRunId: undefined,
    replayDiffs,
    replayIds: overrides.replayIds ?? [],
    sessionIds: overrides.sessionIds ?? [],
    projectId: undefined,
    orgAndProject: "org/proj",
    commitSha: undefined,
    baseCommitSha: undefined,
    testRunStatus: undefined,
    screenshot: overrides.screenshot,
    meticulousSha: undefined,
    executionSha: undefined,
  };
};

const makeScreenshotEntry = (
  overrides: Partial<ScreenshotMapEntry> & {
    replayId: string;
    replayRole: string;
    filename: string;
  },
): ScreenshotMapEntry => ({
  replayId: overrides.replayId,
  replayRole: overrides.replayRole,
  filename: overrides.filename,
  virtualTimeStart: overrides.virtualTimeStart ?? null,
  virtualTimeEnd: overrides.virtualTimeEnd ?? null,
  eventNumber: overrides.eventNumber ?? null,
  htmlFilename: overrides.htmlFilename ?? null,
  afterHtmlFilename: overrides.afterHtmlFilename ?? null,
});

const makeContiguousScreenshotMap = (args: {
  headReplayId: string;
  baseReplayId: string;
  eventNumbers: number[];
}): Record<string, ScreenshotMapEntry> => {
  const map: Record<string, ScreenshotMapEntry> = {};
  for (const eventNumber of args.eventNumbers) {
    const filename = `screenshot-after-event-${eventNumber.toString().padStart(5, "0")}.png`;
    map[`head/${args.headReplayId}/${filename}`] = makeScreenshotEntry({
      replayId: args.headReplayId,
      replayRole: "head",
      filename,
      eventNumber,
      virtualTimeStart: eventNumber * 100,
    });
    map[`base/${args.baseReplayId}/${filename}`] = makeScreenshotEntry({
      replayId: args.baseReplayId,
      replayRole: "base",
      filename,
      eventNumber,
      virtualTimeStart: eventNumber * 100 - 5,
    });
  }
  return map;
};

const diffResult = (args: {
  eventNumber: number;
  outcome?: string;
  mismatchPixels?: number;
  mismatchFraction?: number;
}) => ({
  identifier: { type: "after-event", eventNumber: args.eventNumber },
  outcome: args.outcome ?? "pixel-diff",
  diffToBaseScreenshot:
    args.mismatchPixels != null || args.mismatchFraction != null
      ? {
          mismatchPixels: args.mismatchPixels ?? 0,
          mismatchFraction: args.mismatchFraction ?? null,
          changedSectionsClassNames: [],
        }
      : undefined,
});

const writeDiffJson = (
  workspaceDir: string,
  replayDiffId: string,
  results: ReturnType<typeof diffResult>[],
): void => {
  const dir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "diffs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${replayDiffId}.json`),
    JSON.stringify({ data: { screenshotDiffResults: results } }, null, 2),
  );
};
