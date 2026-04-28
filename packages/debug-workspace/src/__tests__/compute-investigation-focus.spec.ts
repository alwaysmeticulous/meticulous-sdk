import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeInvestigationFocus,
  MAX_FOCUS_SCREENSHOTS,
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

  it("returns kind=other with empty focus when no diff and no screenshot", () => {
    const focus = computeInvestigationFocus({
      debugContext: makeDebugContext({ replayIds: ["r1", "r2"] }),
      screenshotMap: {},
      workspaceDir: workspace,
    });
    expect(focus).toEqual({
      kind: "other",
      primaryScreenshots: [],
      primaryEventNumbers: [],
      primaryVtRange: null,
      totalDiffingScreenshots: 0,
    });
  });

  it("anchors on the targeted screenshot in screenshot mode", () => {
    const filename = "screenshot-after-event-00010.png";
    const screenshotMap = {
      [`head/h1/${filename}`]: makeScreenshotEntry({
        replayId: "h1",
        replayRole: "head",
        filename,
        eventNumber: 10,
        virtualTimeStart: 1234,
      }),
      [`base/b1/${filename}`]: makeScreenshotEntry({
        replayId: "b1",
        replayRole: "base",
        filename,
        eventNumber: 10,
        virtualTimeStart: 1200,
      }),
    };
    const focus = computeInvestigationFocus({
      debugContext: makeDebugContext({
        screenshot: filename,
        replayDiffs: [{ id: "d1", headReplayId: "h1", baseReplayId: "b1" }],
      }),
      screenshotMap,
      workspaceDir: workspace,
    });
    expect(focus.kind).toBe("screenshot");
    expect(focus.primaryScreenshots).toHaveLength(1);
    expect(focus.primaryScreenshots[0]).toMatchObject({
      filename,
      eventNumber: 10,
      headReplayId: "h1",
      baseReplayId: "b1",
    });
    expect(focus.primaryVtRange).toEqual({ start: 1200, end: 1234 });
  });

  it("collects diverging screenshots in replay-diff mode and skips no-diff entries", () => {
    writeDiffFile(workspace, "diff1", [
      makeDiffResult({ eventNumber: 5, mismatchPixels: 100 }),
      makeDiffResult({ eventNumber: 7, mismatchPixels: 0, outcome: "no-diff" }),
      makeDiffResult({ eventNumber: 9, mismatchPixels: 50 }),
    ]);
    const screenshotMap = {
      ...mapEntry("h1", "head", 5, 5000),
      ...mapEntry("b1", "base", 5, 5000),
      ...mapEntry("h1", "head", 9, 9000),
      ...mapEntry("b1", "base", 9, 9000),
    };
    const focus = computeInvestigationFocus({
      debugContext: makeDebugContext({
        replayDiffs: [{ id: "diff1", headReplayId: "h1", baseReplayId: "b1" }],
      }),
      screenshotMap,
      workspaceDir: workspace,
    });
    expect(focus.kind).toBe("replay-diff");
    expect(focus.totalDiffingScreenshots).toBe(2);
    expect(focus.primaryEventNumbers).toEqual([5, 9]);
    expect(focus.primaryVtRange).toEqual({ start: 5000, end: 9000 });
  });

  it("treats non-no-diff outcomes (e.g. missing-base-screenshot) as diffing", () => {
    writeDiffFile(workspace, "diff1", [
      makeDiffResult({
        eventNumber: 3,
        mismatchPixels: 0,
        outcome: "missing-base-screenshot",
      }),
    ]);
    const screenshotMap = mapEntry("h1", "head", 3, 3000);
    const focus = computeInvestigationFocus({
      debugContext: makeDebugContext({
        replayDiffs: [{ id: "diff1", headReplayId: "h1", baseReplayId: "b1" }],
      }),
      screenshotMap,
      workspaceDir: workspace,
    });
    expect(focus.totalDiffingScreenshots).toBe(1);
    expect(focus.primaryEventNumbers).toEqual([3]);
  });

  it(`caps primaryScreenshots at ${MAX_FOCUS_SCREENSHOTS} but reports the true total`, () => {
    const total = MAX_FOCUS_SCREENSHOTS + 5;
    const results = Array.from({ length: total }, (_, i) =>
      makeDiffResult({ eventNumber: i, mismatchPixels: 1 + i }),
    );
    writeDiffFile(workspace, "diff1", results);
    const screenshotMap: Record<string, ScreenshotMapEntry> = {};
    for (let i = 0; i < total; i++) {
      Object.assign(screenshotMap, mapEntry("h1", "head", i, i * 100));
      Object.assign(screenshotMap, mapEntry("b1", "base", i, i * 100));
    }
    const focus = computeInvestigationFocus({
      debugContext: makeDebugContext({
        replayDiffs: [{ id: "diff1", headReplayId: "h1", baseReplayId: "b1" }],
      }),
      screenshotMap,
      workspaceDir: workspace,
    });
    expect(focus.totalDiffingScreenshots).toBe(total);
    expect(focus.primaryScreenshots).toHaveLength(MAX_FOCUS_SCREENSHOTS);
    // Sorted by mismatch desc -- the highest event numbers (which had the
    // largest mismatchPixels) should win.
    expect(focus.primaryScreenshots[0].eventNumber).toBe(total - 1);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DebugContextOverrides {
  replayIds?: string[];
  replayDiffs?: Array<{
    id: string;
    headReplayId: string;
    baseReplayId: string;
  }>;
  screenshot?: string;
}

const makeDebugContext = (
  overrides: DebugContextOverrides = {},
): DebugContext =>
  ({
    orgAndProject: "org/proj",
    testRunId: null,
    testRunStatus: null,
    commitSha: null,
    baseCommitSha: null,
    sessionIds: [],
    replayIds: overrides.replayIds ?? [],
    replayDiffs: (overrides.replayDiffs ?? []).map((d) => ({
      ...d,
      sessionId: "s",
      numScreenshotDiffs: 1,
    })),
    screenshot: overrides.screenshot,
  }) as unknown as DebugContext;

const makeScreenshotEntry = (
  overrides: Partial<ScreenshotMapEntry> & {
    replayId: string;
    filename: string;
  },
): ScreenshotMapEntry => ({
  replayId: overrides.replayId,
  replayRole: overrides.replayRole ?? "head",
  filename: overrides.filename,
  virtualTimeStart: overrides.virtualTimeStart ?? null,
  virtualTimeEnd: overrides.virtualTimeEnd ?? null,
  eventNumber: overrides.eventNumber ?? null,
  htmlFilename: null,
  afterHtmlFilename: null,
});

const mapEntry = (
  replayId: string,
  role: "head" | "base",
  eventNumber: number,
  vt: number,
): Record<string, ScreenshotMapEntry> => {
  const filename = `screenshot-after-event-${String(eventNumber).padStart(5, "0")}.png`;
  return {
    [`${role}/${replayId}/${filename}`]: makeScreenshotEntry({
      replayId,
      replayRole: role,
      filename,
      eventNumber,
      virtualTimeStart: vt,
    }),
  };
};

const writeDiffFile = (
  workspaceDir: string,
  diffId: string,
  results: Record<string, unknown>[],
): void => {
  const diffsDir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "diffs");
  mkdirSync(diffsDir, { recursive: true });
  writeFileSync(
    join(diffsDir, `${diffId}.json`),
    JSON.stringify({ data: { screenshotDiffResults: results } }),
  );
};

const makeDiffResult = (opts: {
  eventNumber: number;
  mismatchPixels: number;
  outcome?: string;
}): Record<string, unknown> => ({
  identifier: { type: "after-event", eventNumber: opts.eventNumber },
  outcome: opts.outcome ?? (opts.mismatchPixels > 0 ? "diff" : "no-diff"),
  diffToBaseScreenshot: {
    mismatchPixels: opts.mismatchPixels,
    mismatchFraction: opts.mismatchPixels / 1_000_000,
  },
});
