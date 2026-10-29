import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import type { DebugContext } from "./debug.types";
import {
  formatLines,
  formatRanges,
  linesInRanges,
  subtractRanges,
  type LineRange,
} from "./line-ranges";
import { parsePrDiff, type PrDiffFile } from "./parse-pr-diff";
import { listReplayPairs } from "./replay-pairs";

const MAX_FILES_PER_SECTION = 100;
const SOURCE_FILE_EXTENSION = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;
const TEST_FILE = /(?:^|\/)__tests__\/|\.(?:test|spec)\.[^/]+$/;

type Coverage = Map<string, LineRange[]>;

type CoverageMatch =
  | { kind: "found"; file: string }
  | { kind: "ambiguous"; files: string[] }
  | { kind: "not-found" };

const NOT_FOUND: CoverageMatch = { kind: "not-found" };

/**
 * Writes `coverage-diff/<head>-vs-<base>.txt` per compared pair: which of the
 * PR's changed lines executed in each replay, which source files executed in
 * only one replay, and which lines differ in files the PR didn't change. Done
 * for the whole replay and, when one is targeted, for the screenshot's own
 * per-screenshot coverage.
 */
export const generateCoverageDiff = (
  debugContext: DebugContext,
  workspaceDir: string,
): void => {
  const pairs = listReplayPairs(debugContext, workspaceDir);
  if (pairs.length === 0) {
    return;
  }
  const debugDataDir = join(workspaceDir, DEBUG_DATA_DIRECTORY);
  const prDiffPath = join(debugDataDir, "pr-diff.txt");
  const prFiles = existsSync(prDiffPath)
    ? parsePrDiff(readFileSync(prDiffPath, "utf8"))
    : null;
  const screenshotFile = debugContext.screenshot
    ? `${debugContext.screenshot.replace(/\.png$/, "")}.json`
    : undefined;

  const outDir = join(debugDataDir, "coverage-diff");
  let count = 0;
  for (const pair of pairs) {
    const sections = [
      ...formatScopeDiff(
        "Whole replay (mapped-coverage.json)",
        readCoverage(join(pair.headDir, "mapped-coverage.json")),
        readCoverage(join(pair.baseDir, "mapped-coverage.json")),
        prFiles,
      ),
    ];
    if (screenshotFile) {
      const perScreenshot = (dir: string) =>
        readCoverage(
          join(dir, "mapped-per-screenshot-js-coverage", screenshotFile),
        );
      sections.push(
        "",
        ...formatScopeDiff(
          `Screenshot ${debugContext.screenshot} (mapped-per-screenshot-js-coverage/${screenshotFile})`,
          perScreenshot(pair.headDir),
          perScreenshot(pair.baseDir),
          prFiles,
        ),
      );
    }
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, `${pair.label}.txt`),
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
  "Line numbers are each side's own. A file the PR changed is numbered differently in head and base,",
  "so for those only the PR's added lines (head numbering) and removed lines (base numbering) are compared.",
  "",
];

const formatScopeDiff = (
  title: string,
  head: Coverage | null,
  base: Coverage | null,
  prFiles: PrDiffFile[] | null,
): string[] => {
  const lines = [`=== ${title}`];
  if (head == null || base == null || (head.size === 0 && base.size === 0)) {
    return [...lines, "  no coverage recorded for at least one side"];
  }

  const prCoverageFiles = new Set<string>();
  if (prFiles != null) {
    lines.push("", "== Lines the PR changed that executed");
    for (const prFile of prFiles.filter(isAppSourceFile)) {
      const headMatch = prFile.headPath
        ? findCoverageFile(head, prFile.headPath)
        : NOT_FOUND;
      const baseMatch = prFile.basePath
        ? findCoverageFile(base, prFile.basePath)
        : NOT_FOUND;
      [headMatch, baseMatch].forEach(
        (m) => m.kind === "found" && prCoverageFiles.add(m.file),
      );
      if (prFile.addedLines.length === 0 && prFile.removedLines.length === 0) {
        continue;
      }
      lines.push(
        `${prFile.headPath ?? prFile.basePath}`,
        `  head: ${formatChangedLines(prFile.addedLines, "added", head, headMatch)}`,
        `  base: ${formatChangedLines(prFile.removedLines, "removed", base, baseMatch)}`,
      );
    }
  }

  const headOnly = [...head.keys()].filter(
    (f) => !base.has(f) && !prCoverageFiles.has(f),
  );
  const baseOnly = [...base.keys()].filter(
    (f) => !head.has(f) && !prCoverageFiles.has(f),
  );
  lines.push(
    "",
    `== Files executed in only one replay (head-only ${headOnly.length}, base-only ${baseOnly.length})`,
  );
  lines.push(...capped(headOnly.map((f) => `head-only ${f}`)));
  lines.push(...capped(baseOnly.map((f) => `base-only ${f}`)));

  const differing = [...head.keys()]
    .filter((f) => base.has(f) && !prCoverageFiles.has(f))
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

const formatChangedLines = (
  changed: number[],
  kind: "added" | "removed",
  coverage: Coverage,
  match: CoverageMatch,
): string => {
  if (changed.length === 0) {
    return `no ${kind} lines`;
  }
  if (match.kind === "ambiguous") {
    return `can't tell which coverage file this is (${match.files.join(", ")})`;
  }
  const ranges = match.kind === "found" ? coverage.get(match.file) : undefined;
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

/**
 * Coverage paths are relative to the app's own root, which may be a
 * sub-directory of the repo the PR diff is relative to. An exact path wins;
 * otherwise the longest coverage path the repo path ends with (these are all
 * suffixes of one path, so never tie); otherwise a coverage path ending with
 * the repo path, but only if exactly one does.
 */
const findCoverageFile = (
  coverage: Coverage,
  repoPath: string,
): CoverageMatch => {
  const candidates = [...coverage.keys()].map((file) => ({
    file,
    normalized: file.replace(/^(?:webpack:\/\/[^/]*\/)?(?:\.\/)?/, ""),
  }));

  const exact = candidates.find((c) => c.normalized === repoPath);
  if (exact) {
    return { kind: "found", file: exact.file };
  }
  const [longestSuffix] = candidates
    .filter((c) => repoPath.endsWith(`/${c.normalized}`))
    .sort((a, b) => b.normalized.length - a.normalized.length);
  if (longestSuffix) {
    return { kind: "found", file: longestSuffix.file };
  }
  const nested = candidates.filter((c) =>
    c.normalized.endsWith(`/${repoPath}`),
  );
  if (nested.length > 1) {
    return { kind: "ambiguous", files: nested.map((c) => c.file) };
  }
  return nested.length === 1
    ? { kind: "found", file: nested[0].file }
    : NOT_FOUND;
};

const readCoverage = (path: string): Coverage | null => {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    const coverage: Coverage = new Map();
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (
          Array.isArray(item) &&
          typeof item[0] === "string" &&
          Array.isArray(item[1])
        ) {
          coverage.set(item[0], item[1] as LineRange[]);
        }
      }
    }
    return coverage;
  } catch {
    return null;
  }
};
