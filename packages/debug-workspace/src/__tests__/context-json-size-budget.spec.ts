import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeInvestigationFocus,
  MAX_FOCUS_SCREENSHOTS,
} from "../compute-investigation-focus";
import { DEBUG_DATA_DIRECTORY } from "../debug-constants";
import type { DebugContext } from "../debug.types";
import {
  defaultWriteContextJson,
  type ScreenshotMapEntry,
} from "../generate-debug-workspace";

/**
 * Regression test: the inline portion of `context.json` (the bit fed into the
 * agent's SessionStart context, excluding sidecar bodies on disk) must stay
 * bounded as the workspace scales -- that's the whole point of this work.
 */
describe("context.json size budget", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "met-budget-"));
    mkdirSync(join(workspace, DEBUG_DATA_DIRECTORY), { recursive: true });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("keeps inline context.json bounded with many replays + screenshots", () => {
    const debugContext = makeDebugContext({ replayDiffIds: 5 });
    const screenshotMap = makeLargeScreenshotMap({
      replayDiffs: debugContext.replayDiffs,
      screenshotsPerReplay: 200,
    });
    expect(Object.keys(screenshotMap).length).toBe(2000);

    for (const diff of debugContext.replayDiffs) {
      writeDiffJson(workspace, diff.id, 60);
    }

    runWorkspaceGeneration(workspace, debugContext, screenshotMap);

    const ctx = readContextJson(workspace);
    expect(ctx.investigationFocus.kind).toBe("replay-diff");
    expect(ctx.investigationFocus.totalDiffingScreenshots).toBe(300);
    expect(ctx.investigationFocus.primaryScreenshots).toHaveLength(
      MAX_FOCUS_SCREENSHOTS,
    );
    // Inline screenshotMap is filtered to focus -- 2 entries per primary at most.
    expect(Object.keys(ctx.screenshotMap).length).toBeLessThanOrEqual(
      MAX_FOCUS_SCREENSHOTS * 2,
    );

    const inlineBytes = Buffer.byteLength(
      readFileSync(join(workspace, DEBUG_DATA_DIRECTORY, "context.json")),
    );
    expect(inlineBytes).toBeLessThan(50_000);

    // Sidecar holds the full unfiltered map.
    const sidecar = JSON.parse(
      readFileSync(
        join(workspace, DEBUG_DATA_DIRECTORY, "screenshot-index.json"),
        "utf-8",
      ),
    );
    expect(Object.keys(sidecar).length).toBe(2000);
  });

  it("inlines just the targeted entry in --screenshot mode", () => {
    const debugContext = makeDebugContext({
      replayDiffIds: 1,
      screenshot: "screenshot-after-event-00050.png",
    });
    const screenshotMap = makeLargeScreenshotMap({
      replayDiffs: debugContext.replayDiffs,
      screenshotsPerReplay: 200,
    });
    writeDiffJson(workspace, debugContext.replayDiffs[0].id, 0);

    runWorkspaceGeneration(workspace, debugContext, screenshotMap);

    const ctx = readContextJson(workspace);
    expect(ctx.investigationFocus.kind).toBe("screenshot");
    expect(ctx.investigationFocus.primaryScreenshots).toHaveLength(1);
    expect(Object.keys(ctx.screenshotMap)).toEqual(
      expect.arrayContaining([
        `head/head-0/screenshot-after-event-00050.png`,
        `base/base-0/screenshot-after-event-00050.png`,
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const runWorkspaceGeneration = (
  workspace: string,
  debugContext: DebugContext,
  screenshotMap: Record<string, ScreenshotMapEntry>,
): void => {
  const focus = computeInvestigationFocus({
    debugContext,
    screenshotMap,
    workspaceDir: workspace,
  });
  // Replicate what generateDebugWorkspace does at the call site, isolated to
  // the bits this size test cares about.
  writeFileSync(
    join(workspace, DEBUG_DATA_DIRECTORY, "screenshot-index.json"),
    JSON.stringify(screenshotMap),
  );
  writeFileSync(
    join(workspace, DEBUG_DATA_DIRECTORY, "dom-diff-index.json"),
    "{}",
  );
  const focusKeys = new Set<string>();
  for (const s of focus.primaryScreenshots) {
    if (s.headReplayId) {
      focusKeys.add(`head/${s.headReplayId}/${s.filename}`);
    }
    if (s.baseReplayId) {
      focusKeys.add(`base/${s.baseReplayId}/${s.filename}`);
    }
  }
  const focusScreenshotMap: Record<string, ScreenshotMapEntry> = {};
  for (const k of focusKeys) {
    if (screenshotMap[k]) {
      focusScreenshotMap[k] = screenshotMap[k];
    }
  }
  defaultWriteContextJson(
    debugContext,
    workspace,
    [],
    undefined,
    focusScreenshotMap,
    { $ref: "screenshot-index.json", count: Object.keys(screenshotMap).length },
    [],
    {},
    { $ref: "dom-diff-index.json", count: 0 },
    focus,
  );
};

const readContextJson = (workspace: string): any =>
  JSON.parse(
    readFileSync(
      join(workspace, DEBUG_DATA_DIRECTORY, "context.json"),
      "utf-8",
    ),
  );

const makeDebugContext = (args: {
  replayDiffIds: number;
  screenshot?: string;
}): DebugContext => {
  const replayDiffs = Array.from({ length: args.replayDiffIds }, (_, i) => ({
    id: `diff-${i}`,
    headReplayId: `head-${i}`,
    baseReplayId: `base-${i}`,
    sessionId: "s",
    numScreenshotDiffs: 0,
  }));
  return {
    orgAndProject: "org/proj",
    testRunId: null,
    testRunStatus: null,
    commitSha: null,
    baseCommitSha: null,
    sessionIds: [],
    replayIds: replayDiffs.flatMap((d) => [d.headReplayId, d.baseReplayId]),
    replayDiffs,
    screenshot: args.screenshot,
  } as unknown as DebugContext;
};

const makeLargeScreenshotMap = (args: {
  replayDiffs: Array<{ headReplayId: string; baseReplayId: string }>;
  screenshotsPerReplay: number;
}): Record<string, ScreenshotMapEntry> => {
  const map: Record<string, ScreenshotMapEntry> = {};
  for (const pair of args.replayDiffs) {
    for (let n = 0; n < args.screenshotsPerReplay; n++) {
      const filename = `screenshot-after-event-${n.toString().padStart(5, "0")}.png`;
      map[`head/${pair.headReplayId}/${filename}`] = entry(
        pair.headReplayId,
        "head",
        n,
        filename,
      );
      map[`base/${pair.baseReplayId}/${filename}`] = entry(
        pair.baseReplayId,
        "base",
        n,
        filename,
      );
    }
  }
  return map;
};

const entry = (
  replayId: string,
  role: string,
  n: number,
  filename: string,
): ScreenshotMapEntry => ({
  replayId,
  replayRole: role,
  filename,
  virtualTimeStart: n * 100,
  virtualTimeEnd: n * 100 + 50,
  eventNumber: n,
  htmlFilename: null,
  afterHtmlFilename: null,
});

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
      identifier: { type: "after-event", eventNumber: i },
      outcome: "pixel-diff",
      diffToBaseScreenshot: {
        mismatchPixels: 100 + i,
        mismatchFraction: (100 + i) / 100_000,
      },
    }),
  );
  writeFileSync(
    join(dir, `${replayDiffId}.json`),
    JSON.stringify({ data: { screenshotDiffResults } }),
  );
};
