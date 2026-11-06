import { existsSync, realpathSync, rmSync } from "fs";
import { isAbsolute, relative } from "path";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import { CliUserError } from "../../../utils/cli-user-error";
import { CLI_COMMAND } from "../shared/cli-command";
import {
  HELPER_OPTIONS,
  printResult,
  repoRootFrom,
  syncHandler,
} from "../shared/helper-options";
import { TRY_PATHS, TRY_WORKDIR, absoluteTryPath } from "../shared/try-paths";
import { removeTryWorkspace } from "./remove-workspace";
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
    printResult(options.json, { removed, removedLoginState }, () => [
      `Removed ${removed.length} worktree(s)`,
      ...(removedLoginState ? ["Removed the saved login state"] : []),
    ]);
    return;
  }
  assertNotInsideWorkspace(repoRoot);
  const workspace = removeTryWorkspace(repoRoot);
  printResult(
    options.json,
    { removedWorkspace: workspace.removed, removed: workspace.worktrees },
    () => [
      workspace.removed
        ? `Removed ${TRY_WORKDIR}/ (including ${workspace.worktrees.length} worktree(s))`
        : `No ${TRY_WORKDIR}/ workspace to remove`,
    ],
  );
};

const assertNotInsideWorkspace = (repoRoot: string): void => {
  const workspace = absoluteTryPath(repoRoot, TRY_WORKDIR);
  if (!existsSync(workspace)) {
    return;
  }
  const relativeCwd = relative(
    realpathSync(workspace),
    realpathSync(process.cwd()),
  );
  if (!relativeCwd.startsWith("..") && !isAbsolute(relativeCwd)) {
    throw new CliUserError(
      `Refusing to delete ${TRY_WORKDIR}/ from inside it. Run this from the repository root, ` +
        "or pass --keepWorkspace to only remove the worktrees and saved login state.",
    );
  }
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
  describe: `Remove the whole ${TRY_WORKDIR}/ workspace: backtest worktrees, saved login state, recipe and results. Re-running \`${CLI_COMMAND} try\` reuses the trial project.`,
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
