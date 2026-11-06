import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import {
  HELPER_OPTIONS,
  printResult,
  repoRootFrom,
  syncHandler,
} from "../shared/helper-options";
import { applyReplayFix, saveReplayFix } from "./replay-fix";

interface SaveOptions {
  cwd: string | undefined;
  json: boolean;
  worktree: string;
  paths: string[];
  message: string;
}

interface ApplyOptions {
  cwd: string | undefined;
  json: boolean;
  worktree: string;
}

const saveHandler = (options: SaveOptions): void => {
  const fix = saveReplayFix({
    repoRoot: repoRootFrom(options.cwd),
    worktree: options.worktree,
    paths: options.paths,
    message: options.message,
  });
  printResult(options.json, fix, () => [
    `Saved the replay fix as ${fix.commitSha} (${fix.files.length} file(s)): ${fix.files.join(", ")}`,
  ]);
};

const applyHandler = (options: ApplyOptions): void => {
  const result = applyReplayFix({
    repoRoot: repoRootFrom(options.cwd),
    worktree: options.worktree,
  });
  printResult(options.json, result, () => {
    if (result.applied) {
      return [`Applied the replay fix (${result.files.join(", ")})`];
    }
    return result.reason === "no-fix"
      ? ["No replay fix saved; nothing to apply"]
      : [
          `The replay fix does not apply cleanly here (${result.conflicts.join(", ")}); the worktree was left unchanged. Make the same change by hand: git show ${result.commitSha}`,
        ];
  });
};

const WORKTREE_OPTION = {
  string: true,
  demandOption: true,
  description: "Name of the try worktree",
} as const;

const saveCommand: CommandModule<unknown, SaveOptions> = {
  command: "save",
  describe:
    "Commit the given files in a try worktree as the replay fix (on its detached HEAD, so no branch moves). Saving again replaces the fix",
  builder: {
    ...HELPER_OPTIONS,
    worktree: WORKTREE_OPTION,
    paths: {
      string: true,
      array: true,
      demandOption: true,
      description: "Worktree-relative files the fix changes or adds",
    },
    message: {
      string: true,
      demandOption: true,
      description: "What the fix changes and why replays need it",
    },
  },
  handler: wrapHandler(syncHandler(saveHandler)),
};

const applyCommand: CommandModule<unknown, ApplyOptions> = {
  command: "apply",
  describe:
    "Apply the saved replay fix to a try worktree's files without committing. Applies only if it fits cleanly, so a conflict changes nothing and other uncommitted edits are kept",
  builder: { ...HELPER_OPTIONS, worktree: WORKTREE_OPTION },
  handler: wrapHandler(syncHandler(applyHandler)),
};

export const replayFixCommand: CommandModule = {
  command: "replay-fix",
  describe:
    "Save the changes that make replays work as one commit, and apply it to every backtest build",
  builder: (yargs) =>
    yargs.command(saveCommand).command(applyCommand).demandCommand(),
  handler: () => {
    // subcommand handles this
  },
};
