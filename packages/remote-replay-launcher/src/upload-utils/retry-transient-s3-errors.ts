export class S3UploadError extends Error {
  public readonly statusCode: number;
  public readonly responseBody: string;

  constructor(statusCode: number, responseBody: string) {
    super(
      `Failed to upload!\nStatus ${statusCode}.\nResponse:\n${responseBody}`,
    );
    this.name = "S3UploadError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

// Node networking errors that are safe to retry. S3 occasionally resets
// connections under load; these show up here rather than as HTTP errors.
// Excludes ECONNREFUSED and ENOTFOUND because those typically indicate
// misconfiguration rather than transient failures (EAI_AGAIN covers the
// transient-DNS case).
const TRANSIENT_NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNABORTED",
  "EAI_AGAIN",
  "EPIPE",
]);

export const isTransientS3Error = (error: unknown): boolean => {
  if (error instanceof S3UploadError) {
    return TRANSIENT_STATUS_CODES.has(error.statusCode);
  }
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string" && TRANSIENT_NETWORK_ERROR_CODES.has(code)) {
      return true;
    }
  }
  return false;
};

export interface RetryTransientS3ErrorsOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, error: unknown) => void;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 200;
const MAX_DELAY_MS = 30_000;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const retryTransientS3Errors = async <T>(
  operation: () => Promise<T>,
  options: RetryTransientS3ErrorsOptions = {},
): Promise<T> => {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientS3Error(error) || attempt === maxAttempts) {
        throw error;
      }
      // Exponential backoff with a jitter multiplier in [0.5, 1.5), capped
      // to bound worst-case sleep when callers pass a large baseDelayMs.
      const jitter = 0.5 + Math.random();
      const delayMs = Math.min(
        Math.floor(baseDelayMs * Math.pow(2, attempt - 1) * jitter),
        MAX_DELAY_MS,
      );
      options.onRetry?.(attempt, error);
      await sleep(delayMs);
    }
  }
  throw lastError;
};
