import { existsSync, rmSync } from "fs";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import { CliUserError } from "../../../utils/cli-user-error";
import {
  HELPER_OPTIONS,
  syncHandler,
  printResult,
  repoRootFrom,
} from "../shared/helper-options";
import { TRY_PATHS, absoluteTryPath } from "../shared/try-paths";
import {
  createTryWorktree,
  removeAllTryWorktrees,
  removeTryWorktree,
} from "./worktrees";

interface WorktreeOptions {
  cwd: string | undefined;
  json: boolean;
  sha: string | undefined;
  name: string | undefined;
  remove: string | undefined;
}

const worktreeHandler = (options: WorktreeOptions): void => {
  const repoRoot = repoRootFrom(options.cwd);
  if (options.remove) {
    const result = removeTryWorktree({ repoRoot, name: options.remove });
    printResult(options.json, result, () => [
      result.removed
        ? `Removed worktree ${result.name}`
        : `No worktree named ${result.name}`,
    ]);
    return;
  }
  if (!options.sha || !options.name) {
    throw new CliUserError(
      "Pass --sha and --name to create a worktree, or --remove <name>.",
    );
  }
  const worktree = createTryWorktree({
    repoRoot,
    sha: options.sha,
    name: options.name,
  });
  printResult(options.json, worktree, () => [worktree.path]);
};

export const worktreeCommand: CommandModule<unknown, WorktreeOptions> = {
  command: "worktree",
  describe:
    "Create a detached git worktree at a commit under .meticulous-try/worktrees/<name> (prints its path), or remove one",
  builder: {
    ...HELPER_OPTIONS,
    sha: { string: true, description: "Commit to check out" },
    name: {
      string: true,
      description: "Worktree name, e.g. pr-123-base / pr-123-head",
    },
    remove: { string: true, description: "Name of a worktree to remove" },
  },
  handler: wrapHandler(syncHandler(worktreeHandler)),
};

interface CleanupOptions {
  cwd: string | undefined;
  json: boolean;
}

const cleanupHandler = (options: CleanupOptions): void => {
  const repoRoot = repoRootFrom(options.cwd);
  const removed = removeAllTryWorktrees(repoRoot);
  const removedLoginState = removeLoginState(repoRoot);
  printResult(options.json, { removed, removedLoginState }, () => [
    `Removed ${removed.length} worktree(s)`,
    ...(removedLoginState ? ["Removed the saved login state"] : []),
  ]);
};

const removeLoginState = (repoRoot: string): boolean => {
  const path = absoluteTryPath(repoRoot, TRY_PATHS.authState);
  if (!existsSync(path)) {
    return false;
  }
  rmSync(path);
  return true;
};

export const cleanupCommand: CommandModule<unknown, CleanupOptions> = {
  command: "cleanup",
  describe:
    "Remove every worktree under .meticulous-try/worktrees/ and the login state saved by `meticulous try login`",
  builder: { ...HELPER_OPTIONS },
  handler: wrapHandler(syncHandler(cleanupHandler)),
};
