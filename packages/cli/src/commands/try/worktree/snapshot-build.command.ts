import type { CommandModule } from "yargs";
import { wrapHandler } from "../../../command-utils/sentry.utils";
import {
  HELPER_OPTIONS,
  printResult,
  repoRootFrom,
  syncHandler,
} from "../shared/helper-options";
import { snapshotBuildOutput } from "./snapshot-build";

interface SnapshotBuildOptions {
  cwd: string | undefined;
  json: boolean;
  worktree: string;
  sha: string;
  outputDir: string | undefined;
}

const snapshotBuildHandler = (options: SnapshotBuildOptions): void => {
  const snapshot = snapshotBuildOutput({
    repoRoot: repoRootFrom(options.cwd),
    worktreeName: options.worktree,
    sha: options.sha,
    outputDir: options.outputDir,
  });
  printResult(options.json, snapshot, () => [snapshot.path]);
};

export const snapshotBuildCommand: CommandModule<
  unknown,
  SnapshotBuildOptions
> = {
  command: "snapshot-build",
  describe:
    "Move a worktree's build output to .meticulous-try/builds/outputs/<sha> (instant rename) and print the path, so the build slot can be released and the worktree switched while the upload reads the snapshot",
  builder: {
    ...HELPER_OPTIONS,
    worktree: {
      string: true,
      demandOption: true,
      description: "Name of the worktree that was just built, e.g. slot-0",
    },
    sha: {
      string: true,
      demandOption: true,
      description: "The commit that was built; must match the worktree's HEAD",
    },
    outputDir: {
      string: true,
      description:
        "Worktree-relative build output directory (defaults to the recipe's outputDir)",
    },
  },
  handler: wrapHandler(syncHandler(snapshotBuildHandler)),
};
