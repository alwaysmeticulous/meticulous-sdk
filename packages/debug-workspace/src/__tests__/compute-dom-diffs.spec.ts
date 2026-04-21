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
    expect(entry.diffPath).toBe(
      "dom-diffs/headA-vs-baseA-screenshot-after-event-00001.diff",
    );
    expect(entry.fullDiffPath).toBe(
      "dom-diffs/headA-vs-baseA-screenshot-after-event-00001.full.diff",
    );
    expect(entry.totalHunks).toBeGreaterThanOrEqual(1);
    expect(entry.bytes).toBeGreaterThan(0);
    expect(entry.url).toBe("https://example.com/a");
  });

  it("does not write a .diff when pretty-printed DOMs are identical, but still writes .full.diff", () => {
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
    ).toBe(true);

    const entry = map["headB-vs-baseB/final-state"];
    expect(entry.diffPath).toBeNull();
    expect(entry.totalHunks).toBe(0);
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
});
