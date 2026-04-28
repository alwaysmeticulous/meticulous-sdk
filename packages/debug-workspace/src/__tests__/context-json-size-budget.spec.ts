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
import { splitMapsForFocus } from "../split-maps-for-focus";

/**
 * Size-budget regression test. The goal of this PR is to keep the inline
 * portion of `context.json` (i.e. the bits that are stuffed into the agent's
 * SessionStart context, excluding sidecar file bodies) under a bounded size
 * regardless of how many screenshots/replays are in the workspace.
 *
 * The numbers below are conservative and aimed at catching regressions, not
 * micro-optimisation. If we ever need to grow them, the test should still
 * assert "bounded" rather than "tight".
 */
describe("context.json size budget", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "met-budget-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("keeps focus-scoped screenshotMap small even with many replays", () => {
    const debugContext = makeDebugContext({
      replayDiffIds: 5,
    });

    const screenshotsPerReplay = 200;
    const screenshotMap = makeLargeScreenshotMap({
      replayDiffs: debugContext.replayDiffs,
      screenshotsPerReplay,
    });
    expect(Object.keys(screenshotMap).length).toBe(
      5 * 2 * screenshotsPerReplay,
    );

    const diffsPerPair = 10;
    for (const diff of debugContext.replayDiffs) {
      writeDiffJson(workspace, diff.id, diffsPerPair);
    }

    const investigationFocus = computeInvestigationFocus({
      debugContext,
      screenshotMap,
      workspaceDir: workspace,
    });

    const split = splitMapsForFocus({
      workspaceDir: workspace,
      screenshotMap,
      domDiffMap: {},
      investigationFocus,
    });

    // Focus is bounded -- diffing entries (50) + a small number of neighbours.
    const nonNeighbours = investigationFocus.primaryScreenshots.filter(
      (s) => !s.isNeighbor,
    );
    expect(nonNeighbours.length).toBeLessThanOrEqual(MAX_FOCUS_SCREENSHOTS);
    expect(investigationFocus.primaryScreenshots.length).toBeLessThanOrEqual(
      MAX_FOCUS_SCREENSHOTS * 2,
    );

    // Focus-scoped map has at most 2 entries per primary screenshot.
    expect(Object.keys(split.focusScreenshotMap).length).toBeLessThanOrEqual(
      investigationFocus.primaryScreenshots.length * 2,
    );

    // Inline JSON budget. Sidecar is on disk (~200KB) but inline must stay small.
    const inlineBytes = Buffer.byteLength(
      JSON.stringify({
        investigationFocus,
        screenshotMap: split.focusScreenshotMap,
        screenshotMapSidecar: { $ref: "screenshot-index.json", count: 2000 },
      }),
      "utf-8",
    );
    expect(inlineBytes).toBeLessThan(50_000);
  });

  it("inlines just the targeted entry when --screenshot pins one screenshot", () => {
    const debugContext = makeDebugContext({
      replayDiffIds: 1,
      screenshot: "screenshot-after-event-00050.png",
    });
    const screenshotMap = makeLargeScreenshotMap({
      replayDiffs: debugContext.replayDiffs,
      screenshotsPerReplay: 200,
    });
    writeDiffJson(workspace, debugContext.replayDiffs[0].id, 10);

    const investigationFocus = computeInvestigationFocus({
      debugContext,
      screenshotMap,
      workspaceDir: workspace,
    });
    const split = splitMapsForFocus({
      workspaceDir: workspace,
      screenshotMap,
      domDiffMap: {},
      investigationFocus,
    });

    expect(investigationFocus.kind).toBe("screenshot");
    expect(investigationFocus.primaryScreenshots).toHaveLength(1);
    expect(Object.keys(split.focusScreenshotMap).length).toBe(2); // head + base
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const makeDebugContext = (args: {
  replayDiffIds: number;
  screenshot?: string;
}): DebugContext => {
  const replayDiffs = Array.from({ length: args.replayDiffIds }, (_, i) => ({
    id: `diff-${i}`,
    headReplayId: `head-${i}`,
    baseReplayId: `base-${i}`,
    sessionId: undefined,
    numScreenshotDiffs: 0,
  }));
  const replayIds = replayDiffs.flatMap((d) => [
    d.headReplayId,
    d.baseReplayId,
  ]);
  return {
    testRunId: undefined,
    replayDiffs,
    replayIds,
    sessionIds: [],
    projectId: undefined,
    orgAndProject: "org/proj",
    commitSha: undefined,
    baseCommitSha: undefined,
    testRunStatus: undefined,
    screenshot: args.screenshot,
    meticulousSha: undefined,
    executionSha: undefined,
  };
};

const makeLargeScreenshotMap = (args: {
  replayDiffs: Array<{ headReplayId: string; baseReplayId: string }>;
  screenshotsPerReplay: number;
}): Record<string, ScreenshotMapEntry> => {
  const map: Record<string, ScreenshotMapEntry> = {};
  for (const pair of args.replayDiffs) {
    for (let n = 0; n < args.screenshotsPerReplay; n++) {
      const filename = `screenshot-after-event-${n.toString().padStart(5, "0")}.png`;
      map[`head/${pair.headReplayId}/${filename}`] = {
        replayId: pair.headReplayId,
        replayRole: "head",
        filename,
        virtualTimeStart: n * 100,
        virtualTimeEnd: n * 100 + 50,
        eventNumber: n,
        htmlFilename: null,
        afterHtmlFilename: null,
      };
      map[`base/${pair.baseReplayId}/${filename}`] = {
        replayId: pair.baseReplayId,
        replayRole: "base",
        filename,
        virtualTimeStart: n * 100,
        virtualTimeEnd: n * 100 + 50,
        eventNumber: n,
        htmlFilename: null,
        afterHtmlFilename: null,
      };
    }
  }
  return map;
};

const writeDiffJson = (
  workspaceDir: string,
  replayDiffId: string,
  diffingCount: number,
): void => {
  const dir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "diffs");
  mkdirSync(dir, { recursive: true });
  const screenshotDiffResults = Array.from(
    { length: diffingCount },
    (_, i) => ({
      identifier: { type: "after-event", eventNumber: 50 + i * 10 },
      outcome: "pixel-diff",
      diffToBaseScreenshot: {
        mismatchPixels: 100 + i,
        mismatchFraction: (100 + i) / 100000,
        changedSectionsClassNames: [],
      },
    }),
  );
  writeFileSync(
    join(dir, `${replayDiffId}.json`),
    JSON.stringify({ data: { screenshotDiffResults } }),
  );
};
