import {
  isGitCommitSha,
  SENTINEL_COMMIT_SHAS,
  type GitCommitSha,
} from "@alwaysmeticulous/common";
import chalk from "chalk";

// Some CI setups record `<sha>-snapshot-<id>` as the commit SHA.
const SNAPSHOT_COMMIT_SHA_SUFFIX = /-snapshot-\d+$/i;

/**
 * Narrows a commit SHA from an API record to a `GitCommitSha`, or returns
 * undefined. A `-snapshot-<id>` suffix is stripped so the underlying commit is
 * used. Logs the rejected value unless it is empty or one of the known
 * sentinels runs without a real commit store.
 */
export const toGitCommitSha = (
  sha: string | undefined,
  label: string,
): GitCommitSha | undefined => {
  const unsuffixed = sha?.replace(SNAPSHOT_COMMIT_SHA_SUFFIX, "");
  if (isGitCommitSha(unsuffixed)) {
    return unsuffixed;
  }
  if (sha && !SENTINEL_COMMIT_SHAS.includes(sha)) {
    console.warn(
      chalk.yellow(
        `  Warning: Ignoring ${label} ${JSON.stringify(sha.slice(0, 80))}: not a git commit SHA.`,
      ),
    );
  }
  return undefined;
};

/** @deprecated Use isGitCommitSha from @alwaysmeticulous/common. */
export const isValidGitCommitSha = isGitCommitSha;
