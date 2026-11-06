import { existsSync, readFileSync, rmSync } from "fs";
import {
  resolveSafeWritePath,
  writeFileSafeSync,
} from "../../onboard/safe-repo-fs";
import { tryRunGit } from "../shared/run-git";
import { TRY_GITIGNORE_COMMENT, TRY_WORKDIR } from "../shared/try-paths";

const ROOT_GITIGNORE = ".gitignore";
const ENTRY = `${TRY_WORKDIR}/`;

/**
 * Undoes the root `.gitignore` change `meticulous try` makes: the commented
 * entry it appends, or the whole file when it created it with just the entry
 * and git does not track it. An entry without the comment was added by the
 * user, so it stays. Returns whether `.gitignore` changed.
 */
export const removeTryGitignoreEntry = (repoRoot: string): boolean => {
  const path = resolveSafeWritePath(repoRoot, ROOT_GITIGNORE);
  if (!existsSync(path)) {
    return false;
  }
  const content = readFileSync(path, "utf8");
  if (content.trim() === ENTRY) {
    if (isTracked(repoRoot, ROOT_GITIGNORE)) {
      return false;
    }
    rmSync(path);
    return true;
  }
  const updated = withoutTryGitignoreEntry(content);
  if (updated === content) {
    return false;
  }
  writeFileSafeSync(repoRoot, ROOT_GITIGNORE, updated);
  return true;
};

/** Drops the comment + entry pair, and the blank line `ensureGitignoreEntry` puts before it. */
export const withoutTryGitignoreEntry = (content: string): string => {
  const lines = content.split("\n");
  const index = lines.findIndex(
    (line, i) =>
      line.trim() === TRY_GITIGNORE_COMMENT && lines[i + 1]?.trim() === ENTRY,
  );
  if (index === -1) {
    return content;
  }
  const precededByBlank = index > 0 && lines[index - 1].trim() === "";
  const start = precededByBlank ? index - 1 : index;
  lines.splice(start, index + 2 - start);
  return lines.join("\n");
};

const isTracked = (repoRoot: string, path: string): boolean =>
  tryRunGit(repoRoot, ["ls-files", "--error-unmatch", "--", path]) !== null;
