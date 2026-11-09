import { cpSync, existsSync, rmSync, statSync } from "fs";
import { join } from "path";
import { CliUserError } from "../../../utils/cli-user-error";
import { mkdirSafeSync } from "../../onboard/safe-repo-fs";
import { CLI_COMMAND } from "../shared/cli-command";
import { readWorkspaceJson } from "../shared/helper-options";
import { TRY_PATHS } from "../shared/try-paths";
import type { BuildRecipe } from "../recipe/build-recipe";
import { emptyTrashInBackground, moveToTrash, tryRename } from "./discard-dirs";
import {
  assertCleanablePath,
  existingTryWorktreePath,
  resolveCommit,
} from "./worktrees";

export interface BuildOutputSnapshot {
  sha: string;
  /** Where the build output now lives; upload from here, the worktree is free. */
  path: string;
  outputDir: string;
}

/**
 * Moves a worktree's build output to `.meticulous-try/builds/outputs/<sha>` so
 * the worktree (and its build slot) can be released and switched to the next
 * commit while the upload reads the snapshot. A rename on the same filesystem,
 * so it is instant.
 */
export const snapshotBuildOutput = (options: {
  repoRoot: string;
  worktreeName: string;
  sha: string;
  outputDir: string | undefined;
}): BuildOutputSnapshot => {
  const { repoRoot } = options;
  const worktreePath = existingTryWorktreePath(repoRoot, options.worktreeName);
  const sha = resolveCommit(repoRoot, options.sha);
  assertWorktreeAtSha(worktreePath, options.worktreeName, sha);
  const outputDir = resolveOutputDir(repoRoot, options.outputDir);
  const source = join(worktreePath, assertCleanablePath(outputDir));
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    throw new CliUserError(
      `No build output at ${source}. Build first, or pass the right --outputDir.`,
    );
  }
  const outputsRoot = mkdirSafeSync(repoRoot, TRY_PATHS.buildOutputs);
  const destination = join(outputsRoot, sha);
  if (existsSync(destination)) {
    discardExistingSnapshot(repoRoot, destination);
  }
  if (!tryRename(source, destination)) {
    // Different filesystem or a locked file: fall back to copy + delete.
    cpSync(source, destination, { recursive: true, verbatimSymlinks: true });
    rmSync(source, { recursive: true, force: true });
  }
  return { sha, path: destination, outputDir };
};

const assertWorktreeAtSha = (
  worktreePath: string,
  worktreeName: string,
  sha: string,
): void => {
  const head = resolveCommit(worktreePath, "HEAD");
  if (head !== sha) {
    throw new CliUserError(
      `Worktree ${worktreeName} is at ${head}, not ${sha}: its build output belongs to a different commit.`,
    );
  }
};

const resolveOutputDir = (
  repoRoot: string,
  outputDir: string | undefined,
): string => {
  if (outputDir) {
    return outputDir;
  }
  const recipe = readWorkspaceJson<BuildRecipe>(repoRoot, TRY_PATHS.recipe);
  if (!recipe) {
    throw new CliUserError(
      `No build recipe saved yet. Save one with \`${CLI_COMMAND} try recipe save --file <json>\`, or pass --outputDir.`,
    );
  }
  if (!recipe.outputDir) {
    throw new CliUserError(
      "The recipe has no outputDir (a container build needs no snapshot: its image tag outlives the worktree).",
    );
  }
  return recipe.outputDir;
};

const discardExistingSnapshot = (
  repoRoot: string,
  destination: string,
): void => {
  if (moveToTrash(repoRoot, destination)) {
    emptyTrashInBackground(repoRoot);
  } else {
    rmSync(destination, { recursive: true, force: true });
  }
};
