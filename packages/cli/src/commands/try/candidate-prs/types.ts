export interface FileChange {
  path: string;
  added: number;
  deleted: number;
}

/** One first-parent commit of the default branch, with its first-parent diff. */
export interface GitCommit {
  sha: string;
  parents: string[];
  /** Unix seconds (committer date: when it landed on the branch). */
  committedAt: number;
  author: string;
  subject: string;
  body: string;
  files: FileChange[];
}

export type MergeKind = "merge" | "squash";

export interface MergedPr {
  prNumber: number;
  kind: MergeKind;
  title: string;
  /** First parent: the default branch just before the PR landed. */
  baseSha: string;
  /** The commit that landed the PR (merge or squash commit). */
  headSha: string;
  mergedAt: number;
  author: string;
  files: FileChange[];
}

export interface RelatedCommit {
  sha: string;
  subject: string;
  daysAfter: number;
}

export interface BugSignals {
  revertedBy: RelatedCommit | null;
  followUpFixes: RelatedCommit[];
}

export interface CandidatePr {
  prNumber: number;
  title: string;
  kind: MergeKind;
  baseSha: string;
  headSha: string;
  mergedAt: string;
  author: string;
  frontendFiles: string[];
  frontendLinesChanged: number;
  totalFilesChanged: number;
  signals: BugSignals & { refactor: boolean; dependencyUpgrade: boolean };
  score: number;
  reasons: string[];
}
