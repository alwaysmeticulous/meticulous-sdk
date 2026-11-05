import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { CliUserError } from "../../../utils/cli-user-error";
import { mkdirSafeSync } from "../../onboard/safe-repo-fs";
import { runGit, tryRunGit } from "../shared/run-git";
import { TRY_PATHS, absoluteTryPath } from "../shared/try-paths";

export interface TryWorktree {
  name: string;
  path: string;
  sha: string;
  reused: boolean;
}

const WORKTREE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * Creates (or reuses, when already at `sha`) a detached worktree under
 * `.meticulous-try/worktrees/<name>`. Detached so no branch is created in
 * the user's repo.
 */
export const createTryWorktree = (options: {
  repoRoot: string;
  sha: string;
  name: string;
}): TryWorktree => {
  const { repoRoot, name } = options;
  assertValidName(name);
  const sha = resolveCommit(repoRoot, options.sha);
  const path = worktreePath(repoRoot, name);

  if (existsSync(path)) {
    const current = tryRunGit(path, ["rev-parse", "HEAD"]);
    if (current === sha) {
      return { name, path, sha, reused: true };
    }
    removeTryWorktree({ repoRoot, name });
  }

  mkdirSafeSync(repoRoot, TRY_PATHS.worktrees);
  runGit(repoRoot, ["worktree", "add", "--detach", "--force", path, sha]);
  return { name, path, sha, reused: false };
};

export const removeTryWorktree = (options: {
  repoRoot: string;
  name: string;
}): { name: string; removed: boolean } => {
  assertValidName(options.name);
  const path = worktreePath(options.repoRoot, options.name);
  if (!existsSync(path)) {
    runGit(options.repoRoot, ["worktree", "prune"]);
    return { name: options.name, removed: false };
  }
  runGit(options.repoRoot, ["worktree", "remove", "--force", path]);
  runGit(options.repoRoot, ["worktree", "prune"]);
  return { name: options.name, removed: true };
};

export const removeAllTryWorktrees = (repoRoot: string): string[] => {
  const root = absoluteTryPath(repoRoot, TRY_PATHS.worktrees);
  if (!existsSync(root)) {
    return [];
  }
  const names = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && WORKTREE_NAME.test(entry.name))
    .map((entry) => entry.name);
  return names
    .map((name) => removeTryWorktree({ repoRoot, name }))
    .filter((result) => result.removed)
    .map((result) => result.name);
};

const worktreePath = (repoRoot: string, name: string): string =>
  join(absoluteTryPath(repoRoot, TRY_PATHS.worktrees), name);

const assertValidName = (name: string): void => {
  if (!WORKTREE_NAME.test(name)) {
    throw new CliUserError(
      `Invalid worktree name '${name}': use letters, digits, '.', '_' or '-' (e.g. pr-123-head).`,
    );
  }
};

const resolveCommit = (repoRoot: string, sha: string): string => {
  if (sha.startsWith("-")) {
    throw new CliUserError(`Invalid commit '${sha}'.`);
  }
  const resolved = tryRunGit(repoRoot, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${sha}^{commit}`,
  ]);
  if (!resolved) {
    throw new CliUserError(`Commit '${sha}' not found in ${repoRoot}.`);
  }
  return resolved;
};
