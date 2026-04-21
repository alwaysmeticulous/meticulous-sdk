import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import {
  getScreenshotDomDiff,
  MeticulousClient,
} from "@alwaysmeticulous/client";
import chalk from "chalk";
import pLimit from "p-limit";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import type { DebugContext } from "./debug.types";

export interface DomDiffMapEntry {
  /** Path (relative to debug-data/) to the canonical `context=3` diff,
   *  or `null` when DOMs are identical or the fetch errored. */
  diffPath: string | null;
  totalHunks: number;
  bytes: number;
  url: string | null;
}

// Typed so callers can't assume every key is present: not every
// `<label>/<screenshotBaseName>` combination produces a diff
// (identical, API error, only-in-one-side, etc.).
export type DomDiffMap = { [key: string]: DomDiffMapEntry | undefined };

export interface FetchDomDiffsOptions {
  client: MeticulousClient;
  debugContext: DebugContext;
  workspaceDir: string;
  maxConcurrency?: number | undefined;
  /** Injectable for tests. Defaults to the real `getScreenshotDomDiff`. */
  fetchScreenshotDiff?: typeof getScreenshotDomDiff | undefined;
}

interface ReplayDiffPair {
  replayDiffId: string;
  headReplayId: string;
  baseReplayId: string;
  label: string;
}

interface ScreenshotMetadataShape {
  before?: {
    routeData?: { url?: string };
  };
}

interface SummaryRow {
  screenshotBaseName: string;
  status:
    | "diff"
    | "identical"
    | "only-in-head"
    | "only-in-base"
    | "skipped-error";
  totalHunks: number;
  bytes: number;
  url: string | null;
}

const DEFAULT_MAX_CONCURRENCY = 8;

/**
 * Fetch per-screenshot DOM diffs for every replay diff in `debugContext`
 * from the Meticulous backend and write them to `debug-data/dom-diffs/`
 * as `<label>-<baseName>.diff` plus per-pair `<label>.summary.txt`,
 * where `<label>` is `<headReplayId>-vs-<baseReplayId>` and
 * `<baseName>` is the screenshot metadata filename minus `.metadata.json`.
 *
 * On the `met debug replay --baseReplayId` path (no `replayDiffId` in
 * `DebugContext`), nothing is generated — `CLAUDE.md` tells the agent to
 * fall back to diffing `<name>.html` files with the system `diff`
 * command instead.
 *
 * Network errors are per-screenshot: we log a warning, record a
 * `skipped-error` summary row, and continue. The pipeline never fails
 * because a DOM diff couldn't be fetched.
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
    if (
      !existsSync(headScreenshotsDir) ||
      !existsSync(baseScreenshotsDir)
    ) {
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

    mkdirSync(domDiffsDir, { recursive: true });

    // One task per screenshot. Tasks that make an API call run under
    // `limit`; only-in-one-side tasks do pure local work and skip the
    // limiter (so they don't starve API-bound ones).
    const tasks = [...allNames].sort().map((screenshotBaseName) =>
      resolveScreenshot({
        pair,
        screenshotBaseName,
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

  return domDiffMap;
};

interface ScreenshotResolution {
  summaryRow: SummaryRow;
  mapEntry: DomDiffMapEntry | null;
}

const resolveScreenshot = async (args: {
  pair: ReplayDiffPair;
  screenshotBaseName: string;
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

  // Screenshot present on only one side: populate URL from the side we
  // have, don't make an API call (backend can't diff nothing).
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

  return limit(async () => {
    let response;
    try {
      response = await fetchScreenshotDiff(
        client,
        pair.replayDiffId,
        screenshotBaseName,
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
    "",
    "For each screenshot below, `<name>.diff` contains the canonical",
    "unified diff (context: 3 lines per hunk) fetched from the",
    "Meticulous backend. To see the same diff with full-file context,",
    "run:",
    "",
    `  meticulous agent dom-diff --replayDiffId ${pair.replayDiffId} \\`,
    "    --screenshotName <screenshot> --context full",
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
  const tableHeader = ["screenshot", "status", "hunks", "diff_bytes", "url"].join(
    "\t",
  );

  return `${header}\n${[tableHeader, ...tableRows].join("\n")}\n`;
};

const readUrlFromMetadata = (metadataPath: string): string | null => {
  try {
    const parsed = JSON.parse(
      readFileSync(metadataPath, "utf-8"),
    ) as ScreenshotMetadataShape;
    return parsed.before?.routeData?.url ?? null;
  } catch {
    return null;
  }
};

// Reject any segment that could escape the `dom-diffs/` directory
// when interpolated into a filename.
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
  // Note: `met debug replay --baseReplayId` (no replayDiffId) is not
  // handled here — the backend endpoint requires a replayDiffId. The
  // agent is told in CLAUDE.md to diff `<name>.html` files directly on
  // that path.
  return pairs;
};
