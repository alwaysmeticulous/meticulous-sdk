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
import {
  screenshotIdentifierToBaseName,
  screenshotIdentifierToBackendName,
  type ScreenshotIdentifier,
} from "./screenshot-identifier";

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
    | "skipped-error"
    | "skipped-unsupported";
  totalHunks: number;
  bytes: number;
  url: string | null;
}

interface TimelineEntryShape {
  kind?: string;
  data?: {
    identifier?: ScreenshotIdentifier;
  };
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

    // Map on-disk basename → backend-format screenshot name (e.g.
    // `screenshot-after-event-00164` → `after-event-164`). The
    // identifier is only persisted in timeline.json, not in each
    // screenshot's metadata.json, so we read it from there.
    const backendNames = readBackendNameMap([
      join(replaysDir, "head", pair.headReplayId, "timeline.json"),
      join(replaysDir, "base", pair.baseReplayId, "timeline.json"),
    ]);

    mkdirSync(domDiffsDir, { recursive: true });

    // One task per screenshot. Tasks that make an API call run under
    // `limit`; only-in-one-side tasks do pure local work and skip the
    // limiter (so they don't starve API-bound ones).
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

  // No backend name means we couldn't derive the screenshot's
  // canonical identifier (redacted variant, unknown type, or missing
  // timeline entry). Skip the API call — it would 404 — and record
  // the skip so the agent falls back to <name>.html diffing.
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

/**
 * Read one or more `timeline.json` files and return a map from the
 * canonical on-disk basename (e.g. `screenshot-after-event-00164`)
 * to the backend-format screenshot name (e.g. `after-event-164`).
 *
 * Screenshots whose identifier doesn't translate to a backend name
 * (redacted variants, unknown types) are omitted so that callers
 * treat them as unsupported and skip the API call.
 *
 * If multiple timelines disagree the first one wins; in practice
 * they shouldn't disagree because `screenshotIdentifierToBaseName`
 * is injective in identifier shape.
 */
const readBackendNameMap = (timelinePaths: string[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const timelinePath of timelinePaths) {
    if (!existsSync(timelinePath)) {
      continue;
    }
    let timeline: TimelineEntryShape[];
    try {
      timeline = JSON.parse(
        readFileSync(timelinePath, "utf-8"),
      ) as TimelineEntryShape[];
    } catch {
      continue;
    }
    if (!Array.isArray(timeline)) {
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
  // Note: `met debug replay --baseReplayId` (no replayDiffId) is not
  // handled here — the backend endpoint requires a replayDiffId. The
  // agent is told in CLAUDE.md to diff `<name>.html` files directly on
  // that path.
  return pairs;
};
