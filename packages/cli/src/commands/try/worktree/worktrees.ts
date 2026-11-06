import { existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { CliUserError } from "../../../utils/cli-user-error";
import {
  mkdirSafeSync,
  normalizeRelativeRepoPath,
  resolveSafeWritePath,
} from "../../onboard/safe-repo-fs";
import { runGit, tryRunGit } from "../shared/run-git";
import { TRY_PATHS, absoluteTryPath } from "../shared/try-paths";
import { emptyTrashInBackground, moveToTrash } from "./discard-dirs";
import { listChangedInstallInputs } from "./install-inputs";

export interface TryWorktree {
  name: string;
  path: string;
  sha: string;
  reused: boolean;
  /** The commit the worktree was switched from, or null for a new worktree. */
  previousSha: string | null;
  /**
   * Install inputs (lockfiles, package manager and Node version config,
   * patches) that differ from `previousSha`. Null for a new worktree, which
   * always needs an install; empty means the existing install still fits.
   */
  installInputsChanged: string[] | null;
}

const WORKTREE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * Creates a detached worktree at `sha` under `.meticulous-try/worktrees/<name>`,
 * or switches an existing one to `sha` in place so its node_modules and build
 * caches carry over. Detached so no branch is created in the user's repo.
 * `cleanPaths` (worktree-relative, e.g. the build output dir) are deleted
 * after switching so a stale build from the previous commit is never uploaded.
 */
export const createTryWorktree = (options: {
  repoRoot: string;
  sha: string;
  name: string;
  cleanPaths?: string[];
}): TryWorktree => {
  const { repoRoot, name } = options;
  assertValidName(name);
  const sha = resolveCommit(repoRoot, options.sha);
  const path = worktreePath(repoRoot, name);
  const worktree = checkOutWorktree({ repoRoot, name, path, sha });
  for (const cleanPath of options.cleanPaths ?? []) {
    rmSync(resolveSafeWritePath(path, assertCleanablePath(cleanPath)), {
      recursive: true,
      force: true,
    });
  }
  return worktree;
};

const assertCleanablePath = (cleanPath: string): string => {
  const normalized = normalizeRelativeRepoPath(cleanPath);
  if (normalized === "" || normalized.split("/")[0] === ".git") {
    throw new CliUserError(
      `Refusing to clean '${cleanPath}': pass a path inside the worktree, such as its build output directory.`,
    );
  }
  return normalized;
};

const checkOutWorktree = (options: {
  repoRoot: string;
  name: string;
  path: string;
  sha: string;
}): TryWorktree => {
  const { repoRoot, name, path, sha } = options;
  const current = existsSync(path)
    ? tryRunGit(path, ["rev-parse", "HEAD"])
    : null;
  if (current === sha) {
    return {
      name,
      path,
      sha,
      reused: true,
      previousSha: sha,
      installInputsChanged: [],
    };
  }
  if (current != null && switchInPlace(path, sha)) {
    return {
      name,
      path,
      sha,
      reused: true,
      previousSha: current,
      installInputsChanged: listChangedInstallInputs(repoRoot, current, sha),
    };
  }
  if (existsSync(path)) {
    removeTryWorktree({ repoRoot, name });
  }
  mkdirSafeSync(repoRoot, TRY_PATHS.worktrees);
  runGit(repoRoot, ["worktree", "add", "--detach", "--force", path, sha]);
  return {
    name,
    path,
    sha,
    reused: false,
    previousSha: null,
    installInputsChanged: null,
  };
};

/**
 * Leaves the worktree matching `sha`, as a new one would: `--force` discards
 * edits a build step or the replay fix made to tracked files, and `clean`
 * removes files they added. Ignored files such as node_modules and build
 * caches stay.
 */
const switchInPlace = (path: string, sha: string): boolean =>
  tryRunGit(path, ["checkout", "--force", "--detach", sha]) != null &&
  tryRunGit(path, ["clean", "-fdq"]) != null;

export const removeTryWorktree = (options: {
  repoRoot: string;
  name: string;
}): { name: string; removed: boolean } => {
  assertValidName(options.name);
  const removed = discardWorktrees(options.repoRoot, [options.name]);
  return { name: options.name, removed: removed.length > 0 };
};

export const removeAllTryWorktrees = (repoRoot: string): string[] =>
  discardWorktrees(repoRoot, listTryWorktreeNames(repoRoot));

export const listTryWorktreeNames = (repoRoot: string): string[] => {
  const root = absoluteTryPath(repoRoot, TRY_PATHS.worktrees);
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && WORKTREE_NAME.test(entry.name))
    .map((entry) => entry.name);
};

/**
 * Moving a worktree aside and pruning is instant, whereas `git worktree
 * remove` deletes every file before returning; the files are deleted in the
 * background instead.
 */
const discardWorktrees = (repoRoot: string, names: string[]): string[] => {
  const removed: string[] = [];
  for (const name of names) {
    const path = worktreePath(repoRoot, name);
    if (!existsSync(path)) {
      continue;
    }
    if (!moveToTrash(repoRoot, path)) {
      runGit(repoRoot, ["worktree", "remove", "--force", path]);
    }
    removed.push(name);
  }
  runGit(repoRoot, ["worktree", "prune"]);
  if (removed.length > 0) {
    emptyTrashInBackground(repoRoot);
  }
  return removed;
};

/** The path of an existing try worktree, by name. */
export const existingTryWorktreePath = (
  repoRoot: string,
  name: string,
): string => {
  assertValidName(name);
  const path = worktreePath(repoRoot, name);
  if (!existsSync(path)) {
    throw new CliUserError(
      `No try worktree named '${name}'. Create it with \`meticulous try worktree --sha <sha> --name ${name}\`.`,
    );
  }
  return path;
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
