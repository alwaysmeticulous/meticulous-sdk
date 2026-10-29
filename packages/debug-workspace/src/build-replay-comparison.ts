import { existsSync, readdirSync, readFileSync } from "fs";
import { basename, join } from "path";
import { getMeticulousLocalDataDir } from "@alwaysmeticulous/common";
import chalk from "chalk";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import { readReplayTimeline } from "./replay-walk";

export interface ReplayComparisonEntry {
  replayId: string;
  role: string;
  /** The session this replay replayed: head and base can differ when one side replayed a patched copy. */
  sessionId: string | null;
  totalEvents: number | null;
  totalNetworkRequests: number | null;
  totalUserEvents: number | null;
  totalVirtualTimeMs: number | null;
  screenshotCount: number | null;
}

export const buildReplayComparison = (
  workspaceDir: string,
): ReplayComparisonEntry[] => {
  const entries: ReplayComparisonEntry[] = [];

  for (const subDir of ["head", "base", "other"]) {
    const subDirPath = join(
      workspaceDir,
      DEBUG_DATA_DIRECTORY,
      "replays",
      subDir,
    );
    if (!existsSync(subDirPath)) {
      continue;
    }

    for (const replayId of readdirSync(subDirPath)) {
      const replayDir = join(subDirPath, replayId);
      const stats = extractReplayStats(replayDir);
      entries.push({ replayId, role: subDir, ...stats });
    }
  }

  if (entries.length >= 2) {
    console.log(
      chalk.green(
        `  Generated replay comparison for ${entries.length} replay(s)`,
      ),
    );
  }
  return entries;
};

type ReplayStats = Omit<ReplayComparisonEntry, "replayId" | "role">;

const extractReplayStats = (replayDir: string): ReplayStats => {
  const timelineStats = countTimelineEntries(replayDir);

  const screenshotsDir = join(
    getMeticulousLocalDataDir(),
    "replays",
    basename(replayDir),
    "screenshots",
  );
  const screenshotCount = existsSync(screenshotsDir)
    ? readdirSync(screenshotsDir).filter((f) => f.endsWith(".png")).length
    : null;

  return {
    sessionId: readReplayedSessionId(replayDir),
    ...timelineStats,
    screenshotCount,
  };
};

const readReplayedSessionId = (replayDir: string): string | null => {
  const paramsPath = join(replayDir, "launchBrowserAndReplayParams.json");
  if (!existsSync(paramsPath)) {
    return null;
  }
  try {
    const params = JSON.parse(readFileSync(paramsPath, "utf8")) as {
      session?: { id?: unknown };
    };
    const id = params.session?.id;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
};

const countTimelineEntries = (
  replayDir: string,
): Omit<ReplayStats, "sessionId" | "screenshotCount"> => {
  const timeline = readReplayTimeline(replayDir);
  if (timeline == null || timeline.length === 0) {
    return {
      totalEvents: null,
      totalNetworkRequests: null,
      totalUserEvents: null,
      totalVirtualTimeMs: null,
    };
  }

  const countByKind = new Map<string, number>();
  const count = (kind: string, n: number) =>
    countByKind.set(kind, (countByKind.get(kind) ?? 0) + n);
  let minVt: number | undefined;
  let maxVt: number | undefined;
  for (const entry of timeline) {
    // Past a per-kind cap (e.g. 500 network requests) the timeline stops
    // storing entries and only counts them in this marker.
    if (entry.kind === "timelineEntryLimitReached") {
      const { entryKind, numOmitted } = entry.data ?? {};
      if (typeof entryKind === "string" && typeof numOmitted === "number") {
        count(entryKind, numOmitted);
      }
    } else {
      count(entry.kind, 1);
    }
    const vt = entry.virtualTimeStart;
    if (vt != null) {
      if (minVt == null || vt < minVt) {
        minVt = vt;
      }
      if (maxVt == null || vt > maxVt) {
        maxVt = vt;
      }
    }
  }

  return {
    totalEvents: [...countByKind.values()].reduce((sum, n) => sum + n, 0),
    totalNetworkRequests: countByKind.get("pollyReplay") ?? 0,
    totalUserEvents: countByKind.get("jsReplay") ?? 0,
    totalVirtualTimeMs:
      minVt != null && maxVt != null ? Math.round(maxVt - minVt) : null,
  };
};
