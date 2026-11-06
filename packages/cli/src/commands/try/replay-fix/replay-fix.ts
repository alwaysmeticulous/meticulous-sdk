import { execFileSync } from "child_process";
import { CliUserError } from "../../../utils/cli-user-error";
import { normalizeRelativeRepoPath } from "../../onboard/safe-repo-fs";
import {
  readWorkspaceJson,
  writeWorkspaceJson,
} from "../shared/helper-options";
import { runGit } from "../shared/run-git";
import { TRY_PATHS } from "../shared/try-paths";
import { existingTryWorktreePath } from "../worktree/worktrees";

/**
 * Changes that make the recorded sessions replay correctly, saved as one commit
 * so every backtest can cherry-pick them into both its base and its head. The
 * commit lives only in the object store: it is made on a try worktree's
 * detached HEAD, so no branch in the user's repository moves.
 */
export interface ReplayFix {
  commitSha: string;
  /** The commit the fix was made on. */
  parentSha: string;
  message: string;
  files: string[];
}

export type ApplyReplayFixResult =
  /** Also true when the worktree already had the fix. */
  | { applied: true; commitSha: string; files: string[] }
  | { applied: false; reason: "no-fix" }
  | {
      applied: false;
      reason: "conflict";
      commitSha: string;
      conflicts: string[];
    };

const IDENTITY_ENV = {
  GIT_AUTHOR_NAME: "Meticulous try",
  GIT_AUTHOR_EMAIL: "noreply@meticulous.ai",
  GIT_COMMITTER_NAME: "Meticulous try",
  GIT_COMMITTER_EMAIL: "noreply@meticulous.ai",
};

/**
 * Commits exactly `paths` in the worktree. Saving again on top of an earlier
 * fix replaces it with a single commit on the original parent, so one
 * cherry-pick always carries the whole fix.
 */
export const saveReplayFix = (options: {
  repoRoot: string;
  worktree: string;
  paths: string[];
  message: string;
}): ReplayFix => {
  const path = existingTryWorktreePath(options.repoRoot, options.worktree);
  if (options.paths.length === 0) {
    throw new CliUserError("Pass the files the fix changes with --paths.");
  }
  const previous = readWorkspaceJson<ReplayFix>(
    options.repoRoot,
    TRY_PATHS.replayFix,
  );
  const head = runGit(path, ["rev-parse", "HEAD"]).trim();
  if (previous?.commitSha === head) {
    runGit(path, ["reset", "--soft", previous.parentSha]);
  }
  const parentSha = runGit(path, ["rev-parse", "HEAD"]).trim();

  runGit(path, [
    "add",
    "-A",
    "--",
    ...options.paths.map((file) => normalizeRelativeRepoPath(file)),
  ]);
  const files = listLines(runGit(path, ["diff", "--cached", "--name-only"]));
  if (files.length === 0) {
    throw new CliUserError(
      "Nothing to save: the given --paths have no changes in this worktree.",
    );
  }
  runGit(
    path,
    [
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--no-verify",
      "-q",
      "-m",
      options.message,
    ],
    IDENTITY_ENV,
  );
  const fix: ReplayFix = {
    commitSha: runGit(path, ["rev-parse", "HEAD"]).trim(),
    parentSha,
    message: options.message,
    files,
  };
  writeWorkspaceJson(options.repoRoot, TRY_PATHS.replayFix, fix);
  return fix;
};

/**
 * Applies the saved fix to a worktree's files without committing or touching
 * the index. It applies only if every hunk fits, so a conflict changes
 * nothing, and other uncommitted edits in the worktree are always kept.
 */
export const applyReplayFix = (options: {
  repoRoot: string;
  worktree: string;
}): ApplyReplayFixResult => {
  const fix = readWorkspaceJson<ReplayFix>(
    options.repoRoot,
    TRY_PATHS.replayFix,
  );
  if (!fix) {
    return { applied: false, reason: "no-fix" };
  }
  const path = existingTryWorktreePath(options.repoRoot, options.worktree);
  const patch = runGit(path, [
    "diff",
    "--binary",
    fix.parentSha,
    fix.commitSha,
  ]);
  if (patchApplies(path, patch, [])) {
    gitApply(path, patch, []);
    return { applied: true, commitSha: fix.commitSha, files: fix.files };
  }
  if (patchApplies(path, patch, ["--reverse"])) {
    return { applied: true, commitSha: fix.commitSha, files: fix.files };
  }
  return {
    applied: false,
    reason: "conflict",
    commitSha: fix.commitSha,
    conflicts: fix.files.filter(
      (file) => !patchApplies(path, patch, [`--include=${file}`]),
    ),
  };
};

const patchApplies = (cwd: string, patch: string, args: string[]): boolean => {
  try {
    gitApply(cwd, patch, ["--check", ...args]);
    return true;
  } catch {
    return false;
  }
};

const gitApply = (cwd: string, patch: string, args: string[]): void => {
  execFileSync("git", ["apply", "--whitespace=nowarn", ...args], {
    cwd,
    input: patch,
    stdio: ["pipe", "pipe", "pipe"],
  });
};

const listLines = (output: string): string[] =>
  output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
