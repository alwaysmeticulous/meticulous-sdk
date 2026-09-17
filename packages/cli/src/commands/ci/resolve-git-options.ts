import {
  getCommitSha,
  getGitDiff,
  getLocalBaseSha,
  hasUncommittedChanges,
  initLogger,
} from "@alwaysmeticulous/common";
import { CliUserError } from "../../utils/cli-user-error";

export interface ResolvedGitOptions {
  commitSha: string;
  baseSha: string | undefined;
  gitDiffOutput: string | undefined;
}

/**
 * Whether `--waitForTestRunToComplete` is allowed: only when Meticulous is run in the
 * context of a local branch — either `--repoDirectory` (clone on that branch) or explicit
 * `--baseSha` and `--gitDiffOutput` from the same checkout.
 */
export const hasGitContextForTestRunWait = (
  repoDirectory: string | undefined,
  baseSha: string | undefined,
  gitDiffOutput: string | undefined,
): boolean => Boolean(repoDirectory || (baseSha && gitDiffOutput));

/**
 * Resolves git options (commitSha, baseSha, gitDiffOutput) from either
 * explicit CLI arguments or by auto-inferring from a --repoDirectory.
 *
 * When --repoDirectory is provided, all three values are inferred and the
 * command fails if any cannot be computed.
 */
export const resolveGitOptions = async ({
  commitSha: commitSha_,
  baseSha: baseSha_,
  gitDiffOutput: gitDiffOutput_,
  repoDirectory,
}: {
  commitSha: string | undefined;
  baseSha: string | undefined;
  gitDiffOutput: string | undefined;
  repoDirectory: string | undefined;
}): Promise<ResolvedGitOptions> => {
  if (repoDirectory && (commitSha_ || baseSha_ || gitDiffOutput_)) {
    throw new CliUserError(
      "--repoDirectory cannot be combined with --commitSha, --baseSha, or --gitDiffOutput. " +
        "When --repoDirectory is provided, all git options are inferred automatically.",
      1,
      "error",
      { reason: "usage" },
    );
  }

  if (gitDiffOutput_ && !baseSha_) {
    throw new CliUserError("--gitDiffOutput requires --baseSha.", 1, "error", {
      reason: "usage",
    });
  }

  if (repoDirectory) {
    return resolveFromRepoDirectory(repoDirectory);
  }

  return resolveFromExplicitArgs({ commitSha_, baseSha_, gitDiffOutput_ });
};

const resolveFromRepoDirectory = async (
  repoDirectory: string,
): Promise<ResolvedGitOptions> => {
  const logger = initLogger();
  const gitOpts = { cwd: repoDirectory };

  const commitSha = await getCommitSha(undefined, gitOpts);
  if (!commitSha) {
    throw new CliUserError(
      `Could not determine commit SHA from --repoDirectory: ${repoDirectory}`,
      1,
      "error",
      { reason: "environment" },
    );
  }

  const uncommitted = await hasUncommittedChanges(gitOpts);

  const baseSha = (await getLocalBaseSha(gitOpts)) || undefined;
  if (!baseSha) {
    throw new CliUserError(
      `Could not determine base SHA from --repoDirectory: ${repoDirectory}. ` +
        "Ensure the repository has an 'origin/main' or 'origin/master' remote branch.",
      1,
      "error",
      { reason: "environment" },
    );
  }

  const gitDiffOutput = uncommitted
    ? await getGitDiff(baseSha, undefined, gitOpts)
    : await getGitDiff(baseSha, commitSha, gitOpts);

  logger.info(
    `Commit SHA inferred from repo${uncommitted ? " (with uncommitted changes)" : ""}: ${commitSha}`,
  );
  logger.info(`Base SHA inferred from merge-base: ${baseSha}`);
  logger.info(`Git diff output computed: ${gitDiffOutput.length} chars`);

  return {
    commitSha,
    baseSha,
    gitDiffOutput,
  };
};

const resolveFromExplicitArgs = async ({
  commitSha_,
  baseSha_,
  gitDiffOutput_,
}: {
  commitSha_: string | undefined;
  baseSha_: string | undefined;
  gitDiffOutput_: string | undefined;
}): Promise<ResolvedGitOptions> => {
  const logger = initLogger();

  const commitSha = await getCommitSha(commitSha_);
  if (!commitSha) {
    throw new CliUserError(
      "No commit SHA found. Provide one with --commitSha or use --repoDirectory.",
      1,
      "error",
      { reason: "environment" },
    );
  }

  if (commitSha_) {
    logger.info(`Commit SHA provided: ${commitSha}`);
  } else {
    logger.info(`Commit SHA inferred from local repo: ${commitSha}`);
  }

  const baseSha = baseSha_ || undefined;
  const gitDiffOutput = gitDiffOutput_ || undefined;

  if (baseSha) {
    logger.info(`Base SHA provided: ${baseSha}`);
  }
  if (gitDiffOutput) {
    logger.info(`Git diff output provided: ${gitDiffOutput.length} chars`);
  }

  return { commitSha, baseSha, gitDiffOutput };
};
