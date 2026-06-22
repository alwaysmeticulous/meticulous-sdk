import type log from "loglevel";
import { getErrorCode } from "./error-code.utils";

export interface RetryOptions {
  maxRetries?: number;
  /** Base delay used to seed the exponential backoff, in milliseconds. */
  retryDelay?: number;
  /** Upper bound on any single backoff wait, in milliseconds. */
  maxRetryDelay?: number;
  shouldRetry?: (error: any) => boolean;
  logger?: log.Logger;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 30_000;

/**
 * Extra random window (ms) added on top of a server-directed `Retry-After`
 * wait so that a fleet of clients told to back off at the same instant don't
 * all retry in lockstep.
 */
const RETRY_AFTER_JITTER_MS = 1_000;

export const defaultShouldRetry = (error: any): boolean => {
  if (error.name === "AbortError") {
    return false;
  }
  const errorCode = getErrorCode(error);
  if (errorCode === "ECONNRESET" || errorCode === "ETIMEDOUT") {
    return true;
  }
  const status: unknown = error.response?.status;
  // 429 (Too Many Requests) and 503 (Service Unavailable) are the backpressure
  // signals the backend emits when it sheds load; back off and retry rather
  // than hammering. All other 5xx are also treated as transient.
  if (status === 429) {
    return true;
  }
  if (typeof status === "number" && status >= 500) {
    return true;
  }
  return false;
};

/**
 * Parses a `Retry-After` response header (delay in seconds or an HTTP date)
 * from an error thrown by the client. Returns the wait in milliseconds, or
 * `null` when no usable header is present.
 */
export const getRetryAfterMs = (
  error: any,
  now: number = Date.now(),
): number | null => {
  const headers = error?.response?.headers;
  if (!headers || typeof headers !== "object") {
    return null;
  }
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  if (raw == null) {
    return null;
  }
  const value = Array.isArray(raw) ? raw[0] : String(raw);

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000);
  }

  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - now);
  }

  return null;
};

/**
 * Computes how long to wait before the next retry attempt.
 *
 * - When the server sent a `Retry-After`, honour it (capped) plus a small
 *   random window so callers don't retry in lockstep.
 * - Otherwise use exponential backoff with "equal jitter": half the capped
 *   backoff is fixed and the other half is random, which decorrelates retries
 *   across a fleet while still guaranteeing meaningful spacing.
 *
 * `attempt` is 0-indexed. `random` is injectable for deterministic tests.
 */
export const computeRetryDelayMs = (
  attempt: number,
  {
    retryDelay,
    maxRetryDelay,
    retryAfterMs,
  }: { retryDelay: number; maxRetryDelay: number; retryAfterMs: number | null },
  random: () => number = Math.random,
): number => {
  if (retryAfterMs != null) {
    const jitter = random() * RETRY_AFTER_JITTER_MS;
    return Math.min(retryAfterMs + jitter, maxRetryDelay);
  }

  const cappedBackoff = Math.min(retryDelay * 2 ** attempt, maxRetryDelay);
  return cappedBackoff / 2 + random() * (cappedBackoff / 2);
};

export const executeWithRetry = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> => {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY_MS,
    maxRetryDelay = DEFAULT_MAX_RETRY_DELAY_MS,
    shouldRetry = defaultShouldRetry,
    logger,
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries && shouldRetry(error)) {
        const delay = computeRetryDelayMs(attempt, {
          retryDelay,
          maxRetryDelay,
          retryAfterMs: getRetryAfterMs(error),
        });
        if (logger) {
          logger.warn(
            `Operation failed, retrying in ${Math.round(delay)}ms (attempt ${
              attempt + 2
            } of ${maxRetries + 1})`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }

  throw lastError;
};
