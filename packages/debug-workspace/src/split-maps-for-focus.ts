import { writeFileSync } from "fs";
import { join } from "path";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import type { DomDiffMap } from "./fetch-dom-diffs";
import type { FocusScreenshot, InvestigationFocus } from "./focus.types";
import type { ScreenshotMapEntry } from "./generate-debug-workspace";

/**
 * Splits the unfiltered `screenshotMap` and `domDiffMap` into two views:
 *
 *  - A small, focus-scoped view inlined into `context.json` (returned).
 *  - The full unfiltered view written to disk as `screenshot-index.json` and
 *    `dom-diff-index.json` sidecar files (side effect).
 *
 * The sidecar files are always written; the focus view may be empty (e.g.
 * for `free-form-replays` where no anchor exists). When the focus view ends
 * up empty the agent is expected to consult the sidecars on demand.
 */
export interface SplitMapsArgs {
  workspaceDir: string;
  screenshotMap: Record<string, ScreenshotMapEntry>;
  domDiffMap: DomDiffMap;
  investigationFocus: InvestigationFocus;
}

export interface SplitMapsResult {
  /** Focus-scoped screenshot map (suitable for inlining into `context.json`). */
  focusScreenshotMap: Record<string, ScreenshotMapEntry>;
  /** Focus-scoped DOM-diff map (only entries with `diffPath != null`). */
  focusDomDiffMap: DomDiffMap;
  /** Total number of entries written to `screenshot-index.json`. */
  screenshotIndexCount: number;
  /** Total number of entries written to `dom-diff-index.json`. */
  domDiffIndexCount: number;
}

export const SCREENSHOT_INDEX_SIDECAR_FILENAME = "screenshot-index.json";
export const DOM_DIFF_INDEX_SIDECAR_FILENAME = "dom-diff-index.json";

export const splitMapsForFocus = (args: SplitMapsArgs): SplitMapsResult => {
  const { workspaceDir, screenshotMap, domDiffMap, investigationFocus } = args;

  writeScreenshotIndexSidecar(workspaceDir, screenshotMap);
  writeDomDiffIndexSidecar(workspaceDir, domDiffMap);

  return {
    focusScreenshotMap: filterScreenshotMapToFocus(
      screenshotMap,
      investigationFocus.primaryScreenshots,
    ),
    focusDomDiffMap: filterDomDiffMapToDiffing(domDiffMap),
    screenshotIndexCount: Object.keys(screenshotMap).length,
    domDiffIndexCount: Object.keys(domDiffMap).length,
  };
};

// ---------------------------------------------------------------------------
// Sidecar emission
// ---------------------------------------------------------------------------

const writeScreenshotIndexSidecar = (
  workspaceDir: string,
  screenshotMap: Record<string, ScreenshotMapEntry>,
): void => {
  writeFileSync(
    join(workspaceDir, DEBUG_DATA_DIRECTORY, SCREENSHOT_INDEX_SIDECAR_FILENAME),
    JSON.stringify(screenshotMap, null, 2),
  );
};

const writeDomDiffIndexSidecar = (
  workspaceDir: string,
  domDiffMap: DomDiffMap,
): void => {
  writeFileSync(
    join(workspaceDir, DEBUG_DATA_DIRECTORY, DOM_DIFF_INDEX_SIDECAR_FILENAME),
    JSON.stringify(domDiffMap, null, 2),
  );
};

// ---------------------------------------------------------------------------
// Focus-scoped filtering
// ---------------------------------------------------------------------------

/**
 * Keeps only the entries in `screenshotMap` that correspond to a screenshot in
 * {@link FocusScreenshot}'s `primaryScreenshots`. Each focus entry can pull in
 * up to two screenshotMap rows (head + base counterparts).
 */
const filterScreenshotMapToFocus = (
  screenshotMap: Record<string, ScreenshotMapEntry>,
  primaryScreenshots: FocusScreenshot[],
): Record<string, ScreenshotMapEntry> => {
  const focusKeys = new Set<string>();
  for (const screenshot of primaryScreenshots) {
    if (screenshot.headReplayId != null) {
      focusKeys.add(`head/${screenshot.headReplayId}/${screenshot.filename}`);
    }
    if (screenshot.baseReplayId != null) {
      focusKeys.add(`base/${screenshot.baseReplayId}/${screenshot.filename}`);
    }
  }

  const filtered: Record<string, ScreenshotMapEntry> = {};
  for (const [key, value] of Object.entries(screenshotMap)) {
    if (focusKeys.has(key)) {
      filtered[key] = value;
      continue;
    }
    // Also keep `other/<replayId>/<filename>` rows for free-form / orphan cases
    // where the focus entry has no head/base replay anchor.
    const matchesOrphan = primaryScreenshots.some(
      (p) =>
        p.headReplayId == null &&
        p.baseReplayId == null &&
        value.filename === p.filename,
    );
    if (matchesOrphan) {
      filtered[key] = value;
    }
  }
  return filtered;
};

/**
 * Keeps only DOM-diff entries with a non-null `diffPath` (i.e. ones that
 * actually represent a difference). The unfiltered map — including
 * `diffPath: null` rows representing identical DOMs and skipped pairs —
 * stays in `dom-diff-index.json`.
 */
const filterDomDiffMapToDiffing = (domDiffMap: DomDiffMap): DomDiffMap => {
  const filtered: DomDiffMap = {};
  for (const [key, value] of Object.entries(domDiffMap)) {
    if (value && value.diffPath != null) {
      filtered[key] = value;
    }
  }
  return filtered;
};
