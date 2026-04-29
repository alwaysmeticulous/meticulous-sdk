import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import { DebugContext } from "./debug.types";
import type {
  FocusScreenshot,
  InvestigationFocus,
  InvestigationKind,
} from "./focus.types";
import { ScreenshotMapEntry } from "./generate-debug-workspace";
import {
  ScreenshotIdentifier,
  screenshotIdentifierToFilename,
} from "./screenshot-identifier";

/**
 * Hard cap on `primaryScreenshots`. When more diffing screenshots exist, the
 * top-mismatch entries win and `totalDiffingScreenshots` flags the truncation
 * so the agent knows to consult `screenshot-index.json` for the long tail.
 */
export const MAX_FOCUS_SCREENSHOTS = 50;

interface ComputeInvestigationFocusOptions {
  debugContext: DebugContext;
  screenshotMap: Record<string, ScreenshotMapEntry>;
  workspaceDir: string;
}

export const computeInvestigationFocus = (
  options: ComputeInvestigationFocusOptions,
): InvestigationFocus => {
  const { debugContext, screenshotMap, workspaceDir } = options;

  if (debugContext.screenshot) {
    return finalize(
      "screenshot",
      buildScreenshotFocus(debugContext, screenshotMap),
      0,
      screenshotMap,
    );
  }
  if (debugContext.replayDiffs.length > 0) {
    const diffing = collectDiffingScreenshots(debugContext, workspaceDir);
    const primary = diffing
      .map((d) => hydrateDiffFocus(screenshotMap, d))
      .filter((f): f is FocusScreenshot => f !== null);
    primary.sort(byMismatchDesc);
    return finalize(
      "replay-diff",
      primary.slice(0, MAX_FOCUS_SCREENSHOTS),
      diffing.length,
      screenshotMap,
    );
  }
  return finalize("other", [], 0, screenshotMap);
};

// ---------------------------------------------------------------------------
// `screenshot` mode -- look up the targeted screenshot in head + base across
// every replay diff (or as an orphan when there is no diff).
// ---------------------------------------------------------------------------

const buildScreenshotFocus = (
  debugContext: DebugContext,
  screenshotMap: Record<string, ScreenshotMapEntry>,
): FocusScreenshot[] => {
  const target = debugContext.screenshot;
  if (target == null) {
    return [];
  }

  if (debugContext.replayDiffs.length === 0) {
    const orphan = Object.values(screenshotMap).find(
      (e) => e.filename === target,
    );
    return orphan
      ? [
          {
            filename: target,
            eventNumber: orphan.eventNumber,
            headReplayId: orphan.replayRole === "head" ? orphan.replayId : null,
            baseReplayId: orphan.replayRole === "base" ? orphan.replayId : null,
            mismatchFraction: null,
          },
        ]
      : [];
  }

  const focus: FocusScreenshot[] = [];
  for (const diff of debugContext.replayDiffs) {
    const headEntry = screenshotMap[`head/${diff.headReplayId}/${target}`];
    const baseEntry = screenshotMap[`base/${diff.baseReplayId}/${target}`];
    if (!headEntry && !baseEntry) {
      continue;
    }
    focus.push({
      filename: target,
      eventNumber: headEntry?.eventNumber ?? baseEntry?.eventNumber ?? null,
      headReplayId: headEntry ? diff.headReplayId : null,
      baseReplayId: baseEntry ? diff.baseReplayId : null,
      mismatchFraction: null,
    });
  }
  return focus;
};

// ---------------------------------------------------------------------------
// `replay-diff` mode -- read each `diffs/<id>.json` and pull the screenshots
// that actually diverged.
// ---------------------------------------------------------------------------

interface DiffingScreenshot {
  headReplayId: string;
  baseReplayId: string;
  filename: string;
  eventNumber: number | null;
  mismatchFraction: number | null;
}

interface DiffScreenshotResult {
  identifier?: ScreenshotIdentifier;
  outcome?: string;
  diffToBaseScreenshot?: {
    mismatchPixels?: number;
    mismatchFraction?: number;
  };
}

const collectDiffingScreenshots = (
  debugContext: DebugContext,
  workspaceDir: string,
): DiffingScreenshot[] => {
  const out: DiffingScreenshot[] = [];

  for (const diff of debugContext.replayDiffs) {
    const path = join(
      workspaceDir,
      DEBUG_DATA_DIRECTORY,
      "diffs",
      `${diff.id}.json`,
    );
    if (!existsSync(path)) {
      continue;
    }

    let raw: { data?: { screenshotDiffResults?: DiffScreenshotResult[] } };
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      continue;
    }

    for (const result of raw.data?.screenshotDiffResults ?? []) {
      if (!isDiffing(result)) {
        continue;
      }
      const filename = result.identifier
        ? screenshotIdentifierToFilename(result.identifier)
        : undefined;
      if (!filename) {
        continue;
      }
      out.push({
        headReplayId: diff.headReplayId,
        baseReplayId: diff.baseReplayId,
        filename,
        eventNumber: result.identifier?.eventNumber ?? null,
        mismatchFraction: result.diffToBaseScreenshot?.mismatchFraction ?? null,
      });
    }
  }

  return out;
};

/**
 * Diffing = non-zero pixel mismatch OR an outcome that's anything other than
 * `"no-diff"` (catches missing/added/errored screenshots too).
 */
const isDiffing = (result: DiffScreenshotResult): boolean => {
  const pixels = result.diffToBaseScreenshot?.mismatchPixels;
  if (typeof pixels === "number" && pixels > 0) {
    return true;
  }
  const outcome = result.outcome;
  return (
    typeof outcome === "string" && outcome.length > 0 && outcome !== "no-diff"
  );
};

const hydrateDiffFocus = (
  screenshotMap: Record<string, ScreenshotMapEntry>,
  d: DiffingScreenshot,
): FocusScreenshot | null => {
  const headEntry = screenshotMap[`head/${d.headReplayId}/${d.filename}`];
  const baseEntry = screenshotMap[`base/${d.baseReplayId}/${d.filename}`];
  if (!headEntry && !baseEntry) {
    return null;
  }
  return {
    filename: d.filename,
    eventNumber:
      d.eventNumber ?? headEntry?.eventNumber ?? baseEntry?.eventNumber ?? null,
    headReplayId: d.headReplayId,
    baseReplayId: d.baseReplayId,
    mismatchFraction: d.mismatchFraction,
  };
};

const byMismatchDesc = (a: FocusScreenshot, b: FocusScreenshot): number =>
  (b.mismatchFraction ?? 0) - (a.mismatchFraction ?? 0);

// ---------------------------------------------------------------------------
// Final assembly -- derive event numbers and VT range from the screenshotMap.
// ---------------------------------------------------------------------------

const finalize = (
  kind: InvestigationKind,
  primaryScreenshots: FocusScreenshot[],
  totalDiffingScreenshots: number,
  screenshotMap: Record<string, ScreenshotMapEntry>,
): InvestigationFocus => ({
  kind,
  primaryScreenshots,
  primaryEventNumbers: Array.from(
    new Set(
      primaryScreenshots
        .map((f) => f.eventNumber)
        .filter((n): n is number => n != null),
    ),
  ).sort((a, b) => a - b),
  primaryVtRange: computeVtRange(primaryScreenshots, screenshotMap),
  totalDiffingScreenshots,
});

const computeVtRange = (
  primaryScreenshots: FocusScreenshot[],
  screenshotMap: Record<string, ScreenshotMapEntry>,
): { start: number; end: number } | null => {
  const vts: number[] = [];
  for (const s of primaryScreenshots) {
    const head = s.headReplayId
      ? screenshotMap[`head/${s.headReplayId}/${s.filename}`]
      : undefined;
    const base = s.baseReplayId
      ? screenshotMap[`base/${s.baseReplayId}/${s.filename}`]
      : undefined;
    if (head?.virtualTimeStart != null) {
      vts.push(head.virtualTimeStart);
    }
    if (base?.virtualTimeStart != null) {
      vts.push(base.virtualTimeStart);
    }
  }
  return vts.length === 0
    ? null
    : { start: Math.min(...vts), end: Math.max(...vts) };
};
