import { join } from "path";
import { findGitDirs, readTextOrNull } from "./find-git-dirs";

/** Null when `cwd` isn't in a repository or HEAD is detached. */
export const readGitBranch = (cwd: string | null): string | null => {
  const gitDirs = cwd ? findGitDirs(cwd) : null;
  const head = gitDirs ? readTextOrNull(join(gitDirs.gitDir, "HEAD")) : null;
  return /^ref: refs\/heads\/(.+)$/m.exec(head ?? "")?.[1]?.trim() || null;
};
