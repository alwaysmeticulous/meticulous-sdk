import {
  clearOAuthTokens,
  getStoredOAuthTokens,
  isFetchError,
  isJwtExpired,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";

/**
 * Handles a 401/403 response from an OAuth-authenticated request.
 *
 * - When the stored access token is genuinely past its `exp`, clears
 *   stored tokens so the next command kicks off a fresh OAuth login.
 * - Otherwise (e.g. issuer/audience mismatch against the configured
 *   backend), keeps the tokens and surfaces the backend's actual
 *   rejection message plus a pointer to `meticulous auth logout`.
 *
 * Returns `true` if the error was handled (caller should not rethrow);
 * `false` if the error was not an auth failure.
 */
export const handleAuthFailure = (error: unknown): boolean => {
  if (!isFetchError(error)) {
    return false;
  }
  const status = error.response?.status;
  if (status !== 401 && status !== 403) {
    return false;
  }

  const logger = initLogger();
  const stored = getStoredOAuthTokens();
  const expired = stored ? isJwtExpired(stored.accessToken) : false;

  const serverMessage = extractServerMessage(error.response?.data);

  if (expired) {
    clearOAuthTokens();
    logger.error(
      "Your stored OAuth token has expired and could not be refreshed. " +
        "Re-run the command to start a fresh login.",
    );
    return true;
  }

  const detail = serverMessage ? `: ${serverMessage}` : ".";
  logger.error(
    `Authentication failed (HTTP ${status})${detail}\n` +
      "If the token is stale, run `meticulous auth logout` and re-run the command.",
  );
  return true;
};

const extractServerMessage = (data: unknown): string | null => {
  if (!data) {
    return null;
  }
  if (typeof data === "string") {
    return data;
  }
  if (typeof data === "object") {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return null;
};
