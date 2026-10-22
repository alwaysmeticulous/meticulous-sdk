import { readFileSync, statSync } from "fs";
import { dirname, isAbsolute, join, resolve } from "path";

interface GitDirs {
  /** The repository's own git dir; a worktree's is under `.git/worktrees`. */
  gitDir: string;
  /** Where the shared `config` lives. Equal to `gitDir` outside worktrees. */
  commonDir: string;
}

const MAX_PARENT_DIRS = 64;

/**
 * Locates the git directories for `startDir` by reading the filesystem, so
 * it works on Macs without the Command Line Tools (where running `git`
 * would pop up an install dialog).
 */
export const findGitDirs = (startDir: string): GitDirs | null => {
  let dir = resolve(startDir);
  for (let depth = 0; depth < MAX_PARENT_DIRS; depth++) {
    const dotGit = join(dir, ".git");
    const gitDir = resolveDotGit(dotGit);
    if (gitDir) {
      return { gitDir, commonDir: readCommonDir(gitDir) };
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
  return null;
};

const resolveDotGit = (dotGit: string): string | null => {
  try {
    const stats = statSync(dotGit);
    if (stats.isDirectory()) {
      return dotGit;
    }
    if (!stats.isFile()) {
      return null;
    }
  } catch {
    return null;
  }
  // Worktrees and submodules use a `.git` file pointing at the real git dir.
  const match = /^gitdir:\s*(.+)$/m.exec(readTextOrNull(dotGit) ?? "");
  const target = match?.[1]?.trim();
  if (!target) {
    return null;
  }
  return isAbsolute(target) ? target : resolve(dirname(dotGit), target);
};

const readCommonDir = (gitDir: string): string => {
  const commonDir = readTextOrNull(join(gitDir, "commondir"))?.trim();
  if (!commonDir) {
    return gitDir;
  }
  return isAbsolute(commonDir) ? commonDir : resolve(gitDir, commonDir);
};

export const readTextOrNull = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};
