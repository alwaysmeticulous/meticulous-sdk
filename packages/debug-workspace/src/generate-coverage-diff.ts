import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import type { DebugContext } from "./debug.types";
import type {
  RepoCoverage,
  RepoCoverageByPair,
  RepoCoverageResult,
} from "./fetch-repo-coverage";
import {
  formatLines,
  formatRanges,
  linesInRanges,
  subtractRanges,
  type LineRange,
} from "./line-ranges";
import { parsePrDiff, type PrDiffFile } from "./parse-pr-diff";

const MAX_FILES_PER_SECTION = 100;
const SOURCE_FILE_EXTENSION = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;
const TEST_FILE = /(?:^|\/)__tests__\/|\.(?:test|spec)\.[^/]+$/;

/**
 * Writes `coverage-diff/<head>-vs-<base>.txt` per replay diff, from the
 * coverage Meticulous mapped to repo paths (`fetchRepoCoverage`): which of the
 * PR's changed lines executed in each replay, which files executed in only one
 * replay, and which lines differ in files the PR didn't change. Done for the
 * whole replay and, when one is targeted, for the screenshot's own coverage.
 */
export const generateCoverageDiff = (
  debugContext: DebugContext,
  workspaceDir: string,
  repoCoverage: RepoCoverageByPair,
): void => {
  const debugDataDir = join(workspaceDir, DEBUG_DATA_DIRECTORY);
  const prDiffPath = join(debugDataDir, "pr-diff.txt");
  const prFiles = existsSync(prDiffPath)
    ? parsePrDiff(readFileSync(prDiffPath, "utf8")).filter(isAppSourceFile)
    : null;

  const outDir = join(debugDataDir, "coverage-diff");
  let count = 0;
  for (const diff of debugContext.replayDiffs) {
    const label = `${diff.headReplayId}-vs-${diff.baseReplayId}`;
    const coverage = repoCoverage[label];
    if (coverage == null) {
      continue;
    }
    const sections = formatScopeDiff(
      "Whole replay",
      coverage.wholeReplay,
      prFiles,
    );
    if (coverage.screenshot != null) {
      sections.push(
        "",
        ...formatScopeDiff(
          `Screenshot ${debugContext.screenshot}`,
          coverage.screenshot,
          prFiles,
        ),
      );
    }
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, `${label}.txt`),
      [...HEADER, ...sections].join("\n") + "\n",
    );
    count++;
  }
  if (count > 0) {
    console.log(
      chalk.green(`  Generated ${count} coverage diff(s) in coverage-diff/`),
    );
  }
};

const HEADER = [
  "JS coverage of head (new code) vs base (old code): which source lines executed in each replay.",
  "Paths are repo paths, as Meticulous maps coverage to the repo, so code that maps to no repo file",
  "(e.g. dependencies) isn't listed. Line numbers are each side's own. A file the PR changed is",
  "numbered differently in head and base, so for those only the PR's added lines (head numbering)",
  "and removed lines (base numbering) are compared.",
  "",
];

const formatScopeDiff = (
  title: string,
  result: RepoCoverageResult,
  prFiles: PrDiffFile[] | null,
): string[] => {
  const lines = [`=== ${title}`];
  if (result.kind === "unavailable") {
    return [...lines, `  coverage unavailable: ${result.reason}`];
  }
  const { head, base } = result;

  const prPaths = new Set<string>();
  if (prFiles != null) {
    lines.push("", "== Lines the PR changed that executed");
    for (const prFile of prFiles) {
      [prFile.headPath, prFile.basePath].forEach(
        (path) => path != null && prPaths.add(path),
      );
      if (prFile.addedLines.length === 0 && prFile.removedLines.length === 0) {
        continue;
      }
      lines.push(
        `${prFile.headPath ?? prFile.basePath}`,
        `  head: ${formatChangedLines(prFile.addedLines, "added", head, prFile.headPath)}`,
        `  base: ${formatRemovedLines(prFile, base)}`,
      );
    }
  }

  const headOnly = [...head.keys()].filter(
    (f) => !base.has(f) && !prPaths.has(f),
  );
  const baseOnly = [...base.keys()].filter(
    (f) => !head.has(f) && !prPaths.has(f),
  );
  lines.push(
    "",
    `== Files executed in only one replay (head-only ${headOnly.length}, base-only ${baseOnly.length})`,
  );
  lines.push(...capped(headOnly.map((f) => `head-only ${f}`)));
  lines.push(...capped(baseOnly.map((f) => `base-only ${f}`)));

  const differing = [...head.keys()]
    .filter((f) => base.has(f) && !prPaths.has(f))
    .map((f) => {
      const headRanges = head.get(f) ?? [];
      const baseRanges = base.get(f) ?? [];
      return {
        file: f,
        headOnly: subtractRanges(headRanges, baseRanges),
        baseOnly: subtractRanges(baseRanges, headRanges),
      };
    })
    .filter((d) => d.headOnly.length > 0 || d.baseOnly.length > 0);
  lines.push(
    "",
    `== Files executed in both with different lines (${differing.length})`,
  );
  lines.push(
    ...capped(
      differing.map(
        (d) =>
          `${d.file}  head-only: ${formatRanges(d.headOnly) || "-"}  base-only: ${formatRanges(d.baseOnly) || "-"}`,
      ),
    ),
  );
  return lines;
};

// Both sides' coverage is mapped to the head checkout's paths, so a file the PR
// deleted or moved has no base coverage under its base path even if it ran.
const formatRemovedLines = (prFile: PrDiffFile, base: RepoCoverage): string =>
  prFile.headPath !== prFile.basePath && prFile.removedLines.length > 0
    ? `coverage unknown (${prFile.removedLines.length} removed lines): the PR ${prFile.headPath == null ? "deleted" : "moved"} this file, and coverage maps only to head's paths`
    : formatChangedLines(prFile.removedLines, "removed", base, prFile.basePath);

const formatChangedLines = (
  changed: number[],
  kind: "added" | "removed",
  coverage: RepoCoverage,
  repoPath: string | null,
): string => {
  if (changed.length === 0) {
    return `no ${kind} lines`;
  }
  const ranges: LineRange[] | undefined =
    repoPath != null ? coverage.get(repoPath) : undefined;
  if (ranges == null) {
    return `file not executed (${changed.length} ${kind} lines)`;
  }
  const executed = linesInRanges(changed, ranges);
  return executed.length === 0
    ? `none of ${changed.length} ${kind} lines executed`
    : `${executed.length} of ${changed.length} ${kind} lines executed: ${formatLines(executed)}`;
};

// Only files that can run in the browser: lockfiles, configs and tests never
// show up in coverage.
const isAppSourceFile = (prFile: PrDiffFile): boolean => {
  const path = prFile.headPath ?? prFile.basePath ?? "";
  return SOURCE_FILE_EXTENSION.test(path) && !TEST_FILE.test(path);
};

const capped = (lines: string[]): string[] =>
  lines.length > MAX_FILES_PER_SECTION
    ? [
        ...lines.slice(0, MAX_FILES_PER_SECTION),
        `... ${lines.length - MAX_FILES_PER_SECTION} more`,
      ]
    : lines;
