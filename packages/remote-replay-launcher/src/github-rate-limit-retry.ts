export type GitHubDelayedRetrySkipReason =
  | "github_rate_limit_retry_scheduled"
  | "github_server_error_retry_scheduled";

/**
 * User-facing message for a trigger that created no test run because GitHub's
 * primary rate limit was hit, or GitHub returned a server error, and the server
 * scheduled a delayed retry. Shared by every upload path so they all report the
 * same non-failure skip.
 */
export const describeGitHubRateLimitRetry = (
  serverMessage: string | undefined,
  isServerError: boolean = false,
): string =>
  isServerError
    ? `${
        serverMessage ??
        "GitHub returned a server error while triggering the test run; a retry has been scheduled."
      } The test run will be created automatically once GitHub recovers, and its results will be posted to the pull request.`
    : `${
        serverMessage ??
        "GitHub's API rate limit was hit while triggering the test run; a retry has been scheduled."
      } The test run will be created automatically once the limit resets, and its results will be posted to the pull request.`;

export const getGitHubDelayedRetrySkipReason = (
  isServerError: boolean | undefined,
): GitHubDelayedRetrySkipReason =>
  isServerError
    ? "github_server_error_retry_scheduled"
    : "github_rate_limit_retry_scheduled";
