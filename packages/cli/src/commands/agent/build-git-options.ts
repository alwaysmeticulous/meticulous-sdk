import {
  getCommitSha,
  getGitDiff,
  getLocalBaseSha,
  getStashCreateSha,
  hasUncommittedChanges,
  initLogger,
} from "@alwaysmeticulous/common";
import { CliUserError } from "../../utils/cli-user-error";

/**
 * Resolves the commit a build is of, for `agent upload-build`. The build's
 * commit must identify a real commit so the deployment's `commitSha` (and the
 * test run's `execution_sha`) faithfully describe what ran:
 * - explicit `--commitSha` wins;
 * - otherwise the repo HEAD is used;
 * - a dirty working tree is captured as an ephemeral `git stash create` commit
 *   (a real, unreferenced commit; HEAD/branch untouched) with a stderr warning.
 */
export const resolveBuildCommitSha = async ({
  commitSha,
  repoDirectory,
}: {
  commitSha: string | undefined;
  repoDirectory: string | undefined;
}): Promise<string> => {
  const logger = initLogger();
  const gitOpts = repoDirectory ? { cwd: repoDirectory } : undefined;

  if (commitSha) {
    logger.info(`Commit SHA provided: ${commitSha}`);
    return commitSha;
  }

  if (await hasUncommittedChanges(gitOpts)) {
    const stashSha = await getStashCreateSha(gitOpts);
    if (stashSha) {
      process.stderr.write(
        `note: working tree is dirty; using ephemeral commit ${stashSha} to identify this build.\n`,
      );
      return stashSha;
    }
  }

  const head = await getCommitSha(undefined, gitOpts);
  if (!head) {
    throw new CliUserError(
      "Could not determine a commit SHA. Pass --commitSha or run inside a git repository.",
    );
  }
  logger.info(`Commit SHA inferred from repo: ${head}`);
  return head;
};

export interface ResolvedComparison {
  baseSha: string | undefined;
  gitDiffOutput: string | undefined;
}

/**
 * Resolves the comparison inputs (base + git diff) for `agent trigger-test-run`.
 * Either pass them explicitly, or pass `--repoDirectory` to infer:
 * - `baseSha` from the merge-base with the origin default branch;
 * - `gitDiffOutput` as `git diff base..head`, where head is the repo HEAD (or a
 *   `git stash create` commit when the tree is dirty, so the diff is always
 *   between two real commits — no working-tree special case).
 */
export const resolveComparisonOptions = async ({
  baseSha,
  gitDiffOutput,
  repoDirectory,
}: {
  baseSha: string | undefined;
  gitDiffOutput: string | undefined;
  repoDirectory: string | undefined;
}): Promise<ResolvedComparison> => {
  const logger = initLogger();

  if (repoDirectory && (baseSha || gitDiffOutput)) {
    throw new CliUserError(
      "--repoDirectory cannot be combined with --baseSha or --gitDiffOutput. " +
        "When --repoDirectory is provided, both are inferred automatically.",
    );
  }
  if (gitDiffOutput && !baseSha) {
    throw new CliUserError("--gitDiffOutput requires --baseSha.");
  }

  if (!repoDirectory) {
    return {
      baseSha: baseSha || undefined,
      gitDiffOutput: gitDiffOutput || undefined,
    };
  }

  const gitOpts = { cwd: repoDirectory };
  const resolvedBase = (await getLocalBaseSha(gitOpts)) || undefined;
  if (!resolvedBase) {
    throw new CliUserError(
      `Could not determine base SHA from --repoDirectory: ${repoDirectory}. ` +
        "Ensure the repository has an 'origin/main' or 'origin/master' remote branch.",
    );
  }

  const head = (await hasUncommittedChanges(gitOpts))
    ? await getStashCreateSha(gitOpts)
    : await getCommitSha(undefined, gitOpts);
  if (!head) {
    throw new CliUserError(
      `Could not determine head commit from --repoDirectory: ${repoDirectory}.`,
    );
  }

  const diff = await getGitDiff(resolvedBase, head, gitOpts);
  logger.info(`Base SHA inferred from merge-base: ${resolvedBase}`);
  logger.info(`Git diff computed: ${diff.length} chars`);

  return { baseSha: resolvedBase, gitDiffOutput: diff };
};
