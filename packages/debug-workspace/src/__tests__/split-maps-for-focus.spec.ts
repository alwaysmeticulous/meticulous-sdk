import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEBUG_DATA_DIRECTORY } from "../debug-constants";
import type { DomDiffMap } from "../fetch-dom-diffs";
import type { InvestigationFocus } from "../focus.types";
import type { ScreenshotMapEntry } from "../generate-debug-workspace";
import {
  DOM_DIFF_INDEX_SIDECAR_FILENAME,
  SCREENSHOT_INDEX_SIDECAR_FILENAME,
  splitMapsForFocus,
} from "../split-maps-for-focus";

describe("splitMapsForFocus", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "met-split-"));
    mkdirSync(join(workspace, DEBUG_DATA_DIRECTORY), { recursive: true });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("writes the full screenshot and dom-diff maps to sidecar files", () => {
    const screenshotMap: Record<string, ScreenshotMapEntry> = {
      "head/h/screenshot-after-event-00001.png": entry({ replayRole: "head" }),
      "base/b/screenshot-after-event-00001.png": entry({ replayRole: "base" }),
    };
    const domDiffMap: DomDiffMap = {
      "h-vs-b/screenshot-after-event-00001": {
        diffPath: "dom-diffs/x.diff",
        fullDiffPath: null,
        totalHunks: 1,
        bytes: 100,
        url: null,
      },
    };

    splitMapsForFocus({
      workspaceDir: workspace,
      screenshotMap,
      domDiffMap,
      investigationFocus: emptyFocus("free-form-replays"),
    });

    const screenshotIndexPath = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      SCREENSHOT_INDEX_SIDECAR_FILENAME,
    );
    const domDiffIndexPath = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      DOM_DIFF_INDEX_SIDECAR_FILENAME,
    );
    expect(existsSync(screenshotIndexPath)).toBe(true);
    expect(existsSync(domDiffIndexPath)).toBe(true);
    expect(JSON.parse(readFileSync(screenshotIndexPath, "utf8"))).toEqual(
      screenshotMap,
    );
    expect(JSON.parse(readFileSync(domDiffIndexPath, "utf8"))).toEqual(
      domDiffMap,
    );
  });

  it("returns an empty focus screenshot map for free-form-replays", () => {
    const screenshotMap: Record<string, ScreenshotMapEntry> = {
      "head/h/screenshot-after-event-00001.png": entry({ replayRole: "head" }),
    };
    const result = splitMapsForFocus({
      workspaceDir: workspace,
      screenshotMap,
      domDiffMap: {},
      investigationFocus: emptyFocus("free-form-replays"),
    });
    expect(result.focusScreenshotMap).toEqual({});
    expect(result.screenshotIndexCount).toBe(1);
  });

  it("filters screenshotMap down to just the focus entries' head + base counterparts", () => {
    const focusFilename = "screenshot-after-event-00010.png";
    const otherFilename = "screenshot-after-event-00009.png";
    const screenshotMap: Record<string, ScreenshotMapEntry> = {
      [`head/h1/${focusFilename}`]: entry({
        replayRole: "head",
        replayId: "h1",
        filename: focusFilename,
      }),
      [`base/b1/${focusFilename}`]: entry({
        replayRole: "base",
        replayId: "b1",
        filename: focusFilename,
      }),
      [`head/h1/${otherFilename}`]: entry({
        replayRole: "head",
        replayId: "h1",
        filename: otherFilename,
      }),
    };
    const focus: InvestigationFocus = {
      kind: "screenshot",
      primaryScreenshots: [
        {
          filename: focusFilename,
          eventNumber: 10,
          headReplayId: "h1",
          baseReplayId: "b1",
          headVirtualTimeStart: null,
          baseVirtualTimeStart: null,
          mismatchFraction: null,
          mismatchPercent: null,
          changedSectionsClassNames: [],
          isNeighbor: false,
        },
      ],
      primaryEventNumbers: [10],
      primaryVtRange: null,
      totalDiffingScreenshots: 0,
    };

    const result = splitMapsForFocus({
      workspaceDir: workspace,
      screenshotMap,
      domDiffMap: {},
      investigationFocus: focus,
    });

    expect(Object.keys(result.focusScreenshotMap).sort()).toEqual([
      `base/b1/${focusFilename}`,
      `head/h1/${focusFilename}`,
    ]);
    expect(result.screenshotIndexCount).toBe(3);
  });

  it("filters domDiffMap to only entries with a non-null diffPath", () => {
    const domDiffMap: DomDiffMap = {
      "p/a": {
        diffPath: "dom-diffs/a.diff",
        fullDiffPath: null,
        totalHunks: 1,
        bytes: 50,
        url: null,
      },
      "p/b": {
        diffPath: null,
        fullDiffPath: null,
        totalHunks: 0,
        bytes: 0,
        url: null,
      },
    };
    const result = splitMapsForFocus({
      workspaceDir: workspace,
      screenshotMap: {},
      domDiffMap,
      investigationFocus: emptyFocus("replay-diff"),
    });
    expect(Object.keys(result.focusDomDiffMap)).toEqual(["p/a"]);
    expect(result.domDiffIndexCount).toBe(2);
  });
});

const entry = (
  overrides: Partial<ScreenshotMapEntry> & { replayRole: string },
): ScreenshotMapEntry => ({
  replayId: overrides.replayId ?? "r",
  replayRole: overrides.replayRole,
  filename: overrides.filename ?? "screenshot-after-event-00001.png",
  virtualTimeStart: overrides.virtualTimeStart ?? null,
  virtualTimeEnd: overrides.virtualTimeEnd ?? null,
  eventNumber: overrides.eventNumber ?? 1,
  htmlFilename: overrides.htmlFilename ?? null,
  afterHtmlFilename: overrides.afterHtmlFilename ?? null,
});

const emptyFocus = (kind: InvestigationFocus["kind"]): InvestigationFocus => ({
  kind,
  primaryScreenshots: [],
  primaryEventNumbers: [],
  primaryVtRange: null,
  totalDiffingScreenshots: 0,
});
