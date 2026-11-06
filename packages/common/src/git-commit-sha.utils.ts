/**
 * A hex git object id: a full or abbreviated SHA-1 or SHA-256 commit sha.
 * Only `isGitCommitSha` produces one, so a value of this type is safe to pass
 * to git as a ref.
 */
export type GitCommitSha = string & { readonly __brand: "GitCommitSha" };

/**
 * Whether a value is a hex git object id: a full or abbreviated SHA-1 or
 * SHA-256 commit sha. Use before passing a sha from an API record to git, and
 * to reject non-hex `commitSha` sentinels.
 *
 * Dependency-free so browser bundles can import it via
 * `@alwaysmeticulous/common/git-commit-sha`.
 */
export const isGitCommitSha = (
  sha: string | null | undefined,
): sha is GitCommitSha => sha != null && /^[0-9a-f]{7,64}$/i.test(sha);

/**
 * Value to use as `commitSha` for session selection test runs.
 * We set this to a static value as for non main-branch test runs we don't know what we're simulating against.
 *
 * This value is also used for identifying whether a test run is a session selection one in other parts of the code.
 */
export const SESSION_SELECTION_TEST_RUN_COMMIT_SHA = "unknown";

/**
 * Value to use as `commitSha` for experiment test runs.
 * We set this to a static value as for non main-branch test runs we don't know what we're simulating against.
 *
 * This value is also used for identifying whether a test run is an experiment in other parts of the code.
 */
export const EXPERIMENT_TEST_RUN_COMMIT_SHA = "experiment";

/**
 * Commit SHAs stored when a run has no real git commit. Not valid pins for
 * repo-server, artifact, or hosting-provider lookups.
 */
export const SENTINEL_COMMIT_SHAS: readonly string[] = [
  SESSION_SELECTION_TEST_RUN_COMMIT_SHA,
  EXPERIMENT_TEST_RUN_COMMIT_SHA,
];
