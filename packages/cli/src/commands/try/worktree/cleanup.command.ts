import { existsSync, rmSync } from "fs";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import { CLI_COMMAND } from "../shared/cli-command";
import {
  HELPER_OPTIONS,
  printResult,
  repoRootFrom,
  syncHandler,
} from "../shared/helper-options";
import { TRY_PATHS, TRY_WORKDIR, absoluteTryPath } from "../shared/try-paths";
import { emptyTrashInBackground, moveToTrash } from "./discard-dirs";
import {
  assertNotInsideTryWorkspace,
  removeTryWorkspace,
} from "./remove-workspace";
import { removeAllTryWorktrees } from "./worktrees";

interface CleanupOptions {
  cwd: string | undefined;
  json: boolean;
  keepWorkspace: boolean;
}

const cleanupHandler = (options: CleanupOptions): void => {
  const repoRoot = repoRootFrom(options.cwd);
  if (options.keepWorkspace) {
    const removed = removeAllTryWorktrees(repoRoot);
    const removedLoginState = removeLoginState(repoRoot);
    const removedBuildArtifacts = removeBuildArtifacts(repoRoot);
    printResult(
      options.json,
      { removed, removedLoginState, removedBuildArtifacts },
      () => [
        `Removed ${removed.length} worktree(s)`,
        ...(removedBuildArtifacts.length > 0
          ? [`Removed ${removedBuildArtifacts.join(" and ")}`]
          : []),
        ...(removedLoginState ? ["Removed the saved login state"] : []),
      ],
    );
    return;
  }
  assertNotInsideTryWorkspace(
    repoRoot,
    "Run this from the repository root, " +
      "or pass --keepWorkspace to only remove the worktrees and saved login state.",
  );
  const workspace = removeTryWorkspace(repoRoot);
  printResult(
    options.json,
    {
      removedWorkspace: workspace.removed,
      removed: workspace.worktrees,
      removedGitignoreEntry: workspace.removedGitignoreEntry,
    },
    () => [
      workspace.removed
        ? `Removed ${TRY_WORKDIR}/ (including ${workspace.worktrees.length} worktree(s))`
        : `No ${TRY_WORKDIR}/ workspace to remove`,
      ...(workspace.removedGitignoreEntry
        ? [`Removed the ${TRY_WORKDIR}/ entry from .gitignore`]
        : []),
    ],
  );
};

/** Build output snapshots and the shared build cache: only useful while backtests run. */
const removeBuildArtifacts = (repoRoot: string): string[] => {
  const removed: string[] = [];
  for (const relativePath of [TRY_PATHS.buildOutputs, TRY_PATHS.cache]) {
    const path = absoluteTryPath(repoRoot, relativePath);
    if (!existsSync(path)) {
      continue;
    }
    if (!moveToTrash(repoRoot, path)) {
      rmSync(path, { recursive: true, force: true });
    }
    removed.push(relativePath);
  }
  if (removed.length > 0) {
    emptyTrashInBackground(repoRoot);
  }
  return removed;
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
  describe: `Remove the whole ${TRY_WORKDIR}/ workspace (backtest worktrees, saved login state, recipe and results) and the .gitignore entry for it. Re-running \`${CLI_COMMAND} try\` reuses the trial project.`,
  builder: {
    ...HELPER_OPTIONS,
    keepWorkspace: {
      boolean: true,
      default: false,
      description:
        "Only remove the backtest worktrees and the saved login state, keeping the rest of the workspace",
    },
  },
  handler: wrapHandler(syncHandler(cleanupHandler)),
};
