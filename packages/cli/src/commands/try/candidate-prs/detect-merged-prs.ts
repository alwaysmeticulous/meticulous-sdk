import type { GitCommit, MergedPr, MergeKind } from "./types";

const GITHUB_MERGE_SUBJECT = /^Merge pull request #(\d+)\b/;
const BITBUCKET_MERGE_SUBJECT = /^Merged in \S+ \(pull request #(\d+)\)/;
const GITLAB_MERGE_REQUEST_TRAILER = /See merge request \S*!(\d+)/;
const SQUASH_SUFFIX = /\s*\(#(\d+)\)\s*$/;

/**
 * Recognises the commit that landed a PR on the default branch: a GitHub,
 * GitLab or Bitbucket merge commit, or a squash commit carrying the PR number.
 * Returns null for anything else, including branch-sync merges.
 */
export const detectMergedPr = (commit: GitCommit): MergedPr | null => {
  if (commit.parents.length === 0) {
    return null;
  }
  const match = matchPrNumber(commit);
  if (!match) {
    return null;
  }
  return {
    prNumber: match.prNumber,
    kind: commit.parents.length > 1 ? "merge" : "squash",
    title: match.title,
    baseSha: commit.parents[0],
    headSha: commit.sha,
    mergedAt: commit.committedAt,
    author: commit.author,
    files: commit.files,
  };
};

export const detectMergedPrs = (commits: GitCommit[]): MergedPr[] =>
  commits.map(detectMergedPr).filter((pr): pr is MergedPr => pr !== null);

const matchPrNumber = (
  commit: GitCommit,
): { prNumber: number; title: string } | null => {
  const isMerge = commit.parents.length > 1;
  const kind: MergeKind = isMerge ? "merge" : "squash";

  const github = commit.subject.match(GITHUB_MERGE_SUBJECT);
  if (github && kind === "merge") {
    return { prNumber: Number(github[1]), title: titleFromBody(commit) };
  }
  const bitbucket = commit.subject.match(BITBUCKET_MERGE_SUBJECT);
  if (bitbucket) {
    return { prNumber: Number(bitbucket[1]), title: titleFromBody(commit) };
  }
  const gitlab = commit.body.match(GITLAB_MERGE_REQUEST_TRAILER);
  if (gitlab) {
    return {
      prNumber: Number(gitlab[1]),
      title: isMerge ? titleFromBody(commit) : commit.subject,
    };
  }
  const squash = commit.subject.match(SQUASH_SUFFIX);
  if (squash && kind === "squash") {
    return {
      prNumber: Number(squash[1]),
      title: commit.subject.replace(SQUASH_SUFFIX, ""),
    };
  }
  return null;
};

/** Merge commits keep the PR title on the first body line, not the subject. */
const titleFromBody = (commit: GitCommit): string =>
  commit.body
    .split("\n")
    .map((line) => line.trim())
    .find(
      (line) => line.length > 0 && !GITLAB_MERGE_REQUEST_TRAILER.test(line),
    ) ?? commit.subject;
