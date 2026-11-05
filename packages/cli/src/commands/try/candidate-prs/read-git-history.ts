import { runGit, tryRunGit } from "../shared/run-git";
import { GIT_LOG_FORMAT, parseGitLog } from "./parse-git-log";
import type { GitCommit } from "./types";

const FALLBACK_REFS = ["origin/main", "origin/master", "main", "master"];

/**
 * The default branch to mine for merged PRs. Prefers the remote-tracking ref
 * (what was actually merged upstream) and never fetches: this is local-only.
 */
export const resolveDefaultBranchRef = (repoRoot: string): string => {
  const originHead = tryRunGit(repoRoot, [
    "symbolic-ref",
    "--quiet",
    "refs/remotes/origin/HEAD",
  ]);
  if (originHead) {
    return originHead.replace(/^refs\/remotes\//, "");
  }
  return (
    FALLBACK_REFS.find(
      (ref) =>
        tryRunGit(repoRoot, ["rev-parse", "--verify", "--quiet", ref]) !== null,
    ) ?? "HEAD"
  );
};

/** `90d`, `12w`, `6m` or any date `git log --since` understands. */
export const toGitSince = (since: string): string => {
  const match = since.trim().match(/^(\d+)\s*([dwmy])$/i);
  if (!match) {
    return since;
  }
  const unit = { d: "days", w: "weeks", m: "months", y: "years" }[
    match[2].toLowerCase() as "d" | "w" | "m" | "y"
  ];
  return `${match[1]}.${unit}.ago`;
};

/** First-parent history of `ref`, each commit with its diff against its first parent. */
export const readFirstParentHistory = (options: {
  repoRoot: string;
  ref: string;
  since: string;
  maxCommits: number;
}): GitCommit[] =>
  parseGitLog(
    runGit(options.repoRoot, [
      "log",
      options.ref,
      "--first-parent",
      "-m",
      "--numstat",
      "--no-color",
      `--since=${toGitSince(options.since)}`,
      `--max-count=${options.maxCommits}`,
      `--format=${GIT_LOG_FORMAT}`,
    ]),
  );
