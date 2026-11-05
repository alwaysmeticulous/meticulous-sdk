import { detectMergedPrs } from "./detect-merged-prs";
import {
  readFirstParentHistory,
  resolveDefaultBranchRef,
} from "./read-git-history";
import { scoreCandidates } from "./score-candidates";
import type { CandidatePr } from "./types";

export interface CandidatePrsResult {
  ref: string;
  since: string;
  appPath: string;
  commitsScanned: number;
  mergedPrsFound: number;
  candidates: CandidatePr[];
}

export const findCandidatePrs = (options: {
  repoRoot: string;
  ref: string | undefined;
  since: string;
  appPath: string;
  limit: number;
  maxCommits: number;
}): CandidatePrsResult => {
  const ref = options.ref ?? resolveDefaultBranchRef(options.repoRoot);
  const commits = readFirstParentHistory({
    repoRoot: options.repoRoot,
    ref,
    since: options.since,
    maxCommits: options.maxCommits,
  });
  const prs = detectMergedPrs(commits);
  const candidates = scoreCandidates({
    prs,
    commits,
    appPath: options.appPath,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  return {
    ref,
    since: options.since,
    appPath: options.appPath,
    commitsScanned: commits.length,
    mergedPrsFound: prs.length,
    candidates: candidates.slice(0, options.limit),
  };
};
