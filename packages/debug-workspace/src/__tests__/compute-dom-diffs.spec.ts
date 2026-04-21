import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeDomDiffs } from "../compute-dom-diffs";
import { DEBUG_DATA_DIRECTORY } from "../debug-constants";
import type { DebugContext } from "../debug.types";

interface SetupReplayPairOpts {
  headReplayId: string;
  baseReplayId: string;
  screenshotBaseName: string;
  headDom: string;
  baseDom: string;
  url?: string;
}

const setupReplayPair = (
  workspace: string,
  opts: SetupReplayPairOpts,
): void => {
  const mkScreenshotDir = (role: "head" | "base", replayId: string) =>
    join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      role,
      replayId,
      "screenshots",
    );
  const headScreenshotsDir = mkScreenshotDir("head", opts.headReplayId);
  const baseScreenshotsDir = mkScreenshotDir("base", opts.baseReplayId);
  mkdirSync(headScreenshotsDir, { recursive: true });
  mkdirSync(baseScreenshotsDir, { recursive: true });

  const writeMetadata = (dir: string, dom: string): void => {
    writeFileSync(
      join(dir, `${opts.screenshotBaseName}.metadata.json`),
      JSON.stringify({
        before: {
          dom,
          ...(opts.url ? { routeData: { url: opts.url } } : {}),
        },
      }),
    );
  };
  writeMetadata(headScreenshotsDir, opts.headDom);
  writeMetadata(baseScreenshotsDir, opts.baseDom);
};

const makeDebugContext = (
  headReplayId: string,
  baseReplayId: string,
): DebugContext => ({
  testRunId: undefined,
  replayDiffs: [
    {
      id: "diff-1",
      headReplayId,
      baseReplayId,
      sessionId: undefined,
      numScreenshotDiffs: 1,
    },
  ],
  replayIds: [headReplayId, baseReplayId],
  sessionIds: [],
  projectId: undefined,
  orgAndProject: "org/proj",
  commitSha: undefined,
  baseCommitSha: undefined,
  testRunStatus: undefined,
  screenshot: undefined,
  meticulousSha: undefined,
  executionSha: undefined,
});

describe("computeDomDiffs", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "met-debug-dom-diffs-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("returns an empty map when replays/ is missing", () => {
    const ctx = makeDebugContext("h", "b");
    const map = computeDomDiffs(ctx, workspace);
    expect(map).toEqual({});
    expect(existsSync(join(workspace, DEBUG_DATA_DIRECTORY, "dom-diffs"))).toBe(
      false,
    );
  });

  it("writes .diff, .full.diff, and .summary.txt for a diffing pair", () => {
    setupReplayPair(workspace, {
      headReplayId: "headA",
      baseReplayId: "baseA",
      screenshotBaseName: "screenshot-after-event-00001",
      headDom: "<div><p>new</p></div>",
      baseDom: "<div><p>old</p></div>",
      url: "https://example.com/a",
    });

    const map = computeDomDiffs(makeDebugContext("headA", "baseA"), workspace);

    const domDiffsDir = join(workspace, DEBUG_DATA_DIRECTORY, "dom-diffs");
    expect(existsSync(domDiffsDir)).toBe(true);
    expect(
      existsSync(
        join(
          domDiffsDir,
          "headA-vs-baseA-screenshot-after-event-00001.diff",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(
          domDiffsDir,
          "headA-vs-baseA-screenshot-after-event-00001.full.diff",
        ),
      ),
    ).toBe(true);
    expect(existsSync(join(domDiffsDir, "headA-vs-baseA.summary.txt"))).toBe(
      true,
    );

    const entry = map["headA-vs-baseA/screenshot-after-event-00001"];
    expect(entry).toBeDefined();
    expect(entry?.diffPath).toBe(
      "dom-diffs/headA-vs-baseA-screenshot-after-event-00001.diff",
    );
    expect(entry?.fullDiffPath).toBe(
      "dom-diffs/headA-vs-baseA-screenshot-after-event-00001.full.diff",
    );
    expect(entry?.totalHunks).toBeGreaterThanOrEqual(1);
    expect(entry?.bytes).toBeGreaterThan(0);
    expect(entry?.url).toBe("https://example.com/a");
  });

  it("writes no diff files when pretty-printed DOMs are identical; both paths null out", () => {
    setupReplayPair(workspace, {
      headReplayId: "headB",
      baseReplayId: "baseB",
      screenshotBaseName: "final-state",
      headDom: "<div><p>same</p></div>",
      baseDom: "<div><p>same</p></div>",
    });

    const map = computeDomDiffs(makeDebugContext("headB", "baseB"), workspace);

    const domDiffsDir = join(workspace, DEBUG_DATA_DIRECTORY, "dom-diffs");
    expect(existsSync(join(domDiffsDir, "headB-vs-baseB-final-state.diff"))).toBe(
      false,
    );
    expect(
      existsSync(join(domDiffsDir, "headB-vs-baseB-final-state.full.diff")),
    ).toBe(false);

    const entry = map["headB-vs-baseB/final-state"];
    expect(entry?.diffPath).toBeNull();
    expect(entry?.fullDiffPath).toBeNull();
    expect(entry?.totalHunks).toBe(0);
    expect(entry?.bytes).toBe(0);
    expect(entry?.fullDiffBytes).toBe(0);
  });

  it("uses input-order fallback label when replayDiffs is empty and two replays are downloaded", () => {
    const mkOther = (id: string) =>
      join(
        workspace,
        DEBUG_DATA_DIRECTORY,
        "replays",
        "other",
        id,
        "screenshots",
      );
    const screenshotsA = mkOther("idA");
    const screenshotsB = mkOther("idB");
    mkdirSync(screenshotsA, { recursive: true });
    mkdirSync(screenshotsB, { recursive: true });
    writeFileSync(
      join(screenshotsA, "final-state.metadata.json"),
      JSON.stringify({ before: { dom: "<div>aaa</div>" } }),
    );
    writeFileSync(
      join(screenshotsB, "final-state.metadata.json"),
      JSON.stringify({ before: { dom: "<div>bbb</div>" } }),
    );

    const ctx: DebugContext = {
      ...makeDebugContext("idA", "idB"),
      replayDiffs: [],
    };
    const map = computeDomDiffs(ctx, workspace);

    expect(Object.keys(map)).toEqual(["idA-vs-idB/final-state"]);
    expect(
      existsSync(
        join(
          workspace,
          DEBUG_DATA_DIRECTORY,
          "dom-diffs",
          "idA-vs-idB.summary.txt",
        ),
      ),
    ).toBe(true);
  });

  it("summary header + TSV contains every analyzed screenshot", () => {
    setupReplayPair(workspace, {
      headReplayId: "h1",
      baseReplayId: "b1",
      screenshotBaseName: "screenshot-after-event-00001",
      headDom: "<p>one-new</p>",
      baseDom: "<p>one-old</p>",
    });
    setupReplayPair(workspace, {
      headReplayId: "h1",
      baseReplayId: "b1",
      screenshotBaseName: "screenshot-after-event-00002",
      headDom: "<p>same</p>",
      baseDom: "<p>same</p>",
    });

    computeDomDiffs(makeDebugContext("h1", "b1"), workspace);

    const summary = readFileSync(
      join(
        workspace,
        DEBUG_DATA_DIRECTORY,
        "dom-diffs",
        "h1-vs-b1.summary.txt",
      ),
      "utf-8",
    );
    expect(summary).toContain("DOM Diff Summary: h1-vs-b1");
    expect(summary).toContain("HEAD replay: h1");
    expect(summary).toContain("BASE replay: b1");
    expect(summary).toContain("screenshot-after-event-00001");
    expect(summary).toContain("screenshot-after-event-00002");
    expect(summary).toContain(
      "screenshot\tstatus\thunks\tdiff_bytes\tfull_diff_bytes\turl",
    );
  });

  it("reads url for only-in-head / only-in-base rows from the available side", () => {
    const headScreenshots = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      "hOnly",
      "screenshots",
    );
    const baseScreenshots = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "base",
      "bOnly",
      "screenshots",
    );
    mkdirSync(headScreenshots, { recursive: true });
    mkdirSync(baseScreenshots, { recursive: true });
    writeFileSync(
      join(headScreenshots, "screenshot-after-event-00001.metadata.json"),
      JSON.stringify({
        before: {
          dom: "<p>only head</p>",
          routeData: { url: "https://example.com/head-only" },
        },
      }),
    );

    computeDomDiffs(makeDebugContext("hOnly", "bOnly"), workspace);

    const summary = readFileSync(
      join(
        workspace,
        DEBUG_DATA_DIRECTORY,
        "dom-diffs",
        "hOnly-vs-bOnly.summary.txt",
      ),
      "utf-8",
    );
    expect(summary).toMatch(
      /screenshot-after-event-00001\tonly-in-head\t.*https:\/\/example\.com\/head-only/,
    );
  });

  it("skips screenshots whose metadata fails to parse and reports an aggregate count", () => {
    const warnings: string[] = [];
    const logs: string[] = [];
    const originalWarn = console.warn;
    const originalLog = console.log;
    console.warn = (msg: string) => warnings.push(String(msg));
    console.log = (msg: string) => logs.push(String(msg));

    try {
      const headScreenshots = join(
        workspace,
        DEBUG_DATA_DIRECTORY,
        "replays",
        "head",
        "hMal",
        "screenshots",
      );
      const baseScreenshots = join(
        workspace,
        DEBUG_DATA_DIRECTORY,
        "replays",
        "base",
        "bMal",
        "screenshots",
      );
      mkdirSync(headScreenshots, { recursive: true });
      mkdirSync(baseScreenshots, { recursive: true });
      writeFileSync(
        join(headScreenshots, "final-state.metadata.json"),
        "not-json",
      );
      writeFileSync(
        join(baseScreenshots, "final-state.metadata.json"),
        JSON.stringify({ before: { dom: "<p>ok</p>" } }),
      );

      const map = computeDomDiffs(makeDebugContext("hMal", "bMal"), workspace);
      expect(Object.keys(map)).toEqual([]);
      expect(logs.some((l) => /malformed metadata/.test(l))).toBe(true);
      expect(warnings.some((w) => /Could not parse metadata/.test(w))).toBe(
        true,
      );
    } finally {
      console.warn = originalWarn;
      console.log = originalLog;
    }
  });

  it("refuses unsafe replay IDs that would escape dom-diffs/", () => {
    const debugContext: DebugContext = {
      ...makeDebugContext("../escape", "baseC"),
    };
    debugContext.replayDiffs = [
      {
        id: "diff-unsafe",
        headReplayId: "../escape",
        baseReplayId: "baseC",
        sessionId: undefined,
        numScreenshotDiffs: 0,
      },
    ];
    debugContext.replayIds = ["../escape", "baseC"];

    // Even if files were created on disk for an unsafe replay ID,
    // we should never write a .diff/.summary.txt file that escapes
    // `dom-diffs/` via the interpolated filename.
    const map = computeDomDiffs(debugContext, workspace);
    expect(map).toEqual({});
    const domDiffsDir = join(workspace, DEBUG_DATA_DIRECTORY, "dom-diffs");
    expect(existsSync(domDiffsDir)).toBe(false);
  });
});
