import { execFileSync } from "child_process";
import { createHash } from "crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { basename, dirname, join } from "path";
import { MeticulousClient } from "@alwaysmeticulous/client";
import { getMeticulousLocalDataDir } from "@alwaysmeticulous/common";
import chalk from "chalk";
import { computeInvestigationFocus } from "./compute-investigation-focus";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import { DebugContext } from "./debug.types";
import { extractScreenshotDomFiles } from "./extract-screenshot-dom-files";
import { fetchDomDiffs, type DomDiffMap } from "./fetch-dom-diffs";
import type { InvestigationFocus, SidecarRef } from "./focus.types";
import { generateDebugDerivedFiles } from "./generate-debug-derived-files";
import { screenshotIdentifierToFilename } from "./screenshot-identifier";

interface TimelineEntry {
  kind: string;
  virtualTimeStart?: number;
  virtualTimeEnd?: number;
  data?: {
    identifier?: {
      type?: string;
      eventNumber?: number;
      logicVersion?: number | null;
      variant?: string | null;
    };
    message?: string;
    warning?: string;
    [key: string]: unknown;
  };
}

interface TimelineStatsJson {
  countByType?: Record<string, number>;
}

export interface FileMetadataEntry {
  path: string;
  bytes: number;
  lines: number;
}

export interface ScreenshotMapEntry {
  replayId: string;
  replayRole: string;
  filename: string;
  virtualTimeStart: number | null;
  virtualTimeEnd: number | null;
  eventNumber: number | null;
  /** Name of the `before.dom` HTML file in the replay's `screenshots/`, or `null` if missing. */
  htmlFilename: string | null;
  /** Name of the `after.dom` HTML file, or `null` when the screenshot captured no after DOM. */
  afterHtmlFilename: string | null;
}

export interface ReplayComparisonEntry {
  replayId: string;
  role: string;
  totalEvents: number | null;
  totalNetworkRequests: number | null;
  totalAnimationFrames: number | null;
  totalVirtualTimeMs: number | null;
  screenshotCount: number | null;
}

const TEMPLATES_DIR = join(__dirname, "templates");

/** Filenames of sidecars written next to `context.json` under `debug-data/`. */
const SCREENSHOT_INDEX_FILENAME = "screenshot-index.json";
const DOM_DIFF_INDEX_FILENAME = "dom-diff-index.json";

/**
 * Arguments passed to a {@link WriteContextJson} implementation. Bundled into
 * a single object so the SDK can add new fields without breaking existing
 * overrides.
 */
export interface WriteContextJsonArgs {
  debugContext: DebugContext;
  workspaceDir: string;
  fileMetadata: FileMetadataEntry[];
  projectRepoDir: string | undefined;
  /**
   * Focus-scoped screenshot map (small, suitable for inlining). See
   * {@link screenshotMapSidecar} for the unfiltered map.
   */
  screenshotMap: Record<string, ScreenshotMapEntry>;
  /**
   * Reference to the sidecar containing the full unfiltered screenshot map.
   * Always written next to `context.json` regardless of whether `screenshotMap`
   * is filtered.
   */
  screenshotMapSidecar: SidecarRef;
  replayComparison: ReplayComparisonEntry[];
  /**
   * Focus-scoped DOM-diff map (only entries with `diffPath != null`). See
   * {@link domDiffMapSidecar} for the unfiltered map.
   */
  domDiffMap: DomDiffMap;
  /**
   * Reference to the sidecar containing the full unfiltered DOM-diff map
   * (including entries where DOMs were identical or skipped). Always written.
   */
  domDiffMapSidecar: SidecarRef;
  /** Investigation focus computed for this workspace. */
  investigationFocus: InvestigationFocus;
}

export type WriteContextJson = (args: WriteContextJsonArgs) => void;

export interface GenerateDebugWorkspaceOptions {
  client: MeticulousClient;
  debugContext: DebugContext;
  workspaceDir: string;
  projectRepoDir: string | undefined;
  maxConcurrency?: number | undefined;
  additionalTemplatesDir?: string | undefined;
  writeContextJson?: WriteContextJson | undefined;
}

export const generateDebugWorkspace = async (
  options: GenerateDebugWorkspaceOptions,
): Promise<void> => {
  const { client, debugContext, workspaceDir } = options;

  const claudeDir = join(workspaceDir, ".claude");
  mkdirSync(claudeDir, { recursive: true });

  copyClaudeMd(workspaceDir, options.additionalTemplatesDir);
  generateFilteredLogs(workspaceDir);
  generateLogDiffs(debugContext, workspaceDir);
  generateDiffSummaries(workspaceDir);
  generatePrDiff(debugContext, workspaceDir);
  generateParamsDiffs(debugContext, workspaceDir);
  generateAssetsDiff(debugContext, workspaceDir);
  generateTimelineSummaries(workspaceDir);
  generateSessionSummaries(debugContext, workspaceDir);
  prettifySnapshotAssets(workspaceDir);
  extractScreenshotDomFiles(workspaceDir);
  const domDiffMap = await fetchDomDiffs({
    client,
    debugContext,
    workspaceDir,
    maxConcurrency: options.maxConcurrency,
  });
  generateDebugDerivedFiles(workspaceDir);
  const screenshotMap = buildScreenshotMap(debugContext, workspaceDir);
  generateScreenshotContext(debugContext, workspaceDir, screenshotMap);
  const replayComparison = buildReplayComparison(debugContext, workspaceDir);
  const fileMetadata = collectFileMetadata(debugContext, workspaceDir);

  const writeCtx = options.writeContextJson ?? defaultWriteContextJson;
  writeCtx({
    debugContext,
    workspaceDir,
    fileMetadata,
    projectRepoDir: options.projectRepoDir,
    screenshotMap,
    screenshotMapSidecar: {
      $ref: SCREENSHOT_INDEX_FILENAME,
      count: Object.keys(screenshotMap).length,
    },
    replayComparison,
    domDiffMap,
    domDiffMapSidecar: {
      $ref: DOM_DIFF_INDEX_FILENAME,
      count: Object.keys(domDiffMap).length,
    },
    investigationFocus: computeInvestigationFocus({
      debugContext,
      screenshotMap,
      workspaceDir,
    }),
  });

  copyClaudeSubdir(workspaceDir, "rules", options.additionalTemplatesDir);
  copyClaudeSubdir(workspaceDir, "hooks", options.additionalTemplatesDir, {
    makeExecutable: true,
  });
  copyClaudeSubdir(workspaceDir, "agents", options.additionalTemplatesDir);
  copySkills(workspaceDir, options.additionalTemplatesDir);

  const settingsSrc = resolveTemplateFile(
    "settings.json",
    options.additionalTemplatesDir,
  );
  if (settingsSrc) {
    copyFileSync(settingsSrc, join(claudeDir, "settings.json"));
  }
};

// ---------------------------------------------------------------------------
// Template copying (with overlay support)
// ---------------------------------------------------------------------------

const resolveTemplateFile = (
  relativePath: string,
  additionalTemplatesDir: string | undefined,
): string | undefined => {
  if (additionalTemplatesDir) {
    const overlayPath = join(additionalTemplatesDir, relativePath);
    if (existsSync(overlayPath)) {
      return overlayPath;
    }
  }
  const basePath = join(TEMPLATES_DIR, relativePath);
  if (existsSync(basePath)) {
    return basePath;
  }
  return undefined;
};

const copyClaudeMd = (
  workspaceDir: string,
  additionalTemplatesDir: string | undefined,
): void => {
  const src = resolveTemplateFile("CLAUDE.md", additionalTemplatesDir);
  if (src) {
    copyFileSync(src, join(workspaceDir, ".claude", "CLAUDE.md"));
  }
};

const copyClaudeSubdir = (
  workspaceDir: string,
  subdir: string,
  additionalTemplatesDir: string | undefined,
  options: { makeExecutable?: boolean } = {},
): void => {
  const destDir = join(workspaceDir, ".claude", subdir);
  let copied = false;

  const baseSrcDir = join(TEMPLATES_DIR, subdir);
  if (existsSync(baseSrcDir)) {
    const entries = readdirSync(baseSrcDir).filter(
      (f) => !statSync(join(baseSrcDir, f)).isDirectory(),
    );
    if (entries.length > 0) {
      mkdirSync(destDir, { recursive: true });
      for (const filename of entries) {
        const destPath = join(destDir, filename);
        copyFileSync(join(baseSrcDir, filename), destPath);
        if (options.makeExecutable) {
          chmodSync(destPath, 0o755);
        }
      }
      copied = true;
    }
  }

  if (additionalTemplatesDir) {
    const overlaySrcDir = join(additionalTemplatesDir, subdir);
    if (existsSync(overlaySrcDir)) {
      const entries = readdirSync(overlaySrcDir).filter(
        (f) => !statSync(join(overlaySrcDir, f)).isDirectory(),
      );
      if (entries.length > 0) {
        if (!copied) {
          mkdirSync(destDir, { recursive: true });
        }
        for (const filename of entries) {
          const destPath = join(destDir, filename);
          copyFileSync(join(overlaySrcDir, filename), destPath);
          if (options.makeExecutable) {
            chmodSync(destPath, 0o755);
          }
        }
      }
    }
  }
};

const copySkills = (
  workspaceDir: string,
  additionalTemplatesDir: string | undefined,
): void => {
  const skillDirNames = new Set<string>();

  const baseSrcDir = join(TEMPLATES_DIR, "skills");
  if (existsSync(baseSrcDir)) {
    for (const entry of readdirSync(baseSrcDir)) {
      if (statSync(join(baseSrcDir, entry)).isDirectory()) {
        skillDirNames.add(entry);
      }
    }
  }

  if (additionalTemplatesDir) {
    const overlaySrcDir = join(additionalTemplatesDir, "skills");
    if (existsSync(overlaySrcDir)) {
      for (const entry of readdirSync(overlaySrcDir)) {
        if (statSync(join(overlaySrcDir, entry)).isDirectory()) {
          skillDirNames.add(entry);
        }
      }
    }
  }

  for (const skillName of skillDirNames) {
    copyClaudeSubdir(
      workspaceDir,
      join("skills", skillName),
      additionalTemplatesDir,
    );
  }
};

// ---------------------------------------------------------------------------
// Log filtering and diffs
// ---------------------------------------------------------------------------

const generateFilteredLogs = (workspaceDir: string): void => {
  const replaySubDirs = ["head", "base", "other"];
  let count = 0;

  for (const subDir of replaySubDirs) {
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
      const logPath = join(subDirPath, replayId, "logs.deterministic.txt");
      if (!existsSync(logPath)) {
        continue;
      }

      const raw = readFileSync(logPath, "utf8");
      const filtered = filterLogLines(raw);
      writeFileSync(
        join(subDirPath, replayId, "logs.deterministic.filtered.txt"),
        filtered,
      );
      count++;
    }
  }

  if (count > 0) {
    console.log(chalk.green(`  Generated ${count} filtered log file(s)`));
  }
};

const LOG_NOISE_PATTERNS = [
  /https?:\/\/[a-z0-9]+-[a-z0-9-]+-[a-z0-9]+\.tunnel-\d+\.tunnels\.meticulous\.ai/g,
  /https?:\/\/[a-z0-9]+\.tunnel-\d+[^\s'")\]&]*/g,
  /https?:\/\/[a-z0-9-]+\.lhr\.life[^\s'")\]&]*/g,
  /https?:\/\/[a-z0-9-]+\.trycloudflare\.com[^\s'")\]&]*/g,
  /X-Amz-Security-Token=[^\s&"']*/g,
  /X-Amz-Credential=[^\s&"']*/g,
  /X-Amz-Signature=[^\s&"']*/g,
  /X-Amz-Date=[^\s&"']*/g,
  /X-Amz-Expires=[^\s&"']*/g,
  /"distinct_id":"[^"]*"/g,
  /"token":"[^"]*"/g,
  /"\$device_id":"[^"]*"/g,
  /"\$session_id":"[^"]*"/g,
  /"\$anon_distinct_id":"[^"]*"/g,
  /"\$host":"[^"]*"/g,
  /"\$current_url":"[^"]*"/g,
  /"\$referrer":"[^"]*"/g,
  /"\$initial_referrer":"[^"]*"/g,
  /\/_next\/data\/[A-Za-z0-9_-]+\//g,
  /\/_next\/static\/[A-Za-z0-9_-]{8,}\//g,
  /(?<=[-./])[a-f0-9]{12,}(?=\.js)/g,
  /(?<=[-./])[a-f0-9]{12,}(?=\.css)/g,
  /(?<=["'/])[A-Za-z0-9_-]{20,}(?=["'/])/g,
];

const POSTHOG_LINE_PATTERNS = [
  /us\.i\.posthog\.com/,
  /\/decide\?/,
  /\/e\?ip=1/,
  /posthog-js/,
  /\$autocapture/,
  /\$pageview/,
  /\$pageleave/,
  /"event":"\$/,
];

const isPostHogLine = (content: string): boolean =>
  POSTHOG_LINE_PATTERNS.some((p) => p.test(content));

const filterLine = (line: string): string => {
  let result = line;
  for (const pattern of LOG_NOISE_PATTERNS) {
    result = result.replace(
      new RegExp(pattern.source, pattern.flags || "g"),
      "<NOISE>",
    );
  }
  result = result.replace(/\brequest\s+\d+\b/gi, "request <N>");
  return result;
};

const filterLogLines = (raw: string): string => {
  const lines = raw.split("\n");
  const filtered: string[] = [];
  for (const line of lines) {
    if (isPostHogLine(line)) {
      continue;
    }
    filtered.push(filterLine(line));
  }
  return filtered.join("\n");
};

const generateLogDiffs = (
  debugContext: DebugContext,
  workspaceDir: string,
): void => {
  for (const diff of debugContext.replayDiffs) {
    const headLogPath = join(
      workspaceDir,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      diff.headReplayId,
      "logs.deterministic.txt",
    );
    const baseLogPath = join(
      workspaceDir,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "base",
      diff.baseReplayId,
      "logs.deterministic.txt",
    );
    if (!existsSync(headLogPath) || !existsSync(baseLogPath)) {
      continue;
    }
    const baseName = `${diff.headReplayId}-vs-${diff.baseReplayId}`;
    generateLogDiffPair(baseLogPath, headLogPath, workspaceDir, baseName);
  }

  if (
    debugContext.replayDiffs.length === 0 &&
    debugContext.replayIds.length === 2
  ) {
    const [idA, idB] = debugContext.replayIds;
    const pathA = join(
      workspaceDir,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "other",
      idA,
      "logs.deterministic.txt",
    );
    const pathB = join(
      workspaceDir,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "other",
      idB,
      "logs.deterministic.txt",
    );
    if (existsSync(pathA) && existsSync(pathB)) {
      generateLogDiffPair(pathA, pathB, workspaceDir, `${idA}-vs-${idB}`);
    }
  }
};

const generateLogDiffPair = (
  basePath: string,
  headPath: string,
  workspaceDir: string,
  baseName: string,
): void => {
  const diffDir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "log-diffs");
  mkdirSync(diffDir, { recursive: true });

  let rawDiff: string;
  try {
    rawDiff = execFileSync("diff", ["-u", basePath, headPath], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error: any) {
    rawDiff = error?.stdout ?? "";
  }

  if (!rawDiff.trim()) {
    return;
  }

  writeFileSync(join(diffDir, `${baseName}.diff`), rawDiff);

  const filteredDiff = filterLogDiff(rawDiff);
  if (filteredDiff.trim()) {
    writeFileSync(join(diffDir, `${baseName}.filtered.diff`), filteredDiff);
  }

  const summary = summarizeLogDiff(rawDiff);
  writeFileSync(join(diffDir, `${baseName}.summary.txt`), summary);
};

const filterLogDiff = (rawDiff: string): string => {
  const lines = rawDiff.split("\n");
  const filteredLines: string[] = [];

  for (const line of lines) {
    if (!line.startsWith("+") && !line.startsWith("-")) {
      filteredLines.push(line);
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) {
      filteredLines.push(line);
      continue;
    }
    if (isPostHogLine(line)) {
      continue;
    }
    filteredLines.push(filterLine(line));
  }

  return removeIdenticalHunks(filteredLines.join("\n"));
};

const removeIdenticalHunks = (diff: string): string => {
  const parts = diff.split(/^(@@[^@]*@@.*$)/m);
  const result: string[] = [parts[0]];

  for (let i = 1; i < parts.length; i += 2) {
    const hunkHeader = parts[i];
    const hunkBody = parts[i + 1] ?? "";

    const addedLines: string[] = [];
    const removedLines: string[] = [];

    for (const line of hunkBody.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        addedLines.push(line.slice(1));
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        removedLines.push(line.slice(1));
      }
    }

    if (addedLines.join("\n") !== removedLines.join("\n")) {
      result.push(hunkHeader);
      result.push(hunkBody);
    }
  }

  return result.join("");
};

interface CategoryCounts {
  added: number;
  removed: number;
}

const summarizeLogDiff = (rawDiff: string): string => {
  const lines = rawDiff.split("\n");
  let addedCount = 0;
  let removedCount = 0;
  let firstDivergenceLine: number | undefined;
  const categories: Record<string, CategoryCounts> = {};

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+)/);
      if (match && firstDivergenceLine == null) {
        firstDivergenceLine = parseInt(match[1], 10);
      }
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      addedCount++;
      categorizeLogLine(line, categories, "added");
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removedCount++;
      categorizeLogLine(line, categories, "removed");
    }
  }

  const sortedCategories = Object.entries(categories).sort(
    ([, a], [, b]) => b.added + b.removed - (a.added + a.removed),
  );

  const parts: string[] = [
    `Log Diff Summary`,
    `================`,
    ``,
    `Total changed lines: ${addedCount + removedCount} (+${addedCount} in head, -${removedCount} in base)`,
    `First divergence at base log line: ${firstDivergenceLine ?? "unknown"}`,
    ``,
    `Change categories (+ = extra in head, - = extra in base):`,
  ];

  for (const [category, counts] of sortedCategories) {
    const total = counts.added + counts.removed;
    const net = counts.added - counts.removed;
    const netStr =
      net > 0
        ? `net +${net} in head`
        : net < 0
          ? `net ${net} in base`
          : "balanced";
    parts.push(
      `  ${category}: ${total} lines (+${counts.added} / -${counts.removed}, ${netStr})`,
    );
  }

  parts.push(
    "",
    "Tip: Read the .filtered.diff file for a version with tunnel URLs,",
    "PostHog payloads, and S3 tokens stripped. Hunks that only differ",
    "in these noisy values are removed entirely.",
  );

  return parts.join("\n");
};

const categorizeLogLine = (
  line: string,
  categories: Record<string, CategoryCounts>,
  direction: "added" | "removed",
): void => {
  const content = line.slice(1);
  const category = classifyLogContent(content);
  const entry = categories[category] ?? { added: 0, removed: 0 };
  entry[direction]++;
  categories[category] = entry;
};

const classifyLogContent = (content: string): string => {
  if (LOG_NOISE_PATTERNS.some((p) => new RegExp(p.source).test(content))) {
    return "noise (tunnel URLs / tokens / PostHog)";
  }
  if (/\bfetch\b|\bXHR\b|\bnetwork\b|\brequest\b|\bresponse\b/i.test(content)) {
    return "network";
  }
  if (/animation|requestAnimationFrame|rAF/i.test(content)) {
    return "animation frames";
  }
  if (/screenshot/i.test(content)) {
    return "screenshots";
  }
  if (/timer|setTimeout|setInterval|tick/i.test(content)) {
    return "timers";
  }
  if (/navigation|navigate|pushState|replaceState|popstate/i.test(content)) {
    return "navigation";
  }
  if (/priority|ordering|reorder/i.test(content)) {
    return "priority / ordering";
  }
  return "other";
};

// ---------------------------------------------------------------------------
// Diff summaries
// ---------------------------------------------------------------------------

interface DiffScreenshotResult {
  identifier: unknown;
  outcome: string;
  diffToBaseScreenshot?: {
    width?: number;
    height?: number;
    outcome?: string;
    mismatchPixels?: number;
    mismatchFraction?: number;
    diffFullFile?: string;
    changedSectionsClassNames?: string[];
  };
}

const generateDiffSummaries = (workspaceDir: string): void => {
  const diffsDir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "diffs");
  if (!existsSync(diffsDir)) {
    return;
  }

  let count = 0;
  const jsonFiles = readdirSync(diffsDir).filter(
    (f) => f.endsWith(".json") && !f.endsWith(".summary.json"),
  );

  for (const file of jsonFiles) {
    const raw = JSON.parse(readFileSync(join(diffsDir, file), "utf8")) as {
      data?: { screenshotDiffResults?: DiffScreenshotResult[] };
    };

    const results = raw?.data?.screenshotDiffResults ?? [];
    if (results.length === 0) {
      continue;
    }

    const compact = results.map((r) => {
      const dtb = r.diffToBaseScreenshot;
      return {
        identifier: r.identifier,
        outcome: r.outcome,
        ...(dtb
          ? {
              width: dtb.width,
              height: dtb.height,
              mismatchPixels: dtb.mismatchPixels,
              mismatchFraction: dtb.mismatchFraction,
              mismatchPercent:
                dtb.mismatchFraction != null
                  ? `${(dtb.mismatchFraction * 100).toFixed(4)}%`
                  : undefined,
              diffFullFile: dtb.diffFullFile,
              changedSectionsClassNames: dtb.changedSectionsClassNames,
            }
          : {}),
      };
    });

    const summaryFile = file.replace(".json", ".summary.json");
    writeFileSync(
      join(diffsDir, summaryFile),
      JSON.stringify(compact, null, 2),
    );
    count++;
  }

  if (count > 0) {
    console.log(
      chalk.green(`  Generated ${count} compact diff summary(ies) in diffs/`),
    );
  }
};

// ---------------------------------------------------------------------------
// PR diff from project repo
// ---------------------------------------------------------------------------

const generatePrDiff = (
  debugContext: DebugContext,
  workspaceDir: string,
): void => {
  const projectRepoDir = join(workspaceDir, "project-repo");
  if (!existsSync(projectRepoDir)) {
    return;
  }

  const headSha = debugContext.commitSha;
  const baseSha = debugContext.baseCommitSha;
  if (!headSha) {
    return;
  }

  const effectiveBaseSha =
    baseSha ?? resolveBaseShaFromGit(projectRepoDir, headSha);
  if (!effectiveBaseSha) {
    return;
  }

  let diffOutput: string;
  try {
    diffOutput = execFileSync(
      "git",
      ["diff", `${effectiveBaseSha}..${headSha}`],
      { cwd: projectRepoDir, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
    );
  } catch (error: any) {
    diffOutput = error?.stdout ?? "";
  }

  if (diffOutput.trim()) {
    writeFileSync(
      join(workspaceDir, DEBUG_DATA_DIRECTORY, "pr-diff.txt"),
      diffOutput,
    );
    console.log(
      chalk.green(
        `  Generated PR diff (${effectiveBaseSha.slice(0, 8)}..${headSha.slice(0, 8)})`,
      ),
    );
  }
};

const resolveBaseShaFromGit = (
  repoDir: string,
  headSha: string,
): string | undefined => {
  for (const branch of ["origin/main", "origin/master"]) {
    try {
      const mergeBase = execFileSync(
        "git",
        ["merge-base", branch, headSha],
        { cwd: repoDir, encoding: "utf8" },
      ).trim();
      if (mergeBase) {
        return mergeBase;
      }
    } catch {
      // Try next branch name
    }
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Params diffs
// ---------------------------------------------------------------------------

const generateParamsDiffs = (
  debugContext: DebugContext,
  workspaceDir: string,
): void => {
  const paramsFile = "launchBrowserAndReplayParams.json";

  const pairs: Array<{ pathA: string; pathB: string; label: string }> = [];

  for (const diff of debugContext.replayDiffs) {
    pairs.push({
      pathA: join(
        workspaceDir,
        DEBUG_DATA_DIRECTORY,
        "replays",
        "base",
        diff.baseReplayId,
        paramsFile,
      ),
      pathB: join(
        workspaceDir,
        DEBUG_DATA_DIRECTORY,
        "replays",
        "head",
        diff.headReplayId,
        paramsFile,
      ),
      label: `${diff.headReplayId}-vs-${diff.baseReplayId}`,
    });
  }

  if (
    debugContext.replayDiffs.length === 0 &&
    debugContext.replayIds.length === 2
  ) {
    const [idA, idB] = debugContext.replayIds;
    pairs.push({
      pathA: join(
        workspaceDir,
        DEBUG_DATA_DIRECTORY,
        "replays",
        "other",
        idA,
        paramsFile,
      ),
      pathB: join(
        workspaceDir,
        DEBUG_DATA_DIRECTORY,
        "replays",
        "other",
        idB,
        paramsFile,
      ),
      label: `${idA}-vs-${idB}`,
    });
  }

  for (const { pathA, pathB, label } of pairs) {
    if (!existsSync(pathA) || !existsSync(pathB)) {
      continue;
    }
    try {
      const jsonA = sortedJsonString(readFileSync(pathA, "utf8"));
      const jsonB = sortedJsonString(readFileSync(pathB, "utf8"));
      if (jsonA === jsonB) {
        continue;
      }

      const tmpA = join(workspaceDir, ".tmp-params-a.json");
      const tmpB = join(workspaceDir, ".tmp-params-b.json");
      writeFileSync(tmpA, jsonA);
      writeFileSync(tmpB, jsonB);

      let diffOutput: string;
      try {
        diffOutput = execFileSync("diff", ["-u", tmpA, tmpB], {
          encoding: "utf8",
          maxBuffer: 5 * 1024 * 1024,
        });
      } catch (diffError: any) {
        diffOutput = diffError?.stdout ?? "";
      } finally {
        safeUnlink(tmpA);
        safeUnlink(tmpB);
      }

      if (diffOutput.trim()) {
        const diffsDir = join(
          workspaceDir,
          DEBUG_DATA_DIRECTORY,
          "params-diffs",
        );
        mkdirSync(diffsDir, { recursive: true });
        writeFileSync(join(diffsDir, `${label}.diff`), diffOutput);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  Warning: Could not diff params for ${label}: ${message}`);
    }
  }

  const diffsDir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "params-diffs");
  if (existsSync(diffsDir) && readdirSync(diffsDir).length > 0) {
    console.log(
      chalk.green("  Generated replay params diff(s) in params-diffs/"),
    );
  }
};

const sortedJsonString = (raw: string): string => {
  const parsed: unknown = JSON.parse(raw);
  return JSON.stringify(sortObjectKeys(parsed), null, 2);
};

const sortObjectKeys = (value: unknown): unknown => {
  if (value == null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
};

const safeUnlink = (filePath: string): void => {
  try {
    unlinkSync(filePath);
  } catch {
    // Non-critical
  }
};

// ---------------------------------------------------------------------------
// Assets diffs
// ---------------------------------------------------------------------------

const generateAssetsDiff = (
  debugContext: DebugContext,
  workspaceDir: string,
): void => {
  for (const diff of debugContext.replayDiffs) {
    const headAssetsDir = join(
      workspaceDir,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      diff.headReplayId,
      "snapshotted-assets",
    );
    const baseAssetsDir = join(
      workspaceDir,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "base",
      diff.baseReplayId,
      "snapshotted-assets",
    );

    const report = compareAssetDirs(baseAssetsDir, headAssetsDir);
    if (!report) {
      continue;
    }

    const diffsDir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "assets-diffs");
    mkdirSync(diffsDir, { recursive: true });
    writeFileSync(
      join(diffsDir, `${diff.headReplayId}-vs-${diff.baseReplayId}.txt`),
      report,
    );
  }

  const diffsDir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "assets-diffs");
  if (existsSync(diffsDir) && readdirSync(diffsDir).length > 0) {
    console.log(
      chalk.green("  Generated snapshotted assets diff(s) in assets-diffs/"),
    );
  }
};

const compareAssetDirs = (
  baseDir: string,
  headDir: string,
): string | undefined => {
  const baseFiles = listAssetFiles(baseDir);
  const headFiles = listAssetFiles(headDir);

  if (baseFiles.size === 0 && headFiles.size === 0) {
    return undefined;
  }

  const allNames = new Set([...baseFiles.keys(), ...headFiles.keys()]);
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];

  for (const name of [...allNames].sort()) {
    const baseInfo = baseFiles.get(name);
    const headInfo = headFiles.get(name);
    if (!baseInfo) {
      added.push(`  + ${name} (${headInfo?.size ?? 0} bytes)`);
    } else if (!headInfo) {
      removed.push(`  - ${name} (${baseInfo.size} bytes)`);
    } else if (baseInfo.hash !== headInfo.hash) {
      changed.push(`  ~ ${name} (${baseInfo.size} -> ${headInfo.size} bytes)`);
    } else {
      unchanged.push(name);
    }
  }

  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    return undefined;
  }

  const parts: string[] = [
    "Snapshotted Assets Diff",
    "=======================",
    `Total: ${allNames.size} files (${added.length} added, ${removed.length} removed, ${changed.length} changed, ${unchanged.length} unchanged)`,
    "",
  ];

  if (added.length > 0) {
    parts.push("Added:", ...added, "");
  }
  if (removed.length > 0) {
    parts.push("Removed:", ...removed, "");
  }
  if (changed.length > 0) {
    parts.push("Changed:", ...changed, "");
  }

  return parts.join("\n");
};

const listAssetFiles = (
  dir: string,
): Map<string, { size: number; hash: string }> => {
  const result = new Map<string, { size: number; hash: string }>();
  if (!existsSync(dir)) {
    return result;
  }

  const walk = (currentDir: string, relativeTo: string): void => {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = relativeTo
        ? `${relativeTo}/${entry.name}`
        : entry.name;
      if (entry.isDirectory()) {
        walk(join(currentDir, entry.name), relativePath);
      } else {
        const content = readFileSync(join(currentDir, entry.name));
        const hash = createHash("md5").update(content).digest("hex");
        result.set(relativePath, { size: content.length, hash });
      }
    }
  };

  walk(dir, "");
  return result;
};

// ---------------------------------------------------------------------------
// Timeline summaries
// ---------------------------------------------------------------------------

const generateTimelineSummaries = (workspaceDir: string): void => {
  const replaySubDirs = ["head", "base", "other"];
  let count = 0;

  for (const subDir of replaySubDirs) {
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
      const timelinePath = join(subDirPath, replayId, "timeline.json");
      if (!existsSync(timelinePath)) {
        continue;
      }

      const timeline = JSON.parse(
        readFileSync(timelinePath, "utf8"),
      ) as TimelineEntry[];
      if (!Array.isArray(timeline)) {
        continue;
      }

      const summary = summarizeTimeline(timeline, replayId, subDir);
      const summaryDir = join(
        workspaceDir,
        DEBUG_DATA_DIRECTORY,
        "timeline-summaries",
      );
      mkdirSync(summaryDir, { recursive: true });
      writeFileSync(join(summaryDir, `${subDir}-${replayId}.txt`), summary);
      count++;
    }
  }

  if (count > 0) {
    console.log(
      chalk.green(
        `  Generated ${count} timeline summary(ies) in timeline-summaries/`,
      ),
    );
  }
};

const summarizeTimeline = (
  timeline: TimelineEntry[],
  replayId: string,
  role: string,
): string => {
  const eventKindCounts: Record<string, number> = {};
  const screenshotEntries: Array<{
    filename: string;
    virtualTime: number | undefined;
  }> = [];
  let navigationCount = 0;
  let networkRequestCount = 0;
  let animationFrameCount = 0;
  let consoleMessageCount = 0;
  let firstVirtualTime: number | undefined;
  let lastVirtualTime: number | undefined;
  const flakinessWarnings: Array<{
    kind: string;
    message: string;
    virtualTime: number | undefined;
  }> = [];

  for (const entry of timeline) {
    const kind = entry.kind;
    eventKindCounts[kind] = (eventKindCounts[kind] ?? 0) + 1;

    const vt = entry.virtualTimeStart;
    if (vt != null) {
      if (firstVirtualTime == null || vt < firstVirtualTime) {
        firstVirtualTime = vt;
      }
      if (lastVirtualTime == null || vt > lastVirtualTime) {
        lastVirtualTime = vt;
      }
    }

    if (kind.startsWith("potentialFlakinessWarning")) {
      flakinessWarnings.push({
        kind,
        message:
          entry.data?.message ??
          entry.data?.warning ??
          JSON.stringify(entry.data ?? {}),
        virtualTime: vt,
      });
    }

    switch (kind) {
      case "screenshot": {
        const filename = entry.data?.identifier
          ? screenshotIdentifierToFilename(entry.data.identifier)
          : undefined;
        screenshotEntries.push({
          filename: filename ?? "unknown",
          virtualTime: vt,
        });
        break;
      }
      case "initialNavigation":
      case "navigation":
        navigationCount++;
        break;
      case "pollyReplay":
        networkRequestCount++;
        break;
      case "jsReplay":
        animationFrameCount++;
        break;
      default:
        if (kind.startsWith("consoleMessage")) {
          consoleMessageCount++;
        }
        break;
    }
  }

  const totalVirtualTimeMs =
    firstVirtualTime != null && lastVirtualTime != null
      ? lastVirtualTime - firstVirtualTime
      : undefined;

  const sortedKinds = Object.entries(eventKindCounts).sort(
    ([, a], [, b]) => b - a,
  );

  const parts: string[] = [
    `Timeline Summary: ${role}/${replayId}`,
    "=".repeat(40 + role.length + replayId.length),
    "",
    `Total timeline entries: ${timeline.length}`,
    `Total virtual time: ${totalVirtualTimeMs != null ? `${totalVirtualTimeMs}ms` : "unknown"}`,
    `Virtual time range: ${firstVirtualTime ?? "?"} - ${lastVirtualTime ?? "?"}`,
    "",
    "Key counts:",
    `  Screenshots: ${screenshotEntries.length}`,
    `  Navigations: ${navigationCount}`,
    `  Network requests: ${networkRequestCount}`,
    `  Animation frames (jsReplay): ${animationFrameCount}`,
    `  Console messages: ${consoleMessageCount}`,
    "",
    "All event kinds:",
  ];

  for (const [kind, count] of sortedKinds) {
    parts.push(`  ${kind}: ${count}`);
  }

  if (screenshotEntries.length > 0) {
    parts.push("", "Screenshots:");
    for (const ss of screenshotEntries) {
      parts.push(
        `  ${ss.filename}  @ virtualTime ${ss.virtualTime != null ? `${ss.virtualTime}ms` : "unknown"}`,
      );
    }
  }

  if (flakinessWarnings.length > 0) {
    parts.push("", "Potential flakiness warnings:");
    for (const fw of flakinessWarnings) {
      parts.push(
        `  [${fw.kind}] @ virtualTime ${fw.virtualTime != null ? `${fw.virtualTime}ms` : "unknown"}`,
      );
      parts.push(`    ${fw.message}`);
    }
  }

  return parts.join("\n");
};

// ---------------------------------------------------------------------------
// Prettify snapshot assets
// ---------------------------------------------------------------------------

const MAX_ASSET_SIZE_BYTES = 1024 * 1024;

const prettifySnapshotAssets = (workspaceDir: string): void => {
  const prettierPath = findPrettier();
  if (!prettierPath) {
    console.log(
      chalk.gray("  Skipping asset formatting (prettier not found on PATH)."),
    );
    return;
  }

  const replaySubDirs = ["head", "base", "other"];
  let copiedCount = 0;
  let skippedLargeCount = 0;

  for (const subDir of replaySubDirs) {
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
      const assetsDir = join(subDirPath, replayId, "snapshotted-assets");
      if (!existsSync(assetsDir)) {
        continue;
      }

      let assetFiles: string[];
      try {
        assetFiles = findAssetFilesRecursive(assetsDir, "");
      } catch {
        continue;
      }

      if (assetFiles.length === 0) {
        continue;
      }

      const formattedDir = join(
        workspaceDir,
        DEBUG_DATA_DIRECTORY,
        "formatted-assets",
        subDir,
        replayId,
      );

      for (const relativePath of assetFiles) {
        const srcPath = join(assetsDir, relativePath);
        const fileSize = statSync(srcPath).size;
        if (fileSize > MAX_ASSET_SIZE_BYTES) {
          skippedLargeCount++;
          continue;
        }
        const destPath = join(formattedDir, relativePath);
        mkdirSync(dirname(destPath), { recursive: true });
        copyFileSync(srcPath, destPath);
        copiedCount++;
      }
    }
  }

  if (copiedCount === 0) {
    return;
  }

  const formattedAssetsDir = join(
    workspaceDir,
    DEBUG_DATA_DIRECTORY,
    "formatted-assets",
  );
  try {
    execFileSync(
      prettierPath,
      ["--write", `${formattedAssetsDir}/**/*.{js,css}`],
      {
        timeout: 120000,
        stdio: "ignore",
      },
    );
    console.log(
      chalk.green(
        `  Formatted ${copiedCount} snapshotted asset(s) in formatted-assets/`,
      ),
    );
  } catch {
    console.log(
      chalk.yellow(
        `  Copied ${copiedCount} snapshotted asset(s) to formatted-assets/ (prettier formatting partially failed)`,
      ),
    );
  }

  if (skippedLargeCount > 0) {
    console.log(
      chalk.gray(
        `  Skipped ${skippedLargeCount} large asset(s) over ${MAX_ASSET_SIZE_BYTES / (1024 * 1024)}MB`,
      ),
    );
  }
};

const findPrettier = (): string | undefined => {
  try {
    const whichResult = execFileSync("which", ["prettier"], {
      encoding: "utf8",
    }).trim();
    if (whichResult) {
      return whichResult;
    }
  } catch {
    // Not on PATH
  }
  return undefined;
};

const findAssetFilesRecursive = (
  baseDir: string,
  relativeTo: string,
): string[] => {
  const results: string[] = [];
  const entries = readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = relativeTo
      ? `${relativeTo}/${entry.name}`
      : entry.name;
    if (entry.isDirectory()) {
      results.push(
        ...findAssetFilesRecursive(join(baseDir, entry.name), relativePath),
      );
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".css")) {
      results.push(relativePath);
    }
  }
  return results;
};

// ---------------------------------------------------------------------------
// Screenshot map & context
// ---------------------------------------------------------------------------

const SCREENSHOT_LOG_CONTEXT_LINES = 30;

const buildScreenshotMap = (
  debugContext: DebugContext,
  workspaceDir: string,
): Record<string, ScreenshotMapEntry> => {
  const map: Record<string, ScreenshotMapEntry> = {};

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
      const timelinePath = join(subDirPath, replayId, "timeline.json");
      if (!existsSync(timelinePath)) {
        continue;
      }

      const timeline = JSON.parse(
        readFileSync(timelinePath, "utf8"),
      ) as unknown[];
      if (!Array.isArray(timeline)) {
        continue;
      }

      const screenshotsDir = join(subDirPath, replayId, "screenshots");

      for (const entry of timeline) {
        const e = entry as TimelineEntry;
        if (e.kind !== "screenshot" || !e.data?.identifier) {
          continue;
        }

        const filename = screenshotIdentifierToFilename(e.data.identifier);
        if (!filename) {
          continue;
        }

        const baseName = filename.endsWith(".png")
          ? filename.slice(0, -".png".length)
          : filename;
        const htmlFilename = `${baseName}.html`;
        const afterHtmlFilename = `${baseName}.after.html`;
        const htmlExists = existsSync(join(screenshotsDir, htmlFilename));
        const afterHtmlExists = existsSync(
          join(screenshotsDir, afterHtmlFilename),
        );

        map[`${subDir}/${replayId}/${filename}`] = {
          replayId,
          replayRole: subDir,
          filename,
          virtualTimeStart: e.virtualTimeStart ?? null,
          virtualTimeEnd: e.virtualTimeEnd ?? null,
          eventNumber: e.data.identifier.eventNumber ?? null,
          htmlFilename: htmlExists ? htmlFilename : null,
          afterHtmlFilename: afterHtmlExists ? afterHtmlFilename : null,
        };
      }
    }
  }

  if (Object.keys(map).length > 0) {
    console.log(
      chalk.green(
        `  Mapped ${Object.keys(map).length} screenshot(s) to virtual timestamps`,
      ),
    );
  }
  return map;
};


const generateScreenshotContext = (
  debugContext: DebugContext,
  workspaceDir: string,
  screenshotMap: Record<string, ScreenshotMapEntry>,
): void => {
  if (!debugContext.screenshot) {
    return;
  }

  const targetScreenshot = debugContext.screenshot;
  let count = 0;

  for (const diff of debugContext.replayDiffs) {
    const headLogPath = join(
      workspaceDir,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      diff.headReplayId,
      "logs.deterministic.txt",
    );
    const baseLogPath = join(
      workspaceDir,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "base",
      diff.baseReplayId,
      "logs.deterministic.txt",
    );

    const headEntry =
      screenshotMap[`head/${diff.headReplayId}/${targetScreenshot}`];
    const baseEntry =
      screenshotMap[`base/${diff.baseReplayId}/${targetScreenshot}`];

    const parts: string[] = [
      `Screenshot Context: ${targetScreenshot}`,
      "=".repeat(40 + targetScreenshot.length),
      "",
    ];

    if (headEntry) {
      parts.push(
        `HEAD (${diff.headReplayId}) @ virtualTime ${headEntry.virtualTimeStart ?? "?"}ms, event ${headEntry.eventNumber ?? "?"}:`,
        "",
      );
      const headContext = extractLogContext(headLogPath, headEntry);
      parts.push(headContext ?? "  (could not extract log context)", "");
    }

    if (baseEntry) {
      parts.push(
        `BASE (${diff.baseReplayId}) @ virtualTime ${baseEntry.virtualTimeStart ?? "?"}ms, event ${baseEntry.eventNumber ?? "?"}:`,
        "",
      );
      const baseContext = extractLogContext(baseLogPath, baseEntry);
      parts.push(baseContext ?? "  (could not extract log context)", "");
    }

    if (headEntry || baseEntry) {
      const contextDir = join(
        workspaceDir,
        DEBUG_DATA_DIRECTORY,
        "screenshot-context",
      );
      mkdirSync(contextDir, { recursive: true });
      writeFileSync(
        join(
          contextDir,
          `${diff.headReplayId}-vs-${diff.baseReplayId}-${targetScreenshot.replace(".png", "")}.txt`,
        ),
        parts.join("\n"),
      );
      count++;
    }
  }

  if (count > 0) {
    console.log(
      chalk.green(
        `  Generated screenshot context for ${targetScreenshot} in screenshot-context/`,
      ),
    );
  }
};

const extractLogContext = (
  logPath: string,
  entry: ScreenshotMapEntry,
): string | undefined => {
  if (!existsSync(logPath) || entry.virtualTimeStart == null) {
    return undefined;
  }

  const lines = readFileSync(logPath, "utf8").split("\n");
  const targetVt = entry.virtualTimeStart;
  let bestLine = -1;
  let bestDist = Infinity;

  for (let i = 0; i < lines.length; i++) {
    if (!/screenshot/i.test(lines[i])) {
      continue;
    }
    const vtMatch = lines[i].match(/\[virtual:\s*([\d.]+)ms\]/);
    if (!vtMatch) {
      continue;
    }
    const vt = parseFloat(vtMatch[1]);
    const dist = Math.abs(vt - targetVt);
    if (dist < bestDist) {
      bestDist = dist;
      bestLine = i;
    }
  }

  if (bestLine < 0) {
    return undefined;
  }

  const start = Math.max(0, bestLine - SCREENSHOT_LOG_CONTEXT_LINES);
  const end = Math.min(
    lines.length,
    bestLine + SCREENSHOT_LOG_CONTEXT_LINES + 1,
  );
  const contextLines = lines.slice(start, end);
  contextLines[bestLine - start] = `>>> ${contextLines[bestLine - start]}`;
  return contextLines.join("\n");
};

// ---------------------------------------------------------------------------
// Replay comparison
// ---------------------------------------------------------------------------

const buildReplayComparison = (
  debugContext: DebugContext,
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

const extractReplayStats = (
  replayDir: string,
): Omit<ReplayComparisonEntry, "replayId" | "role"> => {
  const stats: Omit<ReplayComparisonEntry, "replayId" | "role"> = {
    totalEvents: null,
    totalNetworkRequests: null,
    totalAnimationFrames: null,
    totalVirtualTimeMs: null,
    screenshotCount: null,
  };

  const timelineStatsPath = join(replayDir, "timeline-stats.json");
  if (existsSync(timelineStatsPath)) {
    const timelineStats = JSON.parse(
      readFileSync(timelineStatsPath, "utf8"),
    ) as TimelineStatsJson;
    const counts = timelineStats.countByType ?? {};
    stats.totalEvents = Object.values(counts).reduce((sum, n) => sum + n, 0);
    stats.totalNetworkRequests = counts["pollyReplay"] ?? null;
    stats.totalAnimationFrames = counts["jsReplay"] ?? null;
  }

  const timelinePath = join(replayDir, "timeline.json");
  if (existsSync(timelinePath)) {
    const timeline = JSON.parse(
      readFileSync(timelinePath, "utf8"),
    ) as TimelineEntry[];
    if (Array.isArray(timeline) && timeline.length > 0) {
      let minVt: number | undefined;
      let maxVt: number | undefined;
      for (const entry of timeline) {
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
      if (minVt != null && maxVt != null) {
        stats.totalVirtualTimeMs = Math.round(maxVt - minVt);
      }
    }
  }

  const replayId = basename(replayDir);
  const screenshotsDir = join(
    getMeticulousLocalDataDir(),
    "replays",
    replayId,
    "screenshots",
  );
  if (existsSync(screenshotsDir)) {
    stats.screenshotCount = readdirSync(screenshotsDir).filter((f) =>
      f.endsWith(".png"),
    ).length;
  }

  return stats;
};

// ---------------------------------------------------------------------------
// File metadata
// ---------------------------------------------------------------------------

const collectFileMetadata = (
  debugContext: DebugContext,
  workspaceDir: string,
): FileMetadataEntry[] => {
  const entries: FileMetadataEntry[] = [];

  const replayFiles = [
    "logs.deterministic.txt",
    "logs.deterministic.filtered.txt",
    "logs.concise.txt",
    "timeline.json",
    "timeline-stats.json",
    "metadata.json",
    "launchBrowserAndReplayParams.json",
    "stackTraces.json",
    "accuracyData.json",
  ];

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
      for (const fileName of replayFiles) {
        const filePath = join(subDirPath, replayId, fileName);
        const relativePath = `${DEBUG_DATA_DIRECTORY}/replays/${subDir}/${replayId}/${fileName}`;
        const meta = getFileMetadata(filePath, relativePath);
        if (meta) {
          entries.push(meta);
        }
      }
    }
  }

  for (const sessionId of debugContext.sessionIds) {
    const filePath = join(
      workspaceDir,
      DEBUG_DATA_DIRECTORY,
      "sessions",
      sessionId,
      "data.json",
    );
    const meta = getFileMetadata(
      filePath,
      `${DEBUG_DATA_DIRECTORY}/sessions/${sessionId}/data.json`,
    );
    if (meta) {
      entries.push(meta);
    }

    const summaryPath = join(
      workspaceDir,
      DEBUG_DATA_DIRECTORY,
      "session-summaries",
      `${sessionId}.txt`,
    );
    const summaryMeta = getFileMetadata(
      summaryPath,
      `${DEBUG_DATA_DIRECTORY}/session-summaries/${sessionId}.txt`,
    );
    if (summaryMeta) {
      entries.push(summaryMeta);
    }
  }

  return entries;
};

const getFileMetadata = (
  filePath: string,
  relativePath: string,
): FileMetadataEntry | undefined => {
  if (!existsSync(filePath)) {
    return undefined;
  }
  const buf = readFileSync(filePath);
  let lines = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      lines++;
    }
  }
  return { path: relativePath, bytes: buf.length, lines };
};

// ---------------------------------------------------------------------------
// Session summaries
// ---------------------------------------------------------------------------

interface SessionDataJson {
  userEvents?: {
    window?: { startUrl?: string; width?: number; height?: number };
    event_log?: Array<{ type?: string; timeStamp?: number }>;
  };
  pollyHAR?: {
    pollyHAR?: Record<
      string,
      {
        log?: {
          entries?: Array<{
            request?: { url?: string; method?: string };
            response?: { status?: number };
            time?: number;
          }>;
        };
      }
    >;
  };
  urlHistory?: Array<{ timestamp?: number; url?: string; urlPattern?: string }>;
  randomEvents?: {
    localStorage?: { state?: unknown[] };
    sessionStorage?: { state?: unknown[] };
    indexedDb?: { state?: unknown[] };
  };
  cookies?: unknown[];
  webSocketData?: Array<{ url?: string; events?: unknown[] }>;
  context?: {
    customContext?: Record<string, string | boolean>;
    featureFlags?: Record<string, string | boolean>;
    userId?: string;
    userEmail?: string;
  };
  hostname?: string;
  datetime_first_payload?: string;
  abandoned?: boolean;
  applicationSpecificData?: {
    nextJs?: Record<string, unknown>;
    reactRouter?: Record<string, unknown>;
  };
}

const generateSessionSummaries = (
  debugContext: DebugContext,
  workspaceDir: string,
): void => {
  let count = 0;

  for (const sessionId of debugContext.sessionIds) {
    const dataPath = join(
      workspaceDir,
      DEBUG_DATA_DIRECTORY,
      "sessions",
      sessionId,
      "data.json",
    );
    if (!existsSync(dataPath)) {
      continue;
    }

    try {
      const raw = JSON.parse(readFileSync(dataPath, "utf8")) as SessionDataJson;
      const summary = summarizeSession(raw, sessionId);
      const summaryDir = join(
        workspaceDir,
        DEBUG_DATA_DIRECTORY,
        "session-summaries",
      );
      mkdirSync(summaryDir, { recursive: true });
      writeFileSync(join(summaryDir, `${sessionId}.txt`), summary);
      count++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `  Warning: Could not summarize session ${sessionId}: ${message}`,
      );
    }
  }

  if (count > 0) {
    console.log(
      chalk.green(
        `  Generated ${count} session summary(ies) in session-summaries/`,
      ),
    );
  }
};

const summarizeSession = (data: SessionDataJson, sessionId: string): string => {
  const parts: string[] = [
    `Session Summary: ${sessionId}`,
    "=".repeat(20 + sessionId.length),
    "",
  ];

  const win = data.userEvents?.window;
  parts.push(`Window: ${win?.startUrl ?? "unknown"}`);
  if (win?.width != null && win?.height != null) {
    parts.push(`Viewport: ${win.width} x ${win.height}`);
  }
  parts.push(`Hostname: ${data.hostname ?? "unknown"}`);
  parts.push(`Recorded: ${data.datetime_first_payload ?? "unknown"}`);
  parts.push(`Abandoned: ${data.abandoned ? "yes" : "no"}`);
  parts.push("");

  const history = data.urlHistory ?? [];
  if (history.length > 0) {
    parts.push(`URL History (${history.length} pages):`);
    for (const entry of history) {
      const ts = entry.timestamp != null ? `${entry.timestamp}ms` : "?";
      const pattern = entry.urlPattern
        ? `  [pattern: ${entry.urlPattern}]`
        : "";
      parts.push(`  ${ts}  ${entry.url ?? "unknown"}${pattern}`);
    }
    parts.push("");
  }

  const events = data.userEvents?.event_log ?? [];
  if (events.length > 0) {
    const typeCounts: Record<string, number> = {};
    for (const event of events) {
      typeCounts[event.type ?? "unknown"] =
        (typeCounts[event.type ?? "unknown"] ?? 0) + 1;
    }
    parts.push(`User Events: ${events.length} events`);
    for (const [type, count] of Object.entries(typeCounts).sort(
      ([, a], [, b]) => b - a,
    )) {
      parts.push(`  ${type}: ${count}`);
    }
    parts.push("");
  }

  const harContainer = data.pollyHAR?.pollyHAR;
  if (harContainer) {
    const allEntries = Object.values(harContainer).flatMap(
      (r) => r?.log?.entries ?? [],
    );
    if (allEntries.length > 0) {
      parts.push(`Network Requests: ${allEntries.length} total`);
      const methodCounts: Record<string, number> = {};
      for (const entry of allEntries) {
        const method = entry.request?.method ?? "UNKNOWN";
        methodCounts[method] = (methodCounts[method] ?? 0) + 1;
      }
      parts.push(
        `  Methods: ${Object.entries(methodCounts)
          .sort(([, a], [, b]) => b - a)
          .map(([m, c]) => `${m} ${c}`)
          .join(", ")}`,
      );
      parts.push("");
    }
  }

  const localStorage = data.randomEvents?.localStorage?.state?.length ?? 0;
  const sessionStorage = data.randomEvents?.sessionStorage?.state?.length ?? 0;
  const cookies = data.cookies?.length ?? 0;
  parts.push("Storage:");
  parts.push(`  localStorage: ${localStorage} entries`);
  parts.push(`  sessionStorage: ${sessionStorage} entries`);
  parts.push(`  Cookies: ${cookies}`);
  parts.push("");

  const connections = data.webSocketData ?? [];
  if (connections.length > 0) {
    parts.push(`WebSocket Connections: ${connections.length}`);
    for (const conn of connections) {
      parts.push(
        `  ${conn.url ?? "unknown"} (${conn.events?.length ?? 0} events)`,
      );
    }
    parts.push("");
  }

  const ctx = data.context;
  if (ctx) {
    parts.push("Session Context:");
    if (ctx.userId || ctx.userEmail) {
      parts.push(
        `  User: ${[ctx.userId, ctx.userEmail].filter(Boolean).join(" / ")}`,
      );
    }
    const flags = Object.entries(ctx.featureFlags ?? {});
    if (flags.length > 0) {
      parts.push(
        `  Feature flags: ${flags.map(([k, v]) => `${k}=${v}`).join(", ")}`,
      );
    }
    parts.push("");
  }

  const appData = data.applicationSpecificData;
  if (appData?.nextJs) {
    parts.push("Framework: Next.js");
    if (appData.nextJs.page) {
      parts.push(`  Page: ${appData.nextJs.page}`);
    }
    parts.push("");
  } else if (appData?.reactRouter) {
    parts.push("Framework: React Router");
    parts.push("");
  }

  return parts.join("\n");
};

// ---------------------------------------------------------------------------
// Context JSON generation (default implementation)
// ---------------------------------------------------------------------------

const defaultWriteContextJson: WriteContextJson = (args) => {
  const {
    debugContext,
    workspaceDir,
    fileMetadata,
    projectRepoDir,
    screenshotMap,
    screenshotMapSidecar,
    replayComparison,
    domDiffMap,
    domDiffMapSidecar,
    investigationFocus,
  } = args;

  const headIds = new Set(debugContext.replayDiffs.map((d) => d.headReplayId));
  const baseIds = new Set(debugContext.replayDiffs.map((d) => d.baseReplayId));

  const headReplays: string[] = [];
  const baseReplays: string[] = [];
  const otherReplays: string[] = [];

  for (const id of debugContext.replayIds) {
    if (headIds.has(id)) {
      headReplays.push(id);
    } else if (baseIds.has(id)) {
      baseReplays.push(id);
    } else {
      otherReplays.push(id);
    }
  }

  const context = {
    createdAt: new Date().toISOString(),
    orgProject: debugContext.orgAndProject,
    testRunId: debugContext.testRunId,
    testRunStatus: debugContext.testRunStatus,
    commitSha: debugContext.commitSha,
    baseCommitSha: debugContext.baseCommitSha,
    screenshot: debugContext.screenshot,
    investigationFocus,
    replayDiffs: debugContext.replayDiffs.map((d) => ({
      id: d.id,
      headReplayId: d.headReplayId,
      baseReplayId: d.baseReplayId,
      sessionId: d.sessionId,
      numScreenshotDiffs: d.numScreenshotDiffs,
    })),
    replays: { head: headReplays, base: baseReplays, other: otherReplays },
    sessions: debugContext.sessionIds,
    screenshotMap,
    screenshotMapSidecar,
    replayComparison,
    domDiffMap,
    domDiffMapSidecar,
    paths: {
      replays: "replays/",
      sessions: "sessions/",
      diffs: "diffs/",
      logDiffs: "log-diffs/",
      logDiffsFiltered: "log-diffs/*.filtered.diff",
      logDiffsSummary: "log-diffs/*.summary.txt",
      paramsDiffs: "params-diffs/",
      assetsDiffs: "assets-diffs/",
      timelineSummaries: "timeline-summaries/",
      screenshotContext: "screenshot-context/",
      screenshotIndex: SCREENSHOT_INDEX_FILENAME,
      domDiffs: "dom-diffs/",
      domDiffsSummary: "dom-diffs/*.summary.txt",
      domDiffIndex: DOM_DIFF_INDEX_FILENAME,
      prDiff: "pr-diff.txt",
      formattedAssets: "formatted-assets/",
      testRun: "test-run/",
      projectRepo: projectRepoDir ? "project-repo/" : undefined,
    },
    fileMetadata,
  };

  writeFileSync(
    join(workspaceDir, DEBUG_DATA_DIRECTORY, "context.json"),
    JSON.stringify(context, null, 2),
  );
};
