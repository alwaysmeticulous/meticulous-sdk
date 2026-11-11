import type { IAxiosRetryConfig } from "axios-retry";
import { exponentialDelay } from "axios-retry";

const PRESIGNED_URL_MAX_RETRIES = 5;
const PRESIGNED_URL_RETRY_BASE_DELAY_MS = 500;
const PRESIGNED_URL_MAX_RETRY_DELAY_MS = 30_000;

/**
 * Creates axios-retry options for requests to presigned S3 URLs. S3 answers
 * request bursts with `503 SlowDown` and expects clients to back off;
 * axios-retry's default delay is zero, so every retry lands in the same
 * throttled window. Waits ~1s, 2s, 4s, 8s, 16s (plus up to 20% jitter, or
 * longer if the response sends `Retry-After`, but never more than 30s per
 * retry) and still only retries network errors, 429s and 5xxs of idempotent
 * requests. `overrides` are applied on top of these defaults; each call
 * returns a fresh object.
 */
export const createPresignedUrlRetryConfig = (
  overrides: Partial<IAxiosRetryConfig> = {},
): IAxiosRetryConfig => ({
  retries: PRESIGNED_URL_MAX_RETRIES,
  retryDelay: (retryNumber, error) =>
    Math.min(
      exponentialDelay(retryNumber, error, PRESIGNED_URL_RETRY_BASE_DELAY_MS),
      PRESIGNED_URL_MAX_RETRY_DELAY_MS,
    ),
  ...overrides,
});
