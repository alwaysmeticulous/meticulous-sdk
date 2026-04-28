import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  getScreenshotDomDiff,
  MeticulousClient,
} from "@alwaysmeticulous/client";
import chalk from "chalk";
import pLimit from "p-limit";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import type { DebugContext } from "./debug.types";
import { readScreenshotMetadata, readTimelineJson } from "./replay-walk";
import {
  screenshotIdentifierToBaseName,
  screenshotIdentifierToBackendName,
} from "./screenshot-identifier";

export interface DomDiffMapEntry {
  /** 3-lines-of-context diff. `null` when DOMs are identical. */
  diffPath: string | null;
  /**
   * Full-file-context diff (same hunks as `diffPath`, more surrounding lines).
   * `null` when DOMs are identical, OR when the full-context fetch failed
   * while the canonical fetch succeeded (check `diffPath`: if non-null, the
   * canonical diff is still usable and a warning was logged).
   */
  fullDiffPath: string | null;
  totalHunks: number;
  bytes: number;
  url: string | null;
}

export type DomDiffMap = { [key: string]: DomDiffMapEntry | undefined };

export interface FetchDomDiffsOptions {
  client: MeticulousClient;
  debugContext: DebugContext;
  workspaceDir: string;
  maxConcurrency?: number | undefined;
  /** Injectable for tests. */
  fetchScreenshotDiff?: typeof getScreenshotDomDiff | undefined;
}

interface ReplayDiffPair {
  replayDiffId: string;
  headReplayId: string;
  baseReplayId: string;
  label: string;
}

interface SummaryRow {
  screenshotBaseName: string;
  status:
    | "diff"
    | "identical"
    | "only-in-head"
    | "only-in-base"
    | "skipped-error"
    | "skipped-unsupported";
  totalHunks: number;
  bytes: number;
  url: string | null;
}

const DEFAULT_MAX_CONCURRENCY = 8;

/**
 * Fetch per-screenshot DOM diffs for every replay diff in `debugContext`
 * and write `<label>-<baseName>.diff` (3 lines of context), a sibling
 * `<label>-<baseName>.full.diff` (full-file context), and
 * `<label>.summary.txt` under `debug-data/dom-diffs/`. Per-screenshot
 * errors are logged and recorded as `skipped-error`; the pipeline never
 * fails on a fetch error.
 */
export const fetchDomDiffs = async (
  options: FetchDomDiffsOptions,
): Promise<DomDiffMap> => {
  const {
    client,
    debugContext,
    workspaceDir,
    maxConcurrency = DEFAULT_MAX_CONCURRENCY,
    fetchScreenshotDiff = getScreenshotDomDiff,
  } = options;

  const domDiffMap: DomDiffMap = {};

  const replaysDir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "replays");
  if (!existsSync(replaysDir)) {
    return domDiffMap;
  }

  const pairs = collectReplayDiffPairs(debugContext);
  if (pairs.length === 0) {
    return domDiffMap;
  }

  const domDiffsDir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "dom-diffs");
  const limit = pLimit(maxConcurrency);

  let totalDiffs = 0;
  let skippedErrorCount = 0;
  let skippedUnsupportedCount = 0;

  for (const pair of pairs) {
    if (!isSafePathSegment(pair.label)) {
      console.warn(
        chalk.yellow(
          `  Warning: Skipping replay pair with unsafe label: ${pair.label}`,
        ),
      );
      continue;
    }

    const headScreenshotsDir = join(
      replaysDir,
      "head",
      pair.headReplayId,
      "screenshots",
    );
    const baseScreenshotsDir = join(
      replaysDir,
      "base",
      pair.baseReplayId,
      "screenshots",
    );
    if (!existsSync(headScreenshotsDir) || !existsSync(baseScreenshotsDir)) {
      continue;
    }

    const headScreenshots = indexScreenshotsByBaseName(headScreenshotsDir);
    const baseScreenshots = indexScreenshotsByBaseName(baseScreenshotsDir);
    const allNames = new Set([
      ...headScreenshots.keys(),
      ...baseScreenshots.keys(),
    ]);
    if (allNames.size === 0) {
      continue;
    }

    // Map on-disk basename → backend-format name via timeline.json
    // (the identifier isn't persisted in screenshot metadata).
    const backendNames = readBackendNameMap([
      join(replaysDir, "head", pair.headReplayId, "timeline.json"),
      join(replaysDir, "base", pair.baseReplayId, "timeline.json"),
    ]);

    mkdirSync(domDiffsDir, { recursive: true });

    const tasks = [...allNames].sort().map((screenshotBaseName) =>
      resolveScreenshot({
        pair,
        screenshotBaseName,
        backendName: backendNames.get(screenshotBaseName) ?? null,
        headMetadataPath: headScreenshots.get(screenshotBaseName),
        baseMetadataPath: baseScreenshots.get(screenshotBaseName),
        domDiffsDir,
        limit,
        fetchScreenshotDiff,
        client,
      }),
    );
    const results = await Promise.all(tasks);

    const summaryRows: SummaryRow[] = [];
    for (const result of results) {
      if (result == null) {
        continue;
      }
      summaryRows.push(result.summaryRow);
      if (result.mapEntry != null) {
        domDiffMap[`${pair.label}/${result.summaryRow.screenshotBaseName}`] =
          result.mapEntry;
      }
      if (result.summaryRow.status === "diff") {
        totalDiffs++;
      }
      if (result.summaryRow.status === "skipped-error") {
        skippedErrorCount++;
      }
      if (result.summaryRow.status === "skipped-unsupported") {
        skippedUnsupportedCount++;
      }
    }

    if (summaryRows.length > 0) {
      writeFileSync(
        join(domDiffsDir, `${pair.label}.summary.txt`),
        renderPairSummary(pair, summaryRows),
      );
    }
  }

  if (totalDiffs > 0) {
    console.log(
      chalk.green(`  Generated ${totalDiffs} DOM diff(s) in dom-diffs/`),
    );
  }
  if (skippedErrorCount > 0) {
    console.log(
      chalk.yellow(
        `  Skipped ${skippedErrorCount} screenshot DOM diff(s) due to API errors — fall back to diffing <name>.html files on disk`,
      ),
    );
  }
  if (skippedUnsupportedCount > 0) {
    console.log(
      chalk.yellow(
        `  Skipped ${skippedUnsupportedCount} screenshot DOM diff(s) with unsupported identifier (e.g. redacted variant, missing timeline entry) — fall back to diffing <name>.html files on disk`,
      ),
    );
  }

  return domDiffMap;
};

interface ScreenshotResolution {
  summaryRow: SummaryRow;
  mapEntry: DomDiffMapEntry | null;
}

const resolveScreenshot = async (args: {
  pair: ReplayDiffPair;
  screenshotBaseName: string;
  backendName: string | null;
  headMetadataPath: string | undefined;
  baseMetadataPath: string | undefined;
  domDiffsDir: string;
  limit: ReturnType<typeof pLimit>;
  fetchScreenshotDiff: typeof getScreenshotDomDiff;
  client: MeticulousClient;
}): Promise<ScreenshotResolution | null> => {
  const {
    pair,
    screenshotBaseName,
    backendName,
    headMetadataPath,
    baseMetadataPath,
    domDiffsDir,
    limit,
    fetchScreenshotDiff,
    client,
  } = args;

  if (!isSafePathSegment(screenshotBaseName)) {
    return null;
  }

  if (!headMetadataPath || !baseMetadataPath) {
    const availablePath = headMetadataPath ?? baseMetadataPath;
    return {
      summaryRow: {
        screenshotBaseName,
        status: !headMetadataPath ? "only-in-base" : "only-in-head",
        totalHunks: 0,
        bytes: 0,
        url: availablePath ? readUrlFromMetadata(availablePath) : null,
      },
      mapEntry: null,
    };
  }

  const url = readUrlFromMetadata(headMetadataPath);

  // Can't derive a backend-compatible name (redacted variant, unknown
  // type, or missing timeline entry) — skip the API call (it would 404).
  if (backendName == null) {
    console.warn(
      chalk.yellow(
        `  Warning: Skipping DOM diff for ${pair.label}/${screenshotBaseName}: no backend name available (unsupported variant or missing timeline entry)`,
      ),
    );
    return {
      summaryRow: {
        screenshotBaseName,
        status: "skipped-unsupported",
        totalHunks: 0,
        bytes: 0,
        url,
      },
      mapEntry: null,
    };
  }

  return limit(async () => {
    let response;
    try {
      response = await fetchScreenshotDiff(
        client,
        pair.replayDiffId,
        backendName,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        chalk.yellow(
          `  Warning: Could not fetch DOM diff for ${pair.label}/${screenshotBaseName}: ${message}`,
        ),
      );
      return {
        summaryRow: {
          screenshotBaseName,
          status: "skipped-error",
          totalHunks: 0,
          bytes: 0,
          url,
        },
        mapEntry: null,
      };
    }

    if (response.totalDiffs === 0 || response.diffs.length === 0) {
      return {
        summaryRow: {
          screenshotBaseName,
          status: "identical",
          totalHunks: 0,
          bytes: 0,
          url,
        },
        mapEntry: {
          diffPath: null,
          fullDiffPath: null,
          totalHunks: 0,
          bytes: 0,
          url,
        },
      };
    }

    const diffBody = response.diffs.map((d) => d.content).join("\n\n");
    const diffFilename = `${pair.label}-${screenshotBaseName}.diff`;
    writeFileSync(join(domDiffsDir, diffFilename), diffBody);
    const bytes = Buffer.byteLength(diffBody, "utf-8");

    // Fetch the same hunks with full-file context so the agent never has to
    // shell out. A fetch failure here is non-fatal: we still have the
    // canonical diff, just no `.full.diff` sibling.
    let fullDiffPath: string | null = null;
    try {
      const fullResponse = await fetchScreenshotDiff(
        client,
        pair.replayDiffId,
        backendName,
        undefined,
        "full",
      );
      const fullBody = fullResponse.diffs.map((d) => d.content).join("\n\n");
      const fullFilename = `${pair.label}-${screenshotBaseName}.full.diff`;
      writeFileSync(join(domDiffsDir, fullFilename), fullBody);
      fullDiffPath = `dom-diffs/${fullFilename}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        chalk.yellow(
          `  Warning: Could not fetch full-context DOM diff for ${pair.label}/${screenshotBaseName}: ${message}`,
        ),
      );
    }

    return {
      summaryRow: {
        screenshotBaseName,
        status: "diff",
        totalHunks: response.totalDiffs,
        bytes,
        url,
      },
      mapEntry: {
        diffPath: `dom-diffs/${diffFilename}`,
        fullDiffPath,
        totalHunks: response.totalDiffs,
        bytes,
        url,
      },
    };
  });
};

const renderPairSummary = (
  pair: ReplayDiffPair,
  rows: SummaryRow[],
): string => {
  const diffs = rows.filter((r) => r.status === "diff").length;
  const identical = rows.filter((r) => r.status === "identical").length;
  const onlyHead = rows.filter((r) => r.status === "only-in-head").length;
  const onlyBase = rows.filter((r) => r.status === "only-in-base").length;
  const skipped = rows.filter((r) => r.status === "skipped-error").length;
  const skippedUnsupported = rows.filter(
    (r) => r.status === "skipped-unsupported",
  ).length;

  const header = [
    `DOM Diff Summary: ${pair.label}`,
    "=".repeat(20 + pair.label.length),
    "",
    `HEAD replay: ${pair.headReplayId}`,
    `BASE replay: ${pair.baseReplayId}`,
    "",
    `Screenshots analyzed: ${rows.length}`,
    `  with DOM diff: ${diffs}`,
    `  identical DOM: ${identical}`,
    `  only in HEAD:  ${onlyHead}`,
    `  only in BASE:  ${onlyBase}`,
    ...(skipped > 0 ? [`  skipped (API error): ${skipped}`] : []),
    ...(skippedUnsupported > 0
      ? [`  skipped (unsupported identifier): ${skippedUnsupported}`]
      : []),
    "",
    "For each screenshot below, `<label>-<screenshot>.diff` holds the",
    "unified diff with 3 lines of context per hunk, and the sibling",
    "`<label>-<screenshot>.full.diff` holds the same hunks with",
    "full-file context for when 3 lines aren't enough.",
    "",
  ].join("\n");

  const tableRows = rows.map((row) =>
    [
      row.screenshotBaseName,
      row.status,
      String(row.totalHunks),
      formatBytes(row.bytes),
      row.url ?? "",
    ].join("\t"),
  );
  const tableHeader = [
    "screenshot",
    "status",
    "hunks",
    "diff_bytes",
    "url",
  ].join("\t");

  return `${header}\n${[tableHeader, ...tableRows].join("\n")}\n`;
};

const readUrlFromMetadata = (metadataPath: string): string | null =>
  readScreenshotMetadata(metadataPath)?.before?.routeData?.url ?? null;

/** Reject segments that could escape `dom-diffs/` when interpolated. */
const isSafePathSegment = (segment: string): boolean =>
  segment.length > 0 &&
  !segment.includes("/") &&
  !segment.includes("\\") &&
  !segment.includes("\0") &&
  segment !== "." &&
  segment !== ".." &&
  !segment.split(/[/\\]/).includes("..");

const formatBytes = (bytes: number): string => {
  if (bytes === 0) {
    return "0";
  }
  if (bytes < 1024) {
    return `${bytes}`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}k`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
};

const indexScreenshotsByBaseName = (
  screenshotsDir: string,
): Map<string, string> => {
  const index = new Map<string, string>();
  for (const filename of readdirSync(screenshotsDir)) {
    if (!filename.endsWith(".metadata.json")) {
      continue;
    }
    const baseName = filename.slice(0, -".metadata.json".length);
    index.set(baseName, join(screenshotsDir, filename));
  }
  return index;
};

/**
 * Map on-disk basename (e.g. `screenshot-after-event-00164`) to the
 * backend-format name (e.g. `after-event-164`). First timeline wins on
 * disagreement.
 */
const readBackendNameMap = (timelinePaths: string[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const timelinePath of timelinePaths) {
    const timeline = readTimelineJson(timelinePath);
    if (timeline == null) {
      continue;
    }
    for (const entry of timeline) {
      if (entry.kind !== "screenshot" || !entry.data?.identifier) {
        continue;
      }
      const baseName = screenshotIdentifierToBaseName(entry.data.identifier);
      const backendName = screenshotIdentifierToBackendName(
        entry.data.identifier,
      );
      if (baseName == null || backendName == null || map.has(baseName)) {
        continue;
      }
      map.set(baseName, backendName);
    }
  }
  return map;
};

const collectReplayDiffPairs = (
  debugContext: DebugContext,
): ReplayDiffPair[] => {
  const pairs: ReplayDiffPair[] = [];
  for (const diff of debugContext.replayDiffs) {
    pairs.push({
      replayDiffId: diff.id,
      headReplayId: diff.headReplayId,
      baseReplayId: diff.baseReplayId,
      label: `${diff.headReplayId}-vs-${diff.baseReplayId}`,
    });
  }
  // `met debug replay --baseReplayId` has no replayDiffId, so no pairs.
  // CLAUDE.md instructs the agent to diff `<name>.html` files directly.
  return pairs;
};
