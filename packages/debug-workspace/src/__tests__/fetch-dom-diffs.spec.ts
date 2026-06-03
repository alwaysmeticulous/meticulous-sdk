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
import type {
  MeticulousClient,
  ScreenshotDomDiffResponse,
} from "@alwaysmeticulous/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEBUG_DATA_DIRECTORY } from "../debug-constants";
import type { DebugContext } from "../debug.types";
import { fetchDomDiffs } from "../fetch-dom-diffs";

interface ScreenshotIdentifierFixture {
  type?: "after-event" | "end-state" | string;
  eventNumber?: number;
  logicVersion?: number;
  variant?: "normal" | "redacted";
}

interface DiffResultFixture {
  identifier?: ScreenshotIdentifierFixture;
  outcome?: string;
}

/**
 * Writes the replay-diff JSON that `fetchDomDiffs` enumerates from
 * (`debug-data/diffs/<replayDiffId>.json`), mirroring the shape downloaded by
 * `downloadDebugData`.
 */
const setupReplayDiffResults = (
  workspace: string,
  replayDiffId: string,
  screenshotDiffResults: DiffResultFixture[],
): void => {
  const diffsDir = join(workspace, DEBUG_DATA_DIRECTORY, "diffs");
  mkdirSync(diffsDir, { recursive: true });
  writeFileSync(
    join(diffsDir, `${replayDiffId}.json`),
    JSON.stringify({ data: { screenshotDiffResults } }),
  );
};

/** Writes a screenshot `metadata.json` on disk so URL lookup can resolve. */
const setupScreenshotMetadata = (
  workspace: string,
  role: "head" | "base",
  replayId: string,
  screenshotBaseName: string,
  url?: string,
): void => {
  const screenshotsDir = join(
    workspace,
    DEBUG_DATA_DIRECTORY,
    "replays",
    role,
    replayId,
    "screenshots",
  );
  mkdirSync(screenshotsDir, { recursive: true });
  writeFileSync(
    join(screenshotsDir, `${screenshotBaseName}.metadata.json`),
    JSON.stringify({
      before: { ...(url ? { routeData: { url } } : {}) },
    }),
  );
};

const makeDebugContext = (
  headReplayId: string,
  baseReplayId: string,
  replayDiffId = "diff-1",
): DebugContext => ({
  testRunId: undefined,
  replayDiffs: [
    {
      id: replayDiffId,
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

const fakeClient = {} as MeticulousClient;

const diffResponse = (contents: string[]): ScreenshotDomDiffResponse => ({
  diffs: contents.map((content, index) => ({ index, content })),
  totalDiffs: contents.length,
});

describe("fetchDomDiffs", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "met-debug-fetch-dom-diffs-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("writes .diff + .full.diff + .summary.txt and populates domDiffMap for a diffing screenshot", async () => {
    setupReplayDiffResults(workspace, "diffA", [
      { identifier: { type: "after-event", eventNumber: 1 }, outcome: "diff" },
    ]);
    setupScreenshotMetadata(
      workspace,
      "head",
      "headA",
      "screenshot-after-event-00001",
      "https://example.com/a",
    );
    const fetchScreenshotDiff = vi
      .fn()
      .mockResolvedValueOnce(
        diffResponse([
          "@@ -1,1 +1,1 @@\n-<p>old</p>\n+<p>new</p>",
          "@@ -5,1 +5,1 @@\n-<span>b</span>\n+<span>B</span>",
        ]),
      )
      .mockResolvedValueOnce(
        diffResponse([
          "@@ -1,10 +1,10 @@\n <html>\n <body>\n-<p>old</p>\n+<p>new</p>\n </body>",
        ]),
      );

    const map = await fetchDomDiffs({
      client: fakeClient,
      debugContext: makeDebugContext("headA", "baseA", "diffA"),
      workspaceDir: workspace,
      fetchScreenshotDiff,
    });

    expect(fetchScreenshotDiff).toHaveBeenCalledTimes(2);
    expect(fetchScreenshotDiff).toHaveBeenNthCalledWith(
      1,
      fakeClient,
      "diffA",
      "after-event-1",
    );
    expect(fetchScreenshotDiff).toHaveBeenNthCalledWith(
      2,
      fakeClient,
      "diffA",
      "after-event-1",
      undefined,
      "full",
    );

    const domDiffsDir = join(workspace, DEBUG_DATA_DIRECTORY, "dom-diffs");
    const diffFile = join(
      domDiffsDir,
      "headA-vs-baseA-screenshot-after-event-00001.diff",
    );
    const fullDiffFile = join(
      domDiffsDir,
      "headA-vs-baseA-screenshot-after-event-00001.full.diff",
    );
    expect(existsSync(diffFile)).toBe(true);
    expect(existsSync(fullDiffFile)).toBe(true);
    expect(readFileSync(diffFile, "utf-8")).toContain("-<p>old</p>");
    expect(readFileSync(fullDiffFile, "utf-8")).toContain("<html>");

    const entry = map["headA-vs-baseA/screenshot-after-event-00001"];
    expect(entry?.diffPath).toBe(
      "dom-diffs/headA-vs-baseA-screenshot-after-event-00001.diff",
    );
    expect(entry?.fullDiffPath).toBe(
      "dom-diffs/headA-vs-baseA-screenshot-after-event-00001.full.diff",
    );
    expect(entry?.totalHunks).toBe(2);
    expect(entry?.bytes).toBeGreaterThan(0);
    expect(entry?.url).toBe("https://example.com/a");

    const summary = readFileSync(
      join(domDiffsDir, "headA-vs-baseA.summary.txt"),
      "utf-8",
    );
    expect(summary).toContain(".full.diff");
  });

  it("still records the canonical diff when the full-context fetch fails", async () => {
    setupReplayDiffResults(workspace, "diffF", [
      { identifier: { type: "after-event", eventNumber: 1 }, outcome: "diff" },
    ]);
    const fetchScreenshotDiff = vi
      .fn()
      .mockResolvedValueOnce(
        diffResponse(["@@ -1,1 +1,1 @@\n-<p>old</p>\n+<p>new</p>"]),
      )
      .mockRejectedValueOnce(new Error("full-context boom"));

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => warnings.push(String(msg));
    try {
      const map = await fetchDomDiffs({
        client: fakeClient,
        debugContext: makeDebugContext("headF", "baseF", "diffF"),
        workspaceDir: workspace,
        fetchScreenshotDiff,
      });

      const entry = map["headF-vs-baseF/screenshot-after-event-00001"];
      expect(entry?.diffPath).toBe(
        "dom-diffs/headF-vs-baseF-screenshot-after-event-00001.diff",
      );
      expect(entry?.fullDiffPath).toBeNull();
      expect(warnings.some((w) => /full-context DOM diff/.test(w))).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });

  it("records no-diff screenshots as identical without an API call", async () => {
    setupReplayDiffResults(workspace, "diff-1", [
      { identifier: { type: "end-state" }, outcome: "no-diff" },
    ]);
    setupScreenshotMetadata(
      workspace,
      "head",
      "headB",
      "final-state",
      "https://example.com/b",
    );
    const fetchScreenshotDiff = vi.fn();

    const map = await fetchDomDiffs({
      client: fakeClient,
      debugContext: makeDebugContext("headB", "baseB"),
      workspaceDir: workspace,
      fetchScreenshotDiff,
    });

    expect(fetchScreenshotDiff).not.toHaveBeenCalled();
    expect(
      existsSync(
        join(
          workspace,
          DEBUG_DATA_DIRECTORY,
          "dom-diffs",
          "headB-vs-baseB-final-state.diff",
        ),
      ),
    ).toBe(false);

    // No map entry for identical screenshots — there is nothing to navigate to,
    // and emitting one per compared screenshot would bloat the context.
    expect(map["headB-vs-baseB/final-state"]).toBeUndefined();

    const summary = readFileSync(
      join(
        workspace,
        DEBUG_DATA_DIRECTORY,
        "dom-diffs",
        "headB-vs-baseB.summary.txt",
      ),
      "utf-8",
    );
    // The url is still recorded in the summary row even without a map entry.
    expect(summary).toMatch(
      /final-state\tidentical\t0\t0\thttps:\/\/example\.com\/b/,
    );
  });

  it("only fetches DOM diffs for screenshots whose outcome is a visual diff", async () => {
    setupReplayDiffResults(workspace, "diff-1", [
      { identifier: { type: "after-event", eventNumber: 1 }, outcome: "diff" },
      {
        identifier: { type: "after-event", eventNumber: 2 },
        outcome: "no-diff",
      },
      {
        identifier: { type: "after-event", eventNumber: 3 },
        outcome: "no-diff",
      },
    ]);
    const fetchScreenshotDiff = vi.fn().mockResolvedValue(diffResponse([]));

    await fetchDomDiffs({
      client: fakeClient,
      debugContext: makeDebugContext("headM", "baseM"),
      workspaceDir: workspace,
      fetchScreenshotDiff,
    });

    // Only the single `diff`-outcome screenshot triggers the API (canonical +
    // full = 2 calls); the two `no-diff` screenshots are never fetched.
    expect(fetchScreenshotDiff).toHaveBeenCalledTimes(1);
    expect(fetchScreenshotDiff).toHaveBeenCalledWith(
      fakeClient,
      "diff-1",
      "after-event-1",
    );
  });

  it("derives only-in-head / only-in-base from missing-* outcomes without hitting the API", async () => {
    setupReplayDiffResults(workspace, "diff-1", [
      {
        identifier: { type: "after-event", eventNumber: 1 },
        outcome: "missing-base",
      },
      {
        identifier: { type: "after-event", eventNumber: 2 },
        outcome: "missing-head",
      },
    ]);
    setupScreenshotMetadata(
      workspace,
      "head",
      "hOnly",
      "screenshot-after-event-00001",
      "https://example.com/head-only",
    );
    setupScreenshotMetadata(
      workspace,
      "base",
      "bOnly",
      "screenshot-after-event-00002",
      "https://example.com/base-only",
    );
    const fetchScreenshotDiff = vi.fn();

    await fetchDomDiffs({
      client: fakeClient,
      debugContext: makeDebugContext("hOnly", "bOnly"),
      workspaceDir: workspace,
      fetchScreenshotDiff,
    });

    expect(fetchScreenshotDiff).not.toHaveBeenCalled();
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
    expect(summary).toMatch(
      /screenshot-after-event-00002\tonly-in-base\t.*https:\/\/example\.com\/base-only/,
    );
  });

  it("records skipped-error rows and aggregate warning when the API throws", async () => {
    setupReplayDiffResults(workspace, "diff-1", [
      { identifier: { type: "end-state" }, outcome: "diff" },
    ]);
    setupScreenshotMetadata(
      workspace,
      "head",
      "hErr",
      "final-state",
      "https://example.com/err",
    );
    const fetchScreenshotDiff = vi.fn().mockRejectedValue(new Error("boom"));

    const warnings: string[] = [];
    const logs: string[] = [];
    const originalWarn = console.warn;
    const originalLog = console.log;
    console.warn = (msg: string) => warnings.push(String(msg));
    console.log = (msg: string) => logs.push(String(msg));

    try {
      const map = await fetchDomDiffs({
        client: fakeClient,
        debugContext: makeDebugContext("hErr", "bErr"),
        workspaceDir: workspace,
        fetchScreenshotDiff,
      });

      expect(map["hErr-vs-bErr/final-state"]).toBeUndefined();
      expect(
        existsSync(
          join(
            workspace,
            DEBUG_DATA_DIRECTORY,
            "dom-diffs",
            "hErr-vs-bErr-final-state.diff",
          ),
        ),
      ).toBe(false);
      expect(warnings.some((w) => /Could not fetch DOM diff/.test(w))).toBe(
        true,
      );
      expect(logs.some((l) => /Skipped .* due to API errors/.test(l))).toBe(
        true,
      );

      const summary = readFileSync(
        join(
          workspace,
          DEBUG_DATA_DIRECTORY,
          "dom-diffs",
          "hErr-vs-bErr.summary.txt",
        ),
        "utf-8",
      );
      expect(summary).toMatch(/final-state\tskipped-error/);
      expect(summary).toContain("skipped (API error): 1");
    } finally {
      console.warn = originalWarn;
      console.log = originalLog;
    }
  });

  it("strips logicVersion when converting end-state to backend name", async () => {
    // On-disk is `final-state-v2`; backend only accepts `end-state`.
    setupReplayDiffResults(workspace, "diffL", [
      { identifier: { type: "end-state", logicVersion: 2 }, outcome: "diff" },
    ]);
    const fetchScreenshotDiff = vi.fn().mockResolvedValue(diffResponse([]));

    await fetchDomDiffs({
      client: fakeClient,
      debugContext: makeDebugContext("headL", "baseL", "diffL"),
      workspaceDir: workspace,
      fetchScreenshotDiff,
    });

    expect(fetchScreenshotDiff).toHaveBeenCalledWith(
      fakeClient,
      "diffL",
      "end-state",
    );
  });

  it("skips screenshots with no backend name (redacted variant) without warning per-screenshot", async () => {
    // Redacted: backend naming unverified → skip instead of 404.
    setupReplayDiffResults(workspace, "diffR", [
      {
        identifier: {
          type: "after-event",
          eventNumber: 1,
          variant: "redacted",
        },
        outcome: "diff",
      },
    ]);
    const fetchScreenshotDiff = vi.fn();

    const map = await fetchDomDiffs({
      client: fakeClient,
      debugContext: makeDebugContext("headR", "baseR", "diffR"),
      workspaceDir: workspace,
      fetchScreenshotDiff,
    });

    expect(fetchScreenshotDiff).not.toHaveBeenCalled();
    expect(map).toEqual({});

    const summary = readFileSync(
      join(
        workspace,
        DEBUG_DATA_DIRECTORY,
        "dom-diffs",
        "headR-vs-baseR.summary.txt",
      ),
      "utf-8",
    );
    expect(summary).toMatch(
      /screenshot-after-event-00001\.redacted\tskipped-unsupported/,
    );
    expect(summary).toContain("skipped (unsupported identifier): 1");
  });

  it("ignores screenshots on disk that are absent from screenshotDiffResults", async () => {
    // The authoritative set has one screenshot; a stray on-disk screenshot that
    // the (curated) timeline never registered must not be attempted or skipped.
    setupReplayDiffResults(workspace, "diff-1", [
      {
        identifier: { type: "after-event", eventNumber: 1 },
        outcome: "no-diff",
      },
    ]);
    setupScreenshotMetadata(
      workspace,
      "head",
      "headS",
      "screenshot-after-event-00099",
    );
    const fetchScreenshotDiff = vi.fn();

    await fetchDomDiffs({
      client: fakeClient,
      debugContext: makeDebugContext("headS", "baseS"),
      workspaceDir: workspace,
      fetchScreenshotDiff,
    });

    expect(fetchScreenshotDiff).not.toHaveBeenCalled();
    const summary = readFileSync(
      join(
        workspace,
        DEBUG_DATA_DIRECTORY,
        "dom-diffs",
        "headS-vs-baseS.summary.txt",
      ),
      "utf-8",
    );
    expect(summary).toContain("Screenshots analyzed: 1");
    expect(summary).not.toContain("screenshot-after-event-00099");
  });

  it("warns and skips a pair with no replay-diff JSON on disk", async () => {
    const fetchScreenshotDiff = vi.fn();

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => warnings.push(String(msg));

    try {
      const map = await fetchDomDiffs({
        client: fakeClient,
        debugContext: makeDebugContext("headN", "baseN"),
        workspaceDir: workspace,
        fetchScreenshotDiff,
      });

      expect(map).toEqual({});
      expect(fetchScreenshotDiff).not.toHaveBeenCalled();
      expect(
        existsSync(join(workspace, DEBUG_DATA_DIRECTORY, "dom-diffs")),
      ).toBe(false);
      expect(
        warnings.some((w) => /replay diff JSON .* is missing/.test(w)),
      ).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });

  it("warns with the parse error when the replay-diff JSON is malformed", async () => {
    const diffsDir = join(workspace, DEBUG_DATA_DIRECTORY, "diffs");
    mkdirSync(diffsDir, { recursive: true });
    writeFileSync(join(diffsDir, "diffP.json"), "{ not valid json");
    const fetchScreenshotDiff = vi.fn();

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => warnings.push(String(msg));

    try {
      const map = await fetchDomDiffs({
        client: fakeClient,
        debugContext: makeDebugContext("headP", "baseP", "diffP"),
        workspaceDir: workspace,
        fetchScreenshotDiff,
      });

      expect(map).toEqual({});
      expect(fetchScreenshotDiff).not.toHaveBeenCalled();
      expect(
        warnings.some((w) => /Could not parse replay diff JSON/.test(w)),
      ).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });

  it("refuses unsafe replay IDs that would escape dom-diffs/", async () => {
    setupReplayDiffResults(workspace, "diff-unsafe", [
      { identifier: { type: "after-event", eventNumber: 1 }, outcome: "diff" },
    ]);
    const ctx: DebugContext = {
      ...makeDebugContext("../escape", "baseC"),
      replayDiffs: [
        {
          id: "diff-unsafe",
          headReplayId: "../escape",
          baseReplayId: "baseC",
          sessionId: undefined,
          numScreenshotDiffs: 0,
        },
      ],
      replayIds: ["../escape", "baseC"],
    };
    const fetchScreenshotDiff = vi.fn();

    const map = await fetchDomDiffs({
      client: fakeClient,
      debugContext: ctx,
      workspaceDir: workspace,
      fetchScreenshotDiff,
    });

    expect(map).toEqual({});
    expect(fetchScreenshotDiff).not.toHaveBeenCalled();
  });
});
