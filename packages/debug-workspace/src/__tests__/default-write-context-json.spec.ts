import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEBUG_DATA_DIRECTORY } from "../debug-constants";
import type { DebugContext } from "../debug.types";
import type { DomDiffMap } from "../fetch-dom-diffs";
import type { InvestigationFocus } from "../focus.types";
import {
  defaultWriteContextJson,
  type ScreenshotMapEntry,
} from "../generate-debug-workspace";

describe("defaultWriteContextJson", () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "met-ctxjson-"));
    mkdirSync(join(workspaceDir, DEBUG_DATA_DIRECTORY), { recursive: true });
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("emits investigationFocus, sidecar refs, and the new index paths", () => {
    const focus: InvestigationFocus = {
      kind: "replay-diff",
      primaryScreenshots: [
        {
          filename: "screenshot-after-event-00010.png",
          eventNumber: 10,
          headReplayId: "head-1",
          baseReplayId: "base-1",
          headVirtualTimeStart: 1000,
          baseVirtualTimeStart: 1000,
          mismatchFraction: 0.05,
          mismatchPercent: "5%",
          changedSectionsClassNames: ["card", "btn"],
          isNeighbor: false,
        },
      ],
      primaryEventNumbers: [10],
      primaryVtRange: { start: 1000, end: 1000 },
      totalDiffingScreenshots: 1,
    };

    defaultWriteContextJson({
      debugContext: makeDebugContext(),
      workspaceDir,
      fileMetadata: [],
      projectRepoDir: undefined,
      screenshotMap: makeScreenshotMap("head-1", "base-1"),
      screenshotMapSidecar: { $ref: "screenshot-index.json", count: 42 },
      replayComparison: [],
      domDiffMap: makeDomDiffMap("head-1", "base-1"),
      domDiffMapSidecar: { $ref: "dom-diff-index.json", count: 17 },
      investigationFocus: focus,
    });

    const context = readContextJson(workspaceDir);
    expect(context.investigationFocus).toEqual(focus);
    expect(context.screenshotMapSidecar).toEqual({
      $ref: "screenshot-index.json",
      count: 42,
    });
    expect(context.domDiffMapSidecar).toEqual({
      $ref: "dom-diff-index.json",
      count: 17,
    });
    expect(context.paths.screenshotIndex).toBe("screenshot-index.json");
    expect(context.paths.domDiffIndex).toBe("dom-diff-index.json");
  });

  it("inlines only the focus-scoped maps it was given", () => {
    const screenshotMap = makeScreenshotMap("head-1", "base-1");
    const domDiffMap = makeDomDiffMap("head-1", "base-1");

    defaultWriteContextJson({
      debugContext: makeDebugContext(),
      workspaceDir,
      fileMetadata: [],
      projectRepoDir: undefined,
      screenshotMap,
      screenshotMapSidecar: { $ref: "screenshot-index.json", count: 1000 },
      replayComparison: [],
      domDiffMap,
      domDiffMapSidecar: { $ref: "dom-diff-index.json", count: 500 },
      investigationFocus: emptyFocus(),
    });

    const context = readContextJson(workspaceDir);
    expect(Object.keys(context.screenshotMap)).toEqual(
      Object.keys(screenshotMap),
    );
    expect(Object.keys(context.domDiffMap)).toEqual(Object.keys(domDiffMap));
  });

  it("keeps context.json well under 50KB for a focus-scoped workspace", () => {
    // Even with totals in the thousands, the inlined payload should stay
    // small because everything large lives in the sidecars.
    defaultWriteContextJson({
      debugContext: makeDebugContext(),
      workspaceDir,
      fileMetadata: [],
      projectRepoDir: undefined,
      screenshotMap: makeScreenshotMap("head-1", "base-1"),
      screenshotMapSidecar: { $ref: "screenshot-index.json", count: 5000 },
      replayComparison: [],
      domDiffMap: makeDomDiffMap("head-1", "base-1"),
      domDiffMapSidecar: { $ref: "dom-diff-index.json", count: 2000 },
      investigationFocus: emptyFocus(),
    });

    const path = join(workspaceDir, DEBUG_DATA_DIRECTORY, "context.json");
    const sizeBytes = readFileSync(path).byteLength;
    expect(sizeBytes).toBeLessThan(50 * 1024);
  });
});

const makeDebugContext = (): DebugContext =>
  ({
    orgAndProject: "acme/web",
    testRunId: "tr-1",
    testRunStatus: "Failed",
    commitSha: "deadbeef",
    baseCommitSha: "cafef00d",
    screenshot: undefined,
    replayDiffs: [
      {
        id: "rd-1",
        headReplayId: "head-1",
        baseReplayId: "base-1",
        sessionId: "s-1",
        numScreenshotDiffs: 1,
      },
    ],
    replayIds: ["head-1", "base-1"],
    sessionIds: ["s-1"],
  }) as unknown as DebugContext;

const makeScreenshotMap = (
  headId: string,
  baseId: string,
): Record<string, ScreenshotMapEntry> => ({
  [`head/${headId}/screenshot-after-event-00010.png`]: {
    replayId: headId,
    replayRole: "head",
    filename: "screenshot-after-event-00010.png",
    virtualTimeStart: 1000,
    virtualTimeEnd: 1010,
    eventNumber: 10,
    htmlFilename: "screenshot-after-event-00010.html",
    afterHtmlFilename: null,
  },
  [`base/${baseId}/screenshot-after-event-00010.png`]: {
    replayId: baseId,
    replayRole: "base",
    filename: "screenshot-after-event-00010.png",
    virtualTimeStart: 1000,
    virtualTimeEnd: 1010,
    eventNumber: 10,
    htmlFilename: "screenshot-after-event-00010.html",
    afterHtmlFilename: null,
  },
});

const makeDomDiffMap = (headId: string, baseId: string): DomDiffMap => ({
  [`${headId}-vs-${baseId}/screenshot-after-event-00010`]: {
    diffPath: "dom-diffs/head-1-vs-base-1-screenshot-after-event-00010.diff",
    fullDiffPath:
      "dom-diffs/head-1-vs-base-1-screenshot-after-event-00010.full.diff",
    totalHunks: 3,
    bytes: 1024,
    url: "https://example.com",
  },
});

const emptyFocus = (): InvestigationFocus => ({
  kind: "free-form-replays",
  primaryScreenshots: [],
  primaryEventNumbers: [],
  primaryVtRange: null,
  totalDiffingScreenshots: 0,
});

interface ContextJsonShape {
  investigationFocus: InvestigationFocus;
  screenshotMap: Record<string, unknown>;
  screenshotMapSidecar: { $ref: string; count: number };
  domDiffMap: Record<string, unknown>;
  domDiffMapSidecar: { $ref: string; count: number };
  paths: { screenshotIndex: string; domDiffIndex: string };
}

const readContextJson = (workspaceDir: string): ContextJsonShape =>
  JSON.parse(
    readFileSync(
      join(workspaceDir, DEBUG_DATA_DIRECTORY, "context.json"),
      "utf8",
    ),
  );
