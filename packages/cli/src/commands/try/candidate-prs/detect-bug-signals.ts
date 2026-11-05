import type { BugSignals, GitCommit, MergedPr, RelatedCommit } from "./types";

export const FOLLOW_UP_WINDOW_DAYS = 14;

const SECONDS_PER_DAY = 86_400;
const REVERTS_COMMIT = /This reverts commit ([0-9a-f]{7,40})/g;
const REVERTS_PR_REFERENCE = /\bReverts? (?:[\w.-]+\/[\w.-]+)?#(\d+)\b/g;
const REVERT_BRANCH = /\/revert-(\d+)-/;
const REVERT_SUBJECT = /^Revert "(.*)"(?:\s*\(#\d+\))?\s*$/;
const FIX_WORDING =
  /\b(fix(es|ed)?|hot-?fix|bug-?fix|bug fix|regression|broke(n)?|revert(s|ed)?|restore[sd]?)\b/i;

/**
 * Evidence that a merged PR introduced a bug: a later revert of it, or
 * fix-worded commits soon after it that touch the same UI files.
 */
export const detectBugSignals = (options: {
  pr: MergedPr;
  frontendFiles: string[];
  commits: GitCommit[];
}): BugSignals => {
  const { pr, frontendFiles, commits } = options;
  const later = commits.filter(
    (commit) => commit.sha !== pr.headSha && commit.committedAt >= pr.mergedAt,
  );

  const revert = later.find((commit) => isRevertOf(commit, pr));
  const touched = new Set(frontendFiles);
  const followUpFixes = later
    .filter((commit) => commit !== revert)
    .filter(
      (commit) =>
        commit.committedAt - pr.mergedAt <=
        FOLLOW_UP_WINDOW_DAYS * SECONDS_PER_DAY,
    )
    .filter((commit) => FIX_WORDING.test(describe(commit)))
    .filter((commit) => commit.files.some((file) => touched.has(file.path)))
    .map((commit) => toRelated(commit, pr));

  return {
    revertedBy: revert ? toRelated(revert, pr) : null,
    followUpFixes,
  };
};

export const isRevertOf = (commit: GitCommit, pr: MergedPr): boolean => {
  const text = `${commit.subject}\n${commit.body}`;
  for (const [, sha] of text.matchAll(REVERTS_COMMIT)) {
    if (pr.headSha.startsWith(sha)) {
      return true;
    }
  }
  for (const [, prNumber] of text.matchAll(REVERTS_PR_REFERENCE)) {
    if (Number(prNumber) === pr.prNumber) {
      return true;
    }
  }
  const branch = commit.subject.match(REVERT_BRANCH);
  if (branch && Number(branch[1]) === pr.prNumber) {
    return true;
  }
  const revertedTitle = firstLine(commit).match(REVERT_SUBJECT)?.[1];
  return revertedTitle != null && revertedTitle.trim() === pr.title.trim();
};

/** Subject plus the first body line, which holds the PR title for merge commits. */
const describe = (commit: GitCommit): string =>
  `${commit.subject} ${commit.body.split("\n")[0] ?? ""}`;

const firstLine = (commit: GitCommit): string =>
  commit.parents.length > 1
    ? (commit.body.split("\n").find((line) => line.trim()) ?? commit.subject)
    : commit.subject;

const toRelated = (commit: GitCommit, pr: MergedPr): RelatedCommit => ({
  sha: commit.sha,
  subject: commit.subject,
  daysAfter:
    Math.round(((commit.committedAt - pr.mergedAt) / SECONDS_PER_DAY) * 10) /
    10,
});
