import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type {
  MeticulousClient,
  ReplayDiffJsCoverageDiffResponse,
} from "@alwaysmeticulous/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEBUG_DATA_DIRECTORY } from "../debug-constants";
import type { DebugContext } from "../debug.types";
import { fetchRepoCoverage } from "../fetch-repo-coverage";

const debugContext = (screenshot?: string) =>
  ({
    screenshot,
    replayDiffs: [
      {
        id: "rd",
        headReplayId: "head1",
        baseReplayId: "base1",
        sessionId: "s",
        numScreenshotDiffs: 1,
      },
    ],
  }) as unknown as DebugContext;

const client = {} as MeticulousClient;

const coverageResponse: ReplayDiffJsCoverageDiffResponse = {
  head: [["/apps/web/src/Status.tsx", [[1, 11]]]],
  base: [["apps/web/src/Status.tsx", [[1, 12]]]],
  diff: [],
};

describe("fetchRepoCoverage", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "repo-coverage-"));
    const diffsDir = join(workspace, DEBUG_DATA_DIRECTORY, "diffs");
    mkdirSync(diffsDir, { recursive: true });
    writeFileSync(
      join(diffsDir, "rd.json"),
      JSON.stringify({
        data: {
          screenshotDiffResults: [
            {
              identifier: {
                type: "after-event",
                eventNumber: 552,
                logicVersion: null,
              },
            },
          ],
        },
      }),
    );
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("polls while the coverage is computed, for the whole replay and the targeted screenshot", async () => {
    const fetchCoverage = vi
      .fn()
      .mockResolvedValueOnce({ status: "processing", message: "computing" })
      .mockResolvedValue(coverageResponse);

    const result = await fetchRepoCoverage({
      client,
      debugContext: debugContext("screenshot-after-event-00552.png"),
      workspaceDir: workspace,
      fetchCoverage,
      pollIntervalMs: 1,
    });

    expect(fetchCoverage).toHaveBeenCalledWith(client, "rd", undefined, {
      limit: 1,
    });
    expect(fetchCoverage).toHaveBeenCalledWith(
      client,
      "rd",
      "after-event-552",
      {
        limit: 1,
      },
    );
    const pair = result["head1-vs-base1"];
    expect(pair?.wholeReplay).toEqual({
      kind: "available",
      head: new Map([["apps/web/src/Status.tsx", [[1, 11]]]]),
      base: new Map([["apps/web/src/Status.tsx", [[1, 12]]]]),
    });
    expect(pair?.screenshot?.kind).toBe("available");
  });

  it("reports coverage it can't fetch as unavailable, with the reason", async () => {
    const fetchCoverage = vi.fn().mockRejectedValue(new Error("403"));

    const result = await fetchRepoCoverage({
      client,
      debugContext: debugContext(),
      workspaceDir: workspace,
      fetchCoverage,
    });

    expect(result["head1-vs-base1"]).toEqual({
      wholeReplay: { kind: "unavailable", reason: "403" },
      screenshot: null,
    });
  });

  it("reports coverage that maps to no repo file on either side as unavailable", async () => {
    const fetchCoverage = vi
      .fn()
      .mockResolvedValue({ head: [], base: [], diff: [] });

    const result = await fetchRepoCoverage({
      client,
      debugContext: debugContext("screenshot-after-event-00552.png"),
      workspaceDir: workspace,
      fetchCoverage,
    });

    const unavailable = {
      kind: "unavailable",
      reason: "no repo-mapped coverage was recorded for either replay",
    };
    expect(result["head1-vs-base1"]).toEqual({
      wholeReplay: unavailable,
      screenshot: unavailable,
    });
  });

  it("reports a whole replay without repo-mapped coverage on one side as unavailable, but not a screenshot", async () => {
    const fetchCoverage = vi.fn().mockResolvedValue({
      head: coverageResponse.head,
      base: [],
      diff: [],
    });

    const result = await fetchRepoCoverage({
      client,
      debugContext: debugContext("screenshot-after-event-00552.png"),
      workspaceDir: workspace,
      fetchCoverage,
    });

    const pair = result["head1-vs-base1"];
    expect(pair?.wholeReplay).toEqual({
      kind: "unavailable",
      reason: "no repo-mapped coverage was recorded for the base replay",
    });
    expect(pair?.screenshot).toEqual({
      kind: "available",
      head: new Map([["apps/web/src/Status.tsx", [[1, 11]]]]),
      base: new Map(),
    });
  });

  it("passes a targeted screenshot it can't find in the replay diff to the backend as given", async () => {
    const fetchCoverage = vi.fn().mockResolvedValue(coverageResponse);

    const result = await fetchRepoCoverage({
      client,
      debugContext: debugContext("after-event-552"),
      workspaceDir: workspace,
      fetchCoverage,
    });

    expect(fetchCoverage).toHaveBeenCalledWith(
      client,
      "rd",
      "after-event-552",
      { limit: 1 },
    );
    expect(result["head1-vs-base1"]?.screenshot?.kind).toBe("available");
  });

  it("passes the targeted screenshot to the backend as given when the replay diff wasn't downloaded", async () => {
    rmSync(join(workspace, DEBUG_DATA_DIRECTORY, "diffs", "rd.json"));
    const fetchCoverage = vi.fn().mockResolvedValue(coverageResponse);

    await fetchRepoCoverage({
      client,
      debugContext: debugContext("screenshot-after-event-00552.png"),
      workspaceDir: workspace,
      fetchCoverage,
    });

    expect(fetchCoverage).toHaveBeenCalledWith(
      client,
      "rd",
      "screenshot-after-event-00552.png",
      { limit: 1 },
    );
  });

  it("reports a targeted screenshot whose coverage can't be fetched as unavailable", async () => {
    const fetchCoverage = vi.fn(
      (_client: unknown, _replayDiffId: string, screenshot?: string) =>
        screenshot != null
          ? Promise.reject(new Error("404 Screenshot not found"))
          : Promise.resolve(coverageResponse),
    );

    const result = await fetchRepoCoverage({
      client,
      debugContext: debugContext("nonexistent.png"),
      workspaceDir: workspace,
      fetchCoverage,
    });

    expect(result["head1-vs-base1"]?.screenshot).toEqual({
      kind: "unavailable",
      reason: "404 Screenshot not found",
    });
  });

  it("limits how many coverage requests run at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchCoverage = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return coverageResponse;
    });

    await fetchRepoCoverage({
      client,
      debugContext: debugContext("screenshot-after-event-00552.png"),
      workspaceDir: workspace,
      maxConcurrency: 1,
      fetchCoverage,
    });

    expect(fetchCoverage).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
  });

  it("gives up on coverage still being computed after the timeout", async () => {
    const fetchCoverage = vi
      .fn()
      .mockResolvedValue({ status: "processing", message: "computing" });

    const result = await fetchRepoCoverage({
      client,
      debugContext: debugContext(),
      workspaceDir: workspace,
      fetchCoverage,
      pollIntervalMs: 1,
      pollTimeoutMs: 0,
    });

    expect(result["head1-vs-base1"]?.wholeReplay).toEqual({
      kind: "unavailable",
      reason: "still being computed after 0s",
    });
  });
});
