import {
  getCommitSha,
  getGitDiff,
  getLocalBaseSha,
  hasUncommittedChanges,
  initLogger,
} from "@alwaysmeticulous/common";

export interface ResolvedGitOptions {
  commitSha: string;
  baseSha: string | undefined;
  gitDiffOutput: string | undefined;
  withUncommittedChanges: boolean;
}

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
  const logger = initLogger();

  if (repoDirectory && (commitSha_ || baseSha_ || gitDiffOutput_)) {
    logger.error(
      "--repoDirectory cannot be combined with --commitSha, --baseSha, or --gitDiffOutput. " +
        "When --repoDirectory is provided, all git options are inferred automatically.",
    );
    process.exit(1);
  }

  if (gitDiffOutput_ && !baseSha_) {
    logger.error("--gitDiffOutput requires --baseSha.");
    process.exit(1);
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
    logger.error(
      `Could not determine commit SHA from --repoDirectory: ${repoDirectory}`,
    );
    process.exit(1);
  }

  const uncommitted = await hasUncommittedChanges(gitOpts);

  const baseSha = (await getLocalBaseSha(gitOpts)) || undefined;
  if (!baseSha) {
    logger.error(
      `Could not determine base SHA from --repoDirectory: ${repoDirectory}. ` +
        "Ensure the repository has an 'origin/main' or 'origin/master' remote branch.",
    );
    process.exit(1);
  }

  const gitDiffOutput = uncommitted
    ? await getGitDiff(baseSha, undefined, gitOpts)
    : await getGitDiff(baseSha, commitSha, gitOpts);

  logger.info(
    `Commit SHA inferred from repo${uncommitted ? " (uncommitted changes)" : ""}: ${commitSha}`,
  );
  logger.info(`Base SHA inferred from merge-base: ${baseSha}`);
  logger.info(
    `Git diff output computed: ${gitDiffOutput.length} chars`,
  );

  return { commitSha, baseSha, gitDiffOutput, withUncommittedChanges: uncommitted };
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
    logger.error(
      "No commit SHA found. Provide one with --commitSha or use --repoDirectory.",
    );
    process.exit(1);
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

  return { commitSha, baseSha, gitDiffOutput, withUncommittedChanges: false };
};
