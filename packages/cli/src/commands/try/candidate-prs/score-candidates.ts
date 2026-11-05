import { isDependencyManifest, isFrontendFile } from "./classify-files";
import { detectBugSignals } from "./detect-bug-signals";
import type {
  BugSignals,
  CandidatePr,
  FileChange,
  GitCommit,
  MergedPr,
} from "./types";

const SECONDS_PER_DAY = 86_400;
const REFACTOR_WORDING =
  /\b(refactor\w*|migrat\w*|rewrite|rewrote|redesign\w*|restyl\w*|overhaul\w*|revamp\w*|theme|design system|upgrade\w*)\b/i;
const DEPENDENCY_WORDING = /\b(bump\w*|upgrade\w*|update\w*)\b/i;
const IS_REVERT = /^Revert\b/i;

/**
 * Turns merged PRs into ranked backtest candidates: the ones most likely to
 * show what Meticulous catches come first — PRs later reverted or followed by
 * fixes to the same UI files, then meaningful UI changes and broad refactors.
 * PRs that touch no UI code are dropped.
 */
export const scoreCandidates = (options: {
  prs: MergedPr[];
  commits: GitCommit[];
  appPath: string;
  nowSeconds: number;
}): CandidatePr[] =>
  options.prs
    .filter((pr) => !IS_REVERT.test(pr.title))
    .map((pr) => scoreCandidate({ ...options, pr }))
    .filter((candidate): candidate is CandidatePr => candidate !== null)
    .sort(
      (a, b) =>
        b.score - a.score || Date.parse(b.mergedAt) - Date.parse(a.mergedAt),
    );

const scoreCandidate = (options: {
  pr: MergedPr;
  commits: GitCommit[];
  appPath: string;
  nowSeconds: number;
}): CandidatePr | null => {
  const { pr, commits, appPath, nowSeconds } = options;
  const uiChanges = pr.files.filter((file) =>
    isFrontendFile(file.path, appPath),
  );
  const dependencyUpgrade =
    DEPENDENCY_WORDING.test(pr.title) &&
    pr.files.some((file) => isDependencyManifest(file.path, appPath));
  if (uiChanges.length === 0 && !dependencyUpgrade) {
    return null;
  }

  const frontendFiles = uiChanges.map((file) => file.path);
  const signals = detectBugSignals({ pr, frontendFiles, commits });
  const refactor = isRefactor(pr.title, uiChanges);
  const linesChanged = sumLines(uiChanges);

  const parts = [
    bugSignalScore(signals),
    sizeScore(linesChanged, uiChanges.length),
    refactor
      ? {
          points: 12,
          reason: "broad refactor/redesign: high risk of unintended UI changes",
        }
      : null,
    dependencyUpgrade
      ? { points: 10, reason: "dependency upgrade touching the app" }
      : null,
    recencyScore(nowSeconds - pr.mergedAt),
  ].filter((part): part is ScorePart => part !== null);

  return {
    prNumber: pr.prNumber,
    title: pr.title,
    kind: pr.kind,
    baseSha: pr.baseSha,
    headSha: pr.headSha,
    mergedAt: new Date(pr.mergedAt * 1000).toISOString(),
    author: pr.author,
    frontendFiles,
    frontendLinesChanged: linesChanged,
    totalFilesChanged: pr.files.length,
    signals: { ...signals, refactor, dependencyUpgrade },
    score: parts.reduce((total, part) => total + part.points, 0),
    reasons: parts
      .map((part) => part.reason)
      .filter((reason): reason is string => reason !== null),
  };
};

interface ScorePart {
  points: number;
  reason: string | null;
}

const bugSignalScore = (signals: BugSignals): ScorePart | null => {
  const reasons: string[] = [];
  let points = 0;
  if (signals.revertedBy) {
    points += 60;
    reasons.push(
      `reverted ${signals.revertedBy.daysAfter}d later by ${signals.revertedBy.sha.slice(0, 8)} ("${signals.revertedBy.subject}")`,
    );
  }
  const fixes = signals.followUpFixes;
  if (fixes.length > 0) {
    points += 20 + 5 * Math.min(fixes.length - 1, 2);
    reasons.push(
      `${fixes.length} fix-like commit(s) touched the same UI files within days (first: ${fixes[0].sha.slice(0, 8)} "${fixes[0].subject}", +${fixes[0].daysAfter}d)`,
    );
  }
  return points > 0 ? { points, reason: reasons.join("; ") } : null;
};

const sizeScore = (lines: number, files: number): ScorePart => {
  const where = `${lines} UI lines across ${files} file(s)`;
  if (lines >= 30 && lines <= 800) {
    return {
      points: 20 + Math.min(files, 10),
      reason: `meaningful size: ${where}`,
    };
  }
  if (lines > 800 && lines <= 2500) {
    return {
      points: 10 + Math.min(files, 10),
      reason: `large change: ${where}`,
    };
  }
  if (lines > 2500) {
    return {
      points: Math.min(files, 10),
      reason: `very large change (diffs harder to attribute): ${where}`,
    };
  }
  return {
    points: (lines >= 10 ? 8 : 2) + Math.min(files, 10),
    reason: `small change: ${where}`,
  };
};

const recencyScore = (ageSeconds: number): ScorePart | null => {
  const days = ageSeconds / SECONDS_PER_DAY;
  if (days <= 30) {
    return { points: 5, reason: null };
  }
  if (days <= 60) {
    return { points: 2, reason: null };
  }
  return null;
};

const isRefactor = (title: string, uiChanges: FileChange[]): boolean => {
  if (REFACTOR_WORDING.test(title) && uiChanges.length >= 3) {
    return true;
  }
  if (uiChanges.length < 15) {
    return false;
  }
  const added = uiChanges.reduce((total, file) => total + file.added, 0);
  const deleted = uiChanges.reduce((total, file) => total + file.deleted, 0);
  return Math.min(added, deleted) / Math.max(added, deleted, 1) >= 0.4;
};

const sumLines = (changes: FileChange[]): number =>
  changes.reduce((total, file) => total + file.added + file.deleted, 0);
