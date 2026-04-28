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
 * Hard cap on the number of `primaryScreenshots` written into the inline
 * `investigationFocus` block. Above this we keep the highest-mismatch
 * diffing entries and rely on `screenshot-index.json` for the long tail.
 */
export const MAX_FOCUS_SCREENSHOTS = 50;

/**
 * Number of event-number neighbours expanded around each diffing screenshot
 * in `replay-diff` focus mode (e.g. `2` means a diff @ event N also pulls in
 * events N-2..N+2). Neighbours are dropped before diffing screenshots when
 * the {@link MAX_FOCUS_SCREENSHOTS} cap is exceeded.
 */
export const NEIGHBOR_EVENT_RADIUS = 2;

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
      buildScreenshotFocus({
        debugContext,
        screenshotMap,
        targetFilename: debugContext.screenshot,
      }),
      0,
    );
  }

  if (debugContext.replayDiffs.length > 0) {
    const result = buildReplayDiffFocus({
      debugContext,
      screenshotMap,
      workspaceDir,
    });
    return finalize(
      "replay-diff",
      result.primaryScreenshots,
      result.totalDiffingScreenshots,
    );
  }

  if (debugContext.replayIds.length === 1) {
    return finalize("single-replay", [], 0);
  }

  return finalize("free-form-replays", [], 0);
};

// ---------------------------------------------------------------------------
// `screenshot` mode — single screenshot targeted via `--screenshot`.
// ---------------------------------------------------------------------------

const buildScreenshotFocus = (args: {
  debugContext: DebugContext;
  screenshotMap: Record<string, ScreenshotMapEntry>;
  targetFilename: string;
}): FocusScreenshot[] => {
  const { debugContext, screenshotMap, targetFilename } = args;

  if (debugContext.replayDiffs.length === 0) {
    const orphan = findOrphanFocusEntry(screenshotMap, targetFilename);
    return orphan ? [orphan] : [];
  }

  const focus: FocusScreenshot[] = [];
  for (const diff of debugContext.replayDiffs) {
    const headEntry =
      screenshotMap[`head/${diff.headReplayId}/${targetFilename}`];
    const baseEntry =
      screenshotMap[`base/${diff.baseReplayId}/${targetFilename}`];

    if (!headEntry && !baseEntry) {
      continue;
    }

    focus.push({
      filename: targetFilename,
      eventNumber: headEntry?.eventNumber ?? baseEntry?.eventNumber ?? null,
      headReplayId: headEntry ? diff.headReplayId : null,
      baseReplayId: baseEntry ? diff.baseReplayId : null,
      headVirtualTimeStart: headEntry?.virtualTimeStart ?? null,
      baseVirtualTimeStart: baseEntry?.virtualTimeStart ?? null,
      mismatchFraction: null,
      mismatchPercent: null,
      changedSectionsClassNames: [],
      isNeighbor: false,
    });
  }
  return focus;
};

const findOrphanFocusEntry = (
  screenshotMap: Record<string, ScreenshotMapEntry>,
  targetFilename: string,
): FocusScreenshot | null => {
  for (const entry of Object.values(screenshotMap)) {
    if (entry.filename !== targetFilename) {
      continue;
    }
    return {
      filename: targetFilename,
      eventNumber: entry.eventNumber,
      headReplayId: entry.replayRole === "head" ? entry.replayId : null,
      baseReplayId: entry.replayRole === "base" ? entry.replayId : null,
      headVirtualTimeStart:
        entry.replayRole === "head" ? entry.virtualTimeStart : null,
      baseVirtualTimeStart:
        entry.replayRole === "base" ? entry.virtualTimeStart : null,
      mismatchFraction: null,
      mismatchPercent: null,
      changedSectionsClassNames: [],
      isNeighbor: false,
    };
  }
  return null;
};

// ---------------------------------------------------------------------------
// `replay-diff` mode — anchor on the screenshots that actually differ.
// ---------------------------------------------------------------------------

interface ReplayDiffFocusResult {
  primaryScreenshots: FocusScreenshot[];
  totalDiffingScreenshots: number;
}

const buildReplayDiffFocus = (args: {
  debugContext: DebugContext;
  screenshotMap: Record<string, ScreenshotMapEntry>;
  workspaceDir: string;
}): ReplayDiffFocusResult => {
  const { debugContext, screenshotMap, workspaceDir } = args;

  const diffing = collectDiffingScreenshots(debugContext, workspaceDir);
  const totalDiffingScreenshots = diffing.length;

  // Convert raw diffs to focus screenshots; drop ones we can't anchor in the map.
  const diffFocus = diffing
    .map((d) =>
      hydrateDiffFocus({
        screenshotMap,
        diffPair: d.diffPair,
        filename: d.filename,
        eventNumber: d.eventNumber,
        mismatchFraction: d.mismatchFraction,
        changedSectionsClassNames: d.changedSectionsClassNames,
      }),
    )
    .filter((f): f is FocusScreenshot => f !== null);

  diffFocus.sort(byMismatchDesc);
  const cappedDiffs = diffFocus.slice(0, MAX_FOCUS_SCREENSHOTS);

  if (cappedDiffs.length === MAX_FOCUS_SCREENSHOTS) {
    return { primaryScreenshots: cappedDiffs, totalDiffingScreenshots };
  }

  const neighbours = collectNeighbours({
    debugContext,
    screenshotMap,
    primary: cappedDiffs,
  });

  const remaining = MAX_FOCUS_SCREENSHOTS - cappedDiffs.length;
  return {
    primaryScreenshots: [...cappedDiffs, ...neighbours.slice(0, remaining)],
    totalDiffingScreenshots,
  };
};

interface DiffingScreenshot {
  diffPair: { headReplayId: string; baseReplayId: string };
  filename: string;
  eventNumber: number | null;
  mismatchFraction: number | null;
  changedSectionsClassNames: string[];
}

/** On-disk shape of an entry inside `diffs/<replayDiffId>.json`. */
interface DiffScreenshotResult {
  identifier?: ScreenshotIdentifier;
  outcome?: string;
  diffToBaseScreenshot?: {
    mismatchPixels?: number;
    mismatchFraction?: number;
    changedSectionsClassNames?: string[] | null;
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

    const raw = parseDiffJson(path);
    const results = raw?.data?.screenshotDiffResults ?? [];

    for (const result of results) {
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
        diffPair: {
          headReplayId: diff.headReplayId,
          baseReplayId: diff.baseReplayId,
        },
        filename,
        eventNumber: result.identifier?.eventNumber ?? null,
        mismatchFraction:
          result.diffToBaseScreenshot?.mismatchFraction ?? null,
        changedSectionsClassNames:
          result.diffToBaseScreenshot?.changedSectionsClassNames ?? [],
      });
    }
  }

  return out;
};

const parseDiffJson = (
  path: string,
): { data?: { screenshotDiffResults?: DiffScreenshotResult[] } } | null => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};

/**
 * A screenshot is "diffing" if either it has a non-zero pixel mismatch or
 * its outcome is anything other than `"no-diff"`. Catches missing, added,
 * and errored screenshots in addition to plain pixel diffs.
 */
const isDiffing = (result: DiffScreenshotResult): boolean => {
  const pixels = result.diffToBaseScreenshot?.mismatchPixels;
  if (typeof pixels === "number" && pixels > 0) {
    return true;
  }
  const outcome = result.outcome;
  if (
    typeof outcome === "string" &&
    outcome.length > 0 &&
    outcome !== "no-diff"
  ) {
    return true;
  }
  return false;
};

const hydrateDiffFocus = (args: {
  screenshotMap: Record<string, ScreenshotMapEntry>;
  diffPair: { headReplayId: string; baseReplayId: string };
  filename: string;
  eventNumber: number | null;
  mismatchFraction: number | null;
  changedSectionsClassNames: string[];
}): FocusScreenshot | null => {
  const { screenshotMap, diffPair, filename, eventNumber } = args;
  const headEntry = screenshotMap[`head/${diffPair.headReplayId}/${filename}`];
  const baseEntry = screenshotMap[`base/${diffPair.baseReplayId}/${filename}`];

  if (!headEntry && !baseEntry) {
    return null;
  }

  return {
    filename,
    eventNumber:
      eventNumber ??
      headEntry?.eventNumber ??
      baseEntry?.eventNumber ??
      null,
    headReplayId: diffPair.headReplayId,
    baseReplayId: diffPair.baseReplayId,
    headVirtualTimeStart: headEntry?.virtualTimeStart ?? null,
    baseVirtualTimeStart: baseEntry?.virtualTimeStart ?? null,
    mismatchFraction: args.mismatchFraction,
    mismatchPercent: formatMismatchPercent(args.mismatchFraction),
    changedSectionsClassNames: args.changedSectionsClassNames,
    isNeighbor: false,
  };
};

const formatMismatchPercent = (
  mismatchFraction: number | null,
): string | null =>
  mismatchFraction == null ? null : `${(mismatchFraction * 100).toFixed(4)}%`;

const byMismatchDesc = (a: FocusScreenshot, b: FocusScreenshot): number => {
  const am = a.mismatchFraction ?? 0;
  const bm = b.mismatchFraction ?? 0;
  return bm - am;
};

// ---------------------------------------------------------------------------
// Neighbour expansion — pull in adjacent event numbers around each diffing
// screenshot to give the agent some temporal context.
// ---------------------------------------------------------------------------

const collectNeighbours = (args: {
  debugContext: DebugContext;
  screenshotMap: Record<string, ScreenshotMapEntry>;
  primary: FocusScreenshot[];
}): FocusScreenshot[] => {
  const { debugContext, screenshotMap, primary } = args;

  const seenKeys = new Set(primary.map(focusKey));
  const indexByReplayAndEvent = indexScreenshotsByEvent(screenshotMap);
  const neighbours: FocusScreenshot[] = [];

  for (const focus of primary) {
    if (focus.eventNumber == null) {
      continue;
    }
    if (focus.headReplayId == null && focus.baseReplayId == null) {
      continue;
    }

    const replayDiff = debugContext.replayDiffs.find(
      (d) =>
        d.headReplayId === focus.headReplayId &&
        d.baseReplayId === focus.baseReplayId,
    );
    if (!replayDiff) {
      continue;
    }

    for (
      let delta = -NEIGHBOR_EVENT_RADIUS;
      delta <= NEIGHBOR_EVENT_RADIUS;
      delta++
    ) {
      if (delta === 0) {
        continue;
      }
      const targetEvent = focus.eventNumber + delta;
      if (targetEvent < 0) {
        continue;
      }

      const headEntry = indexByReplayAndEvent.get(
        `${replayDiff.headReplayId}/${targetEvent}`,
      );
      const baseEntry = indexByReplayAndEvent.get(
        `${replayDiff.baseReplayId}/${targetEvent}`,
      );
      const filename = headEntry?.filename ?? baseEntry?.filename;
      if (!filename) {
        continue;
      }

      const candidate: FocusScreenshot = {
        filename,
        eventNumber: targetEvent,
        headReplayId: headEntry ? replayDiff.headReplayId : null,
        baseReplayId: baseEntry ? replayDiff.baseReplayId : null,
        headVirtualTimeStart: headEntry?.virtualTimeStart ?? null,
        baseVirtualTimeStart: baseEntry?.virtualTimeStart ?? null,
        mismatchFraction: null,
        mismatchPercent: null,
        changedSectionsClassNames: [],
        isNeighbor: true,
      };

      const k = focusKey(candidate);
      if (seenKeys.has(k)) {
        continue;
      }
      seenKeys.add(k);
      neighbours.push(candidate);
    }
  }

  neighbours.sort((a, b) => (a.eventNumber ?? 0) - (b.eventNumber ?? 0));
  return neighbours;
};

const indexScreenshotsByEvent = (
  screenshotMap: Record<string, ScreenshotMapEntry>,
): Map<string, ScreenshotMapEntry> => {
  const m = new Map<string, ScreenshotMapEntry>();
  for (const entry of Object.values(screenshotMap)) {
    if (entry.eventNumber == null) {
      continue;
    }
    const k = `${entry.replayId}/${entry.eventNumber}`;
    if (!m.has(k)) {
      m.set(k, entry);
    }
  }
  return m;
};

const focusKey = (f: FocusScreenshot): string =>
  `${f.headReplayId ?? "-"}|${f.baseReplayId ?? "-"}|${f.filename}`;

// ---------------------------------------------------------------------------
// Final assembly — derive `primaryEventNumbers` and `primaryVtRange`.
// ---------------------------------------------------------------------------

const finalize = (
  kind: InvestigationKind,
  primaryScreenshots: FocusScreenshot[],
  totalDiffingScreenshots: number,
): InvestigationFocus => {
  const eventNumbers = Array.from(
    new Set(
      primaryScreenshots
        .map((f) => f.eventNumber)
        .filter((n): n is number => n != null),
    ),
  ).sort((a, b) => a - b);

  const vts = primaryScreenshots.flatMap((f) =>
    [f.headVirtualTimeStart, f.baseVirtualTimeStart].filter(
      (v): v is number => v != null,
    ),
  );
  const primaryVtRange =
    vts.length > 0
      ? { start: Math.min(...vts), end: Math.max(...vts) }
      : null;

  return {
    kind,
    primaryScreenshots,
    primaryEventNumbers: eventNumbers,
    primaryVtRange,
    totalDiffingScreenshots,
  };
};
