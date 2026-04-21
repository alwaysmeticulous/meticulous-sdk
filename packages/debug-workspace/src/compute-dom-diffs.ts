import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import chalk from "chalk";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import type { DebugContext } from "./debug.types";
import {
  addContextToHunks,
  computeCanonicalHunks,
  computeFullContextDiff,
  formatDomForDiff,
  formatHunkLines,
} from "./dom-diff/format";

export interface DomDiffMapEntry {
  diffPath: string | null;
  fullDiffPath: string;
  totalHunks: number;
  bytes: number;
  fullDiffBytes: number;
  url: string | null;
}

export type DomDiffMap = Record<string, DomDiffMapEntry>;

interface ReplayPair {
  headReplayId: string;
  baseReplayId: string;
  headRole: "head" | "other";
  baseRole: "base" | "other";
  label: string;
}

interface ScreenshotMetadataShape {
  before?: {
    routeData?: { url?: string };
    dom?: string;
  };
  after?: {
    dom?: string;
  } | null;
}

const CONTEXT_LINES_PER_HUNK = 3;

// Raw (pre-format) DOM size cap per side. Above this, pretty-printing
// and diffing regresses wall-clock and memory sharply. Deliberately an
// order of magnitude larger than `MAX_ASSET_SIZE_BYTES` (1 MB) in
// `prettifySnapshotAssets`: DOM snapshots are one per screenshot, not
// many files per replay.
const MAX_DOM_BYTES_FOR_DIFF = 20 * 1024 * 1024;

/**
 * Compute per-screenshot DOM diffs for every replay pair and write
 * them to `debug-data/dom-diffs/` as `<label>-<baseName>.diff`,
 * `<label>-<baseName>.full.diff`, and per-pair `<label>.summary.txt`,
 * where `<label>` is `<headReplayId>-vs-<baseReplayId>` and
 * `<baseName>` is the metadata filename minus `.metadata.json`.
 *
 * When `replayDiffs` is empty but exactly two replays were downloaded
 * (e.g. `met debug replay --baseReplayId`), the two replays are paired
 * as `<replayIds[0]>-vs-<replayIds[1]>` — input order preserved, to
 * match `generateLogDiffs` and `generateParamsDiffs`.
 */
export const computeDomDiffs = (
  debugContext: DebugContext,
  workspaceDir: string,
): DomDiffMap => {
  const domDiffMap: DomDiffMap = {};

  const replaysDir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "replays");
  if (!existsSync(replaysDir)) {
    return domDiffMap;
  }

  const pairs = collectReplayPairs(debugContext);
  if (pairs.length === 0) {
    return domDiffMap;
  }

  const domDiffsDir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "dom-diffs");

  let totalDiffs = 0;
  let totalFullDiffs = 0;
  let skippedOversize = 0;

  for (const pair of pairs) {
    const headScreenshotsDir = join(
      replaysDir,
      pair.headRole,
      pair.headReplayId,
      "screenshots",
    );
    const baseScreenshotsDir = join(
      replaysDir,
      pair.baseRole,
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

    const summaryRows: SummaryRow[] = [];

    for (const screenshotBaseName of [...allNames].sort()) {
      const headMetadataPath = headScreenshots.get(screenshotBaseName);
      const baseMetadataPath = baseScreenshots.get(screenshotBaseName);

      if (!headMetadataPath || !baseMetadataPath) {
        // Added/removed screenshots are already surfaced in
        // `screenshotDiffResults`; we don't synthesize a diff against
        // an empty side.
        summaryRows.push({
          screenshotBaseName,
          status: !headMetadataPath ? "only-in-base" : "only-in-head",
          totalHunks: 0,
          bytes: 0,
          fullDiffBytes: 0,
          url: null,
        });
        continue;
      }

      let headMetadata: ScreenshotMetadataShape;
      let baseMetadata: ScreenshotMetadataShape;
      try {
        headMetadata = JSON.parse(
          readFileSync(headMetadataPath, "utf-8"),
        ) as ScreenshotMetadataShape;
        baseMetadata = JSON.parse(
          readFileSync(baseMetadataPath, "utf-8"),
        ) as ScreenshotMetadataShape;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        console.warn(
          chalk.yellow(
            `  Warning: Could not parse metadata for ${screenshotBaseName} in ${pair.label}: ${message}`,
          ),
        );
        continue;
      }

      const headDom = headMetadata.before?.dom;
      const baseDom = baseMetadata.before?.dom;
      if (typeof headDom !== "string" || typeof baseDom !== "string") {
        continue;
      }

      if (
        Buffer.byteLength(headDom, "utf-8") > MAX_DOM_BYTES_FOR_DIFF ||
        Buffer.byteLength(baseDom, "utf-8") > MAX_DOM_BYTES_FOR_DIFF
      ) {
        skippedOversize++;
        summaryRows.push({
          screenshotBaseName,
          status: "skipped-oversize",
          totalHunks: 0,
          bytes: 0,
          fullDiffBytes: 0,
          url: headMetadata.before?.routeData?.url ?? null,
        });
        continue;
      }

      const formattedBase = formatDomForDiff(baseDom);
      const formattedHead = formatDomForDiff(headDom);

      const canonicalHunks = computeCanonicalHunks(
        formattedBase,
        formattedHead,
      );

      const fullDiff = computeFullContextDiff(formattedBase, formattedHead);
      const fullDiffFilename = `${pair.label}-${screenshotBaseName}.full.diff`;
      const fullDiffAbsPath = join(domDiffsDir, fullDiffFilename);
      writeFileSync(fullDiffAbsPath, fullDiff);
      totalFullDiffs++;

      let diffRelPath: string | null = null;
      let diffBytes = 0;

      if (canonicalHunks.length > 0) {
        const paddedHunks = addContextToHunks(
          canonicalHunks,
          formattedBase,
          formattedHead,
          CONTEXT_LINES_PER_HUNK,
        );
        const diffBody = paddedHunks
          .map((hunk, index) => {
            const header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@ hunk ${index + 1}/${paddedHunks.length}`;
            return `${header}\n${formatHunkLines(hunk)}`;
          })
          .join("\n\n");
        const diffFilename = `${pair.label}-${screenshotBaseName}.diff`;
        const diffAbsPath = join(domDiffsDir, diffFilename);
        writeFileSync(diffAbsPath, diffBody);
        diffRelPath = `dom-diffs/${diffFilename}`;
        diffBytes = Buffer.byteLength(diffBody, "utf-8");
        totalDiffs++;
      }

      const fullDiffBytes = Buffer.byteLength(fullDiff, "utf-8");
      const url = headMetadata.before?.routeData?.url ?? null;

      domDiffMap[`${pair.label}/${screenshotBaseName}`] = {
        diffPath: diffRelPath,
        fullDiffPath: `dom-diffs/${fullDiffFilename}`,
        totalHunks: canonicalHunks.length,
        bytes: diffBytes,
        fullDiffBytes,
        url,
      };

      summaryRows.push({
        screenshotBaseName,
        status: canonicalHunks.length === 0 ? "identical" : "diff",
        totalHunks: canonicalHunks.length,
        bytes: diffBytes,
        fullDiffBytes,
        url,
      });
    }

    if (summaryRows.length > 0) {
      const summaryContent = renderPairSummary(pair, summaryRows);
      writeFileSync(
        join(domDiffsDir, `${pair.label}.summary.txt`),
        summaryContent,
      );
    }
  }

  if (totalDiffs > 0 || totalFullDiffs > 0) {
    console.log(
      chalk.green(
        `  Generated ${totalDiffs} DOM diff(s) and ${totalFullDiffs} full-context diff(s) in dom-diffs/`,
      ),
    );
  }
  if (skippedOversize > 0) {
    console.log(
      chalk.yellow(
        `  Skipped ${skippedOversize} screenshot DOM pair(s) over ${MAX_DOM_BYTES_FOR_DIFF / (1024 * 1024)} MB`,
      ),
    );
  }

  return domDiffMap;
};

interface SummaryRow {
  screenshotBaseName: string;
  status: "diff" | "identical" | "only-in-head" | "only-in-base" | "skipped-oversize";
  totalHunks: number;
  bytes: number;
  fullDiffBytes: number;
  url: string | null;
}

const renderPairSummary = (
  pair: ReplayPair,
  rows: SummaryRow[],
): string => {
  const diffs = rows.filter((r) => r.status === "diff").length;
  const identical = rows.filter((r) => r.status === "identical").length;
  const onlyHead = rows.filter((r) => r.status === "only-in-head").length;
  const onlyBase = rows.filter((r) => r.status === "only-in-base").length;
  const skipped = rows.filter((r) => r.status === "skipped-oversize").length;

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
    ...(skipped > 0 ? [`  skipped (DOM too large): ${skipped}`] : []),
    "",
    "For each screenshot below, `<name>.diff` contains the canonical",
    "unified diff (context: 3 lines per hunk) and `<name>.full.diff`",
    "contains the same diff with full file context. Both live in",
    "dom-diffs/ alongside this summary. Byte-compatible with",
    "`meticulous agent dom-diff --replayDiffId <id> --screenshotName <name>`.",
    "",
  ].join("\n");

  const tableRows = rows.map((row) => {
    const cells = [
      row.screenshotBaseName,
      row.status,
      String(row.totalHunks),
      formatBytes(row.bytes),
      formatBytes(row.fullDiffBytes),
      row.url ?? "",
    ];
    return cells.join("\t");
  });
  const tableHeader = [
    "screenshot",
    "status",
    "hunks",
    "diff_bytes",
    "full_diff_bytes",
    "url",
  ].join("\t");

  return `${header}${[tableHeader, ...tableRows].join("\n")}\n`;
};

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

const collectReplayPairs = (debugContext: DebugContext): ReplayPair[] => {
  const pairs: ReplayPair[] = [];
  for (const diff of debugContext.replayDiffs) {
    pairs.push({
      headReplayId: diff.headReplayId,
      baseReplayId: diff.baseReplayId,
      headRole: "head",
      baseRole: "base",
      label: `${diff.headReplayId}-vs-${diff.baseReplayId}`,
    });
  }
  if (
    debugContext.replayDiffs.length === 0 &&
    debugContext.replayIds.length === 2
  ) {
    const [idA, idB] = debugContext.replayIds;
    pairs.push({
      headReplayId: idA,
      baseReplayId: idB,
      headRole: "other",
      baseRole: "other",
      label: `${idA}-vs-${idB}`,
    });
  }
  return pairs;
};
