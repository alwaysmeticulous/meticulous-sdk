// Commit SHAs in a debug context come from API records (replays, test runs),
// so only hex object ids may be passed to git as a ref.
const GIT_COMMIT_SHA_PATTERN = /^[0-9a-f]{7,64}$/i;

export const isValidGitCommitSha = (
  sha: string | null | undefined,
): sha is string => sha != null && GIT_COMMIT_SHA_PATTERN.test(sha);
