/**
 * User-facing message for a trigger that created no test run because GitHub's
 * primary rate limit was hit and the server scheduled a delayed retry. Shared
 * by every upload path so they all report the same non-failure skip.
 */
export const describeGitHubRateLimitRetry = (
  serverMessage: string | undefined,
): string =>
  `${
    serverMessage ??
    "GitHub's API rate limit was hit while triggering the test run; a retry has been scheduled."
  } The test run will be created automatically once the limit resets, and its results will be posted to the pull request.`;
