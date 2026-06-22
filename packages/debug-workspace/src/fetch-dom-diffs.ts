import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { MeticulousClient } from "@alwaysmeticulous/client";
import { getScreenshotDomDiff } from "@alwaysmeticulous/client";
import chalk from "chalk";
import pLimit from "p-limit";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import type { DebugContext } from "./debug.types";
import { readScreenshotMetadata } from "./replay-walk";
import type { ScreenshotIdentifier } from "./screenshot-identifier";
import {
  screenshotIdentifierToBaseName,
  screenshotIdentifierToBackendName,
} from "./screenshot-identifier";

export interface DomDiffMapEntry {
  /**
   * 3-lines-of-context diff. An entry only exists for screenshots with a real
   * DOM diff, so this is always set (identical screenshots have no map entry).
   */
  diffPath: string | null;
  /**
   * Full-file-context diff (same hunks as `diffPath`, more surrounding lines).
   * `null` when the full-context fetch failed while the canonical fetch
   * succeeded (check `diffPath`: it is non-null, so the canonical diff is still
   * usable and a warning was logged).
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

/** One entry of `replay_diffs.data.screenshotDiffResults` (the fields we use). */
interface ScreenshotDiffResultEntry {
  identifier?: ScreenshotIdentifier;
  outcome?: string;
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
 * Fetch per-screenshot DOM diffs for every replay diff in `debugContext` and
 * write `<label>-<baseName>.diff` (3 lines of context), a sibling
 * `<label>-<baseName>.full.diff` (full-file context), and `<label>.summary.txt`
 * under `debug-data/dom-diffs/`.
 *
 * Enumeration is driven by the replay diff's `screenshotDiffResults`
 * (downloaded to `debug-data/diffs/<replayDiffId>.json`), which is the
 * authoritative set of compared screenshots — each entry carries the
 * `identifier` (so we can derive the backend name directly, without consulting
 * the curated `timeline.json`) and the `outcome`. We only call the DOM-diff API
 * for outcomes that represent a real visual difference; `no-diff` screenshots
 * are recorded as identical without an API round-trip. Per-screenshot fetch
 * errors are logged and recorded as `skipped-error`; the pipeline never fails
 * on a fetch error.
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

  const pairs = collectReplayDiffPairs(debugContext);
  if (pairs.length === 0) {
    return domDiffMap;
  }

  const replaysDir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "replays");
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

    const results = readScreenshotDiffResults(workspaceDir, pair.replayDiffId);
    if (results == null) {
      console.warn(
        chalk.yellow(
          `  Warning: Skipping DOM diffs for ${pair.label}: replay diff JSON (diffs/${pair.replayDiffId}.json) is missing or unreadable — fall back to diffing <name>.html files on disk`,
        ),
      );
      continue;
    }
    if (results.length === 0) {
      continue;
    }

    mkdirSync(domDiffsDir, { recursive: true });

    const tasks = results.map((result) =>
      resolveScreenshot({
        pair,
        result,
        replaysDir,
        domDiffsDir,
        limit,
        fetchScreenshotDiff,
        client,
      }),
    );
    const resolved = await Promise.all(tasks);

    const summaryRows: SummaryRow[] = [];
    for (const result of resolved) {
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
        `  Skipped ${skippedUnsupportedCount} screenshot DOM diff(s) with unsupported identifier (e.g. redacted variant) — fall back to diffing <name>.html files on disk`,
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
  result: ScreenshotDiffResultEntry;
  replaysDir: string;
  domDiffsDir: string;
  limit: ReturnType<typeof pLimit>;
  fetchScreenshotDiff: typeof getScreenshotDomDiff;
  client: MeticulousClient;
}): Promise<ScreenshotResolution | null> => {
  const {
    pair,
    result,
    replaysDir,
    domDiffsDir,
    limit,
    fetchScreenshotDiff,
    client,
  } = args;

  const identifier = result.identifier;
  if (identifier == null) {
    return null;
  }

  const screenshotBaseName = screenshotIdentifierToBaseName(identifier);
  if (screenshotBaseName == null || !isSafePathSegment(screenshotBaseName)) {
    return null;
  }

  const outcome = result.outcome;
  const url = readUrlForScreenshot(replaysDir, pair, screenshotBaseName);

  // No head/base pair to diff — record which side has the screenshot.
  if (outcome === "missing-base") {
    return onlyInRow(screenshotBaseName, "only-in-head", url);
  }
  if (outcome === "missing-head") {
    return onlyInRow(screenshotBaseName, "only-in-base", url);
  }
  if (outcome === "missing-base-and-head") {
    return null;
  }

  // `no-diff`: the DOM diff is empty by definition — record identical without
  // an API round-trip. No `mapEntry`: an all-null entry gives the agent nothing
  // to navigate to (the identical status is in the summary), and emitting one
  // per compared screenshot would bloat the context for diff-free replays.
  if (outcome === "no-diff") {
    return {
      summaryRow: {
        screenshotBaseName,
        status: "identical",
        totalHunks: 0,
        bytes: 0,
        url,
      },
      mapEntry: null,
    };
  }

  // A visual difference (`diff` / `flake` / `different-size`, or any
  // unknown/future outcome we default to fetching). Derive the backend name
  // directly from the identifier — redacted/unknown variants can't be named.
  const backendName = screenshotIdentifierToBackendName(identifier);
  if (backendName == null) {
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
      // Pixel-diffed but DOM-identical — same as `no-diff`: nothing to navigate
      // to, so no map entry (the identical status is in the summary).
      return {
        summaryRow: {
          screenshotBaseName,
          status: "identical",
          totalHunks: 0,
          bytes: 0,
          url,
        },
        mapEntry: null,
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

const onlyInRow = (
  screenshotBaseName: string,
  status: "only-in-head" | "only-in-base",
  url: string | null,
): ScreenshotResolution => ({
  summaryRow: { screenshotBaseName, status, totalHunks: 0, bytes: 0, url },
  mapEntry: null,
});

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

/**
 * Reads `screenshotDiffResults` from the replay diff JSON downloaded to
 * `debug-data/diffs/<replayDiffId>.json`. Returns `null` when the file is
 * absent or unreadable (the caller skips the pair — the agent can still diff
 * the on-disk `<name>.html` files).
 */
const readScreenshotDiffResults = (
  workspaceDir: string,
  replayDiffId: string,
): ScreenshotDiffResultEntry[] | null => {
  const file = join(
    workspaceDir,
    DEBUG_DATA_DIRECTORY,
    "diffs",
    `${replayDiffId}.json`,
  );
  if (!existsSync(file)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8")) as {
      data?: { screenshotDiffResults?: ScreenshotDiffResultEntry[] };
    };
    return raw?.data?.screenshotDiffResults ?? null;
  } catch (error) {
    // Malformed JSON (e.g. a truncated download) — log the actual parse error
    // so a real breakage is distinguishable from a benign absent/empty file.
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      chalk.yellow(
        `  Warning: Could not parse replay diff JSON (diffs/${replayDiffId}.json): ${message}`,
      ),
    );
    return null;
  }
};

const readUrlForScreenshot = (
  replaysDir: string,
  pair: ReplayDiffPair,
  screenshotBaseName: string,
): string | null => {
  const headPath = join(
    replaysDir,
    "head",
    pair.headReplayId,
    "screenshots",
    `${screenshotBaseName}.metadata.json`,
  );
  const basePath = join(
    replaysDir,
    "base",
    pair.baseReplayId,
    "screenshots",
    `${screenshotBaseName}.metadata.json`,
  );
  const metadataPath = existsSync(headPath)
    ? headPath
    : existsSync(basePath)
      ? basePath
      : null;
  return metadataPath ? readUrlFromMetadata(metadataPath) : null;
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
