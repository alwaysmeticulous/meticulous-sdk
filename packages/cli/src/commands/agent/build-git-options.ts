import {
  getCommitSha,
  getGitDiff,
  getLocalBaseSha,
  getStashCreateSha,
  getUntrackedFiles,
  hasUncommittedChanges,
  logNotice,
  logProgress,
} from "@alwaysmeticulous/common";
import { CliUserError } from "../../utils/cli-user-error";

/**
 * Untracked files can't be captured by `git stash create` or a `base..head`
 * diff, so when we infer a build commit / diff from the working tree we refuse
 * to proceed while any exist — otherwise the commit and diff would silently
 * omit them. Staging them (`git add`) moves them into the index, where both the
 * stash commit and the diff pick them up.
 */
const assertNoUntrackedFiles = async (options?: {
  cwd?: string;
}): Promise<void> => {
  const untracked = await getUntrackedFiles(options);
  if (untracked.length === 0) {
    return;
  }
  const shown = untracked.slice(0, 10).join(", ");
  const more =
    untracked.length > 10 ? `, … (+${untracked.length - 10} more)` : "";
  throw new CliUserError(
    `Untracked files present (${shown}${more}). ` +
      "`git add` them (or add them to .gitignore) so they're captured in the " +
      "build's commit and diff, then retry — or pass an explicit --commitSha.",
  );
};

/**
 * Resolves the commit a build is of, for `agent upload-build`. The build's
 * commit must identify a real commit so the deployment's `commitSha` (and the
 * test run's `execution_sha`) faithfully describe what ran:
 * - explicit `--commitSha` wins;
 * - otherwise the HEAD of the git repo at `--repoDirectory`, defaulting to the
 *   local repo (the current directory) when neither flag is given;
 * - a dirty working tree is captured as an ephemeral `git stash create` commit
 *   (a real, unreferenced commit; HEAD/branch untouched) with a stderr warning.
 */
/** Where a build's commit SHA came from (used to label CLI output). */
export type BuildCommitShaSource = "provided" | "local" | "local-ephemeral";

export interface ResolvedBuildCommitSha {
  commitSha: string;
  /**
   * - "provided": an explicit `--commitSha`;
   * - "local": the HEAD of the local repo;
   * - "local-ephemeral": a `git stash create` commit for a dirty working tree.
   */
  source: BuildCommitShaSource;
}

export const resolveBuildCommitSha = async ({
  commitSha,
  repoDirectory,
}: {
  commitSha: string | undefined;
  repoDirectory: string | undefined;
}): Promise<ResolvedBuildCommitSha> => {
  if (commitSha && repoDirectory) {
    throw new CliUserError(
      "--commitSha and --repoDirectory are mutually exclusive. Pass --commitSha " +
        "to use an explicit commit, or --repoDirectory to infer it from a git repository.",
    );
  }

  if (commitSha) {
    logProgress(`commitSha: ${commitSha}`);
    return { commitSha, source: "provided" };
  }

  // No --repoDirectory means "use the local repo" (the current directory).
  const gitOpts = { cwd: repoDirectory ?? "." };
  logProgress(
    repoDirectory
      ? `Using repo directory: ${repoDirectory}`
      : "Using local repo directory",
  );

  await assertNoUntrackedFiles(gitOpts);

  if (await hasUncommittedChanges(gitOpts)) {
    const stashSha = await getStashCreateSha(gitOpts);
    if (stashSha) {
      // Always surface this (not just under --verbose): the build is registered
      // against an ephemeral, unreachable stash commit, which the user can't
      // otherwise recover.
      logNotice(
        `commitSha (local, ephemeral due to dirty working tree): ${stashSha}`,
      );
      return { commitSha: stashSha, source: "local-ephemeral" };
    }
    // The tree is dirty but `git stash create` produced no commit, so we can't
    // capture the uncommitted changes. Fail rather than silently registering the
    // build against clean HEAD (which would omit them) — matches
    // resolveComparisonOptions, which also treats this as fatal.
    throw new CliUserError(
      "Working tree has uncommitted changes but they could not be captured (`git stash create` returned nothing). " +
        "Commit or stash your changes, or pass an explicit --commitSha.",
    );
  }

  const head = await getCommitSha(undefined, gitOpts);
  if (!head) {
    throw new CliUserError(
      "Could not determine a commit SHA. Pass --commitSha or run inside a git repository.",
    );
  }
  logProgress(`commitSha (local): ${head}`);
  return { commitSha: head, source: "local" };
};

/**
 * Resolves the commit to look up an already-uploaded deployment for, when
 * `agent trigger-test-run` is given neither `--deploymentId` nor `--commitSha`.
 * Unlike `resolveBuildCommitSha`, a dirty working tree is a hard failure rather
 * than falling back to an ephemeral `git stash create` commit: no deployment
 * could ever have been uploaded for an ephemeral, unreachable commit, so
 * inferring one here would only ever fail the lookup.
 */
export const resolveHeadCommitShaForLookup = async ({
  repoDirectory,
}: {
  repoDirectory: string | undefined;
}): Promise<string> => {
  const gitOpts = { cwd: repoDirectory ?? "." };

  if (await hasUncommittedChanges(gitOpts)) {
    throw new CliUserError(
      "Working tree has uncommitted changes, so the current commit can't be used to look up an already-uploaded deployment. " +
        "Commit your changes, or pass an explicit --commitSha or --deploymentId.",
    );
  }

  const head = await getCommitSha(undefined, gitOpts);
  if (!head) {
    throw new CliUserError(
      "Could not determine a commit SHA from the local repository. Pass --commitSha or --deploymentId, or run inside a git repository.",
    );
  }
  logProgress(`commitSha (inferred from local HEAD): ${head}`);
  return head;
};

export interface ResolvedComparison {
  baseSha: string | undefined;
  gitDiffOutput: string | undefined;
  /**
   * The head commit the diff was computed against. Only known when inferred from
   * `--repoDirectory`; undefined when the caller passed an opaque `--gitDiffOutput`.
   * Used to warn if it diverges from the deployment the run actually executes.
   */
  head: string | undefined;
  /**
   * True when `head` is an ephemeral `git stash create` commit (dirty tree).
   * Such SHAs differ between invocations for identical content, so the head
   * drift check is meaningless and should be skipped.
   */
  headIsEphemeral: boolean;
}

/**
 * Resolves the comparison inputs (base + git diff) for `agent trigger-test-run`.
 * Either pass them explicitly (`--baseSha`, optionally `--gitDiffOutput`), pass
 * `--repoDirectory`, or pass nothing at all — when no comparison inputs are
 * given we infer from the local repo (the current directory), the same way
 * `--repoDirectory .` would. Inference yields:
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
  if (repoDirectory && (baseSha || gitDiffOutput)) {
    throw new CliUserError(
      "--repoDirectory cannot be combined with --baseSha or --gitDiffOutput. " +
        "When --repoDirectory is provided, both are inferred automatically.",
    );
  }
  if (gitDiffOutput && !baseSha) {
    throw new CliUserError("--gitDiffOutput requires --baseSha.");
  }

  // With no explicit comparison inputs, fall back to inferring from the local
  // repo (the current directory).
  const effectiveRepoDirectory =
    repoDirectory ?? (!baseSha && !gitDiffOutput ? "." : undefined);

  if (!effectiveRepoDirectory) {
    return {
      baseSha: baseSha || undefined,
      gitDiffOutput: gitDiffOutput || undefined,
      head: undefined,
      headIsEphemeral: false,
    };
  }

  const gitOpts = { cwd: effectiveRepoDirectory };
  await assertNoUntrackedFiles(gitOpts);
  const resolvedBase = (await getLocalBaseSha(gitOpts)) || undefined;
  if (!resolvedBase) {
    throw new CliUserError(
      `Could not determine a base SHA from the git repository at '${effectiveRepoDirectory}'. ` +
        "Ensure it has an 'origin/main' or 'origin/master' remote branch, or pass --baseSha explicitly.",
    );
  }

  const dirty = await hasUncommittedChanges(gitOpts);
  const head = dirty
    ? await getStashCreateSha(gitOpts)
    : await getCommitSha(undefined, gitOpts);
  if (!head) {
    throw new CliUserError(
      `Could not determine head commit from the git repository at '${effectiveRepoDirectory}'.`,
    );
  }
  if (dirty) {
    // Always surface this (not just under --verbose): the diff is computed
    // against an ephemeral stash commit rather than HEAD.
    logNotice(
      `commitSha (local, ephemeral due to dirty working tree): ${head}`,
    );
  }

  const diff = await getGitDiff(resolvedBase, head, gitOpts);
  logProgress(`Base SHA inferred from merge-base: ${resolvedBase}`);
  logProgress(`Git diff computed: ${diff.length} chars`);

  return {
    baseSha: resolvedBase,
    gitDiffOutput: diff,
    head,
    headIsEphemeral: dirty,
  };
};
