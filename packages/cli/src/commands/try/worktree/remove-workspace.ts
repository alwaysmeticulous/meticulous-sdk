import { randomUUID } from "crypto";
import { existsSync, readdirSync, realpathSync, rmSync } from "fs";
import { isAbsolute, join, relative } from "path";
import { CliUserError } from "../../../utils/cli-user-error";
import {
  resolveSafeWritePath,
  writeFileSafeSync,
} from "../../onboard/safe-repo-fs";
import { runGit } from "../shared/run-git";
import { TRY_WORKDIR } from "../shared/try-paths";
import { deleteInBackground, tryRename } from "./discard-dirs";
import { removeTryGitignoreEntry } from "./remove-gitignore-entry";
import { listTryWorktreeNames, removeAllTryWorktrees } from "./worktrees";

const DELETING_PREFIX = `${TRY_WORKDIR}-deleting-`;

/** Deleting the workspace from a cwd inside it would pull the floor out from under the caller. */
export const assertNotInsideTryWorkspace = (
  repoRoot: string,
  remedy: string,
): void => {
  const workspace = join(repoRoot, TRY_WORKDIR);
  if (!existsSync(workspace)) {
    return;
  }
  const relativeCwd = relative(
    realpathSync(workspace),
    realpathSync(process.cwd()),
  );
  if (!relativeCwd.startsWith("..") && !isAbsolute(relativeCwd)) {
    throw new CliUserError(
      `Refusing to delete ${TRY_WORKDIR}/ from inside it. ${remedy}`,
    );
  }
};

/**
 * Removes the whole `.meticulous-try/` workspace and unregisters its
 * worktrees. The directory is renamed first (instant; a `*` .gitignore written
 * into it just before keeps the renamed copy out of `git status`), then deleted
 * in the background, and the root .gitignore entry `try` added is removed.
 * Returns the names of the worktrees it held.
 */
export const removeTryWorkspace = (
  repoRoot: string,
): {
  removed: boolean;
  worktrees: string[];
  removedGitignoreEntry: boolean;
} => {
  const workspace = removeWorkspaceDir(repoRoot);
  return {
    ...workspace,
    removedGitignoreEntry: removeTryGitignoreEntry(repoRoot),
  };
};

const removeWorkspaceDir = (
  repoRoot: string,
): { removed: boolean; worktrees: string[] } => {
  const workspace = resolveSafeWritePath(repoRoot, TRY_WORKDIR);
  const staleCopies = findStaleDeletingCopies(repoRoot);
  if (!existsSync(workspace)) {
    deleteInBackground(staleCopies);
    return { removed: false, worktrees: [] };
  }

  const worktrees = listTryWorktreeNames(repoRoot);
  // The root .gitignore entry does not match the renamed copy, so it must ignore itself.
  writeFileSafeSync(repoRoot, join(TRY_WORKDIR, ".gitignore"), "*\n");
  const deleting = join(repoRoot, `${DELETING_PREFIX}${randomUUID()}`);
  if (tryRename(workspace, deleting)) {
    runGit(repoRoot, ["worktree", "prune"]);
    deleteInBackground([deleting, ...staleCopies]);
  } else {
    removeAllTryWorktrees(repoRoot);
    rmSync(workspace, { recursive: true, force: true });
    deleteInBackground(staleCopies);
  }
  return { removed: true, worktrees };
};

const findStaleDeletingCopies = (repoRoot: string): string[] =>
  readdirSync(repoRoot, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && entry.name.startsWith(DELETING_PREFIX),
    )
    .map((entry) => join(repoRoot, entry.name));
