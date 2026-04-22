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

interface SetupReplayPairOpts {
  headReplayId: string;
  baseReplayId: string;
  screenshotBaseName: string;
  side?: "both" | "head-only" | "base-only";
  url?: string;
  /**
   * Optional identifier to write into `<role>/<replayId>/timeline.json`.
   * Required for API-hitting tests because `fetchDomDiffs` now derives
   * the backend screenshot name from the timeline, not the on-disk name.
   */
  identifier?: ScreenshotIdentifierFixture;
}

const setupReplayPair = (
  workspace: string,
  opts: SetupReplayPairOpts,
): void => {
  const side = opts.side ?? "both";
  const mkReplayDir = (role: "head" | "base", replayId: string) =>
    join(workspace, DEBUG_DATA_DIRECTORY, "replays", role, replayId);
  const headReplayDir = mkReplayDir("head", opts.headReplayId);
  const baseReplayDir = mkReplayDir("base", opts.baseReplayId);
  const headScreenshotsDir = join(headReplayDir, "screenshots");
  const baseScreenshotsDir = join(baseReplayDir, "screenshots");
  mkdirSync(headScreenshotsDir, { recursive: true });
  mkdirSync(baseScreenshotsDir, { recursive: true });

  const metadataBody = JSON.stringify({
    before: {
      ...(opts.url ? { routeData: { url: opts.url } } : {}),
    },
  });

  if (side === "both" || side === "head-only") {
    writeFileSync(
      join(headScreenshotsDir, `${opts.screenshotBaseName}.metadata.json`),
      metadataBody,
    );
  }
  if (side === "both" || side === "base-only") {
    writeFileSync(
      join(baseScreenshotsDir, `${opts.screenshotBaseName}.metadata.json`),
      metadataBody,
    );
  }

  if (opts.identifier) {
    const timeline = [
      {
        kind: "screenshot",
        data: { identifier: opts.identifier },
      },
    ];
    const body = JSON.stringify(timeline);
    if (side === "both" || side === "head-only") {
      writeFileSync(join(headReplayDir, "timeline.json"), body);
    }
    if (side === "both" || side === "base-only") {
      writeFileSync(join(baseReplayDir, "timeline.json"), body);
    }
  }
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

const diffResponse = (
  contents: string[],
): ScreenshotDomDiffResponse => ({
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

  it("returns an empty map when replays/ is missing", async () => {
    const fetchScreenshotDiff = vi.fn();
    const map = await fetchDomDiffs({
      client: fakeClient,
      debugContext: makeDebugContext("h", "b"),
      workspaceDir: workspace,
      fetchScreenshotDiff,
    });
    expect(map).toEqual({});
    expect(fetchScreenshotDiff).not.toHaveBeenCalled();
    expect(
      existsSync(join(workspace, DEBUG_DATA_DIRECTORY, "dom-diffs")),
    ).toBe(false);
  });

  it("writes .diff + .summary.txt and populates domDiffMap for a diffing pair", async () => {
    setupReplayPair(workspace, {
      headReplayId: "headA",
      baseReplayId: "baseA",
      screenshotBaseName: "screenshot-after-event-00001",
      identifier: { type: "after-event", eventNumber: 1 },
      url: "https://example.com/a",
    });
    const fetchScreenshotDiff = vi.fn().mockResolvedValue(
      diffResponse([
        "@@ -1,1 +1,1 @@\n-<p>old</p>\n+<p>new</p>",
        "@@ -5,1 +5,1 @@\n-<span>b</span>\n+<span>B</span>",
      ]),
    );

    const map = await fetchDomDiffs({
      client: fakeClient,
      debugContext: makeDebugContext("headA", "baseA", "diffA"),
      workspaceDir: workspace,
      fetchScreenshotDiff,
    });

    expect(fetchScreenshotDiff).toHaveBeenCalledTimes(1);
    // The backend requires the unpadded `after-event-<N>` form, not
    // the on-disk `screenshot-after-event-00001` basename.
    expect(fetchScreenshotDiff).toHaveBeenCalledWith(
      fakeClient,
      "diffA",
      "after-event-1",
    );

    const domDiffsDir = join(workspace, DEBUG_DATA_DIRECTORY, "dom-diffs");
    const diffFile = join(
      domDiffsDir,
      "headA-vs-baseA-screenshot-after-event-00001.diff",
    );
    expect(existsSync(diffFile)).toBe(true);
    const body = readFileSync(diffFile, "utf-8");
    expect(body).toContain("-<p>old</p>");
    expect(body).toContain("+<p>new</p>");
    expect(body).toContain("-<span>b</span>");
    expect(body).toContain("+<span>B</span>");

    const entry = map["headA-vs-baseA/screenshot-after-event-00001"];
    expect(entry?.diffPath).toBe(
      "dom-diffs/headA-vs-baseA-screenshot-after-event-00001.diff",
    );
    expect(entry?.totalHunks).toBe(2);
    expect(entry?.bytes).toBeGreaterThan(0);
    expect(entry?.url).toBe("https://example.com/a");

    // Summary should point the agent at the `met agent dom-diff` CLI
    // for full-context diffs, scoped to this pair's replayDiffId.
    const summary = readFileSync(
      join(domDiffsDir, "headA-vs-baseA.summary.txt"),
      "utf-8",
    );
    expect(summary).toContain("meticulous agent dom-diff --replayDiffId diffA");
  });

  it("writes no .diff file when the backend reports zero diffs; identical row in summary", async () => {
    setupReplayPair(workspace, {
      headReplayId: "headB",
      baseReplayId: "baseB",
      screenshotBaseName: "final-state",
      identifier: { type: "end-state" },
      url: "https://example.com/b",
    });
    const fetchScreenshotDiff = vi.fn().mockResolvedValue(diffResponse([]));

    const map = await fetchDomDiffs({
      client: fakeClient,
      debugContext: makeDebugContext("headB", "baseB"),
      workspaceDir: workspace,
      fetchScreenshotDiff,
    });

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

    const entry = map["headB-vs-baseB/final-state"];
    expect(entry?.diffPath).toBeNull();
    expect(entry?.totalHunks).toBe(0);
    expect(entry?.bytes).toBe(0);
    expect(entry?.url).toBe("https://example.com/b");

    const summary = readFileSync(
      join(
        workspace,
        DEBUG_DATA_DIRECTORY,
        "dom-diffs",
        "headB-vs-baseB.summary.txt",
      ),
      "utf-8",
    );
    expect(summary).toMatch(/final-state\tidentical\t0\t0/);
  });

  it("reads url for only-in-head / only-in-base rows without hitting the API", async () => {
    setupReplayPair(workspace, {
      headReplayId: "hOnly",
      baseReplayId: "bOnly",
      screenshotBaseName: "screenshot-after-event-00001",
      side: "head-only",
      url: "https://example.com/head-only",
    });
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
  });

  it("records skipped-error rows and aggregate warning when the API throws", async () => {
    setupReplayPair(workspace, {
      headReplayId: "hErr",
      baseReplayId: "bErr",
      screenshotBaseName: "final-state",
      identifier: { type: "end-state" },
      url: "https://example.com/err",
    });
    const fetchScreenshotDiff = vi
      .fn()
      .mockRejectedValue(new Error("boom"));

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
      expect(
        warnings.some((w) => /Could not fetch DOM diff/.test(w)),
      ).toBe(true);
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

  it("does nothing on the --baseReplayId path where replayDiffs is empty", async () => {
    const mkOther = (id: string) =>
      join(
        workspace,
        DEBUG_DATA_DIRECTORY,
        "replays",
        "other",
        id,
        "screenshots",
      );
    mkdirSync(mkOther("idA"), { recursive: true });
    mkdirSync(mkOther("idB"), { recursive: true });
    writeFileSync(
      join(mkOther("idA"), "final-state.metadata.json"),
      JSON.stringify({ before: {} }),
    );
    writeFileSync(
      join(mkOther("idB"), "final-state.metadata.json"),
      JSON.stringify({ before: {} }),
    );

    const fetchScreenshotDiff = vi.fn();
    const map = await fetchDomDiffs({
      client: fakeClient,
      debugContext: { ...makeDebugContext("idA", "idB"), replayDiffs: [] },
      workspaceDir: workspace,
      fetchScreenshotDiff,
    });

    expect(map).toEqual({});
    expect(fetchScreenshotDiff).not.toHaveBeenCalled();
    expect(
      existsSync(join(workspace, DEBUG_DATA_DIRECTORY, "dom-diffs")),
    ).toBe(false);
  });

  it("strips logicVersion when converting end-state to backend name", async () => {
    // On-disk basename for { type: end-state, logicVersion: 2 } is
    // `final-state-v2`, but the backend only accepts `end-state`.
    setupReplayPair(workspace, {
      headReplayId: "headL",
      baseReplayId: "baseL",
      screenshotBaseName: "final-state-v2",
      identifier: { type: "end-state", logicVersion: 2 },
    });
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

  it("skips screenshots with no backend name (redacted variant / missing timeline)", async () => {
    // Redacted variant: identifier is known, but backend naming for
    // redacted variants is unverified, so we skip rather than risk 404.
    setupReplayPair(workspace, {
      headReplayId: "headR",
      baseReplayId: "baseR",
      screenshotBaseName: "screenshot-after-event-00001.redacted",
      identifier: {
        type: "after-event",
        eventNumber: 1,
        variant: "redacted",
      },
    });
    // Missing timeline: no identifier at all → also skipped.
    setupReplayPair(workspace, {
      headReplayId: "headR",
      baseReplayId: "baseR",
      screenshotBaseName: "screenshot-after-event-00002",
    });
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
    expect(summary).toMatch(
      /screenshot-after-event-00002\tskipped-unsupported/,
    );
    expect(summary).toContain("skipped (unsupported identifier): 2");
  });

  it("refuses unsafe replay IDs that would escape dom-diffs/", async () => {
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
    mkdirSync(join(workspace, DEBUG_DATA_DIRECTORY, "replays"), {
      recursive: true,
    });
    const fetchScreenshotDiff = vi.fn();

    const map = await fetchDomDiffs({
      client: fakeClient,
      debugContext: ctx,
      workspaceDir: workspace,
      fetchScreenshotDiff,
    });

    expect(map).toEqual({});
    expect(fetchScreenshotDiff).not.toHaveBeenCalled();
    expect(
      existsSync(join(workspace, DEBUG_DATA_DIRECTORY, "dom-diffs")),
    ).toBe(false);
  });

});
