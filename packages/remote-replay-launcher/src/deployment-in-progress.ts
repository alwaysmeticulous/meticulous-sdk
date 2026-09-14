import { defaultShouldRetry } from "@alwaysmeticulous/common";

/**
 * Whether a failed trigger call is worth coming back for. Same set as the
 * client's ordinary retries (lost connection, 429, 5xx) — including a
 * connection severed at CloudFront's 30s origin timeout with no status.
 */
export const isDeploymentStillInProgress = (error: unknown): boolean =>
  defaultShouldRetry(error);

/**
 * How long to keep coming back for a trigger whose response was lost.
 * Deliberately slower than the client's ordinary retries — callers must pass
 * {@link WAIT_ON_THE_SLOW_SCHEDULE} so those don't run nested inside this one.
 */
export const DEPLOYMENT_IN_PROGRESS_RETRY = {
  maxRetries: 3,
  retryDelay: 20_000,
  maxRetryDelay: 60_000,
  shouldRetry: isDeploymentStillInProgress,
};

/** Disables the client's own retries so {@link DEPLOYMENT_IN_PROGRESS_RETRY} is the only schedule. */
export const WAIT_ON_THE_SLOW_SCHEDULE = { retry: false } as const;
