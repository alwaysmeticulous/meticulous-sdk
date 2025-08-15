import log from "loglevel";

export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  shouldRetry?: (error: any) => boolean;
  logger?: log.Logger;
}

export const defaultShouldRetry = (error: any): boolean => {
  if (error.name === "AbortError") {
    return false;
  }
  if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT") {
    return true;
  }
  if (error.response && error.response.status >= 500) {
    return true;
  }
  return false;
};

export const executeWithRetry = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> => {
  const {
    maxRetries = 3,
    retryDelay = 1000,
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
        const delay = (attempt + 1) * retryDelay;
        if (logger) {
          logger.warn(`Operation failed, retrying... (attempt ${attempt + 2})`);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }

  throw lastError;
};
