/**
 * Whether a failed trigger call means the deployment is still being worked on,
 * rather than having genuinely failed.
 *
 * A 502, 503 or 504 comes from the edge rather than from the trigger itself: a
 * gateway abandoning a response the backend is still producing, or declining to
 * serve one at all. None of them mean the deployment failed. The request whose
 * response was lost carries on server-side and commits its deployment, and its
 * test run, long after the connection is gone.
 *
 * All three are worth coming back for rather than failing on, because the
 * trigger endpoint is idempotent: a later call finds the committed deployment
 * and returns the run it ended up with, instead of starting a second one.
 */
export const isDeploymentStillInProgress = (error: unknown): boolean => {
  const status = (error as { response?: { status?: unknown } } | null)?.response
    ?.status;
  return status === 502 || status === 503 || status === 504;
};

/**
 * How long to keep coming back for a trigger whose response was lost.
 *
 * Three attempts, with the equal-jitter backoff `executeWithRetry` applies:
 * roughly 10-20s after the first loss, then 20-40s after the second. That is
 * deliberately slower than the client's ordinary retries, which are quick
 * enough that all of them land inside the same gateway timeout window and
 * exhaust before a slow trigger has committed its run.
 *
 * Callers supply their own `logger`.
 */
export const DEPLOYMENT_IN_PROGRESS_RETRY = {
  maxRetries: 2,
  retryDelay: 20_000,
  maxRetryDelay: 60_000,
  shouldRetry: isDeploymentStillInProgress,
};
