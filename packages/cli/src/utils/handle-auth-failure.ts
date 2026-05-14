import {
  clearOAuthTokens,
  getStoredOAuthTokens,
  isFetchError,
  isJwtExpired,
} from "@alwaysmeticulous/client";
import { CliUserError } from "./cli-user-error";

/**
 * Handles a 401/403 response from an OAuth-authenticated request.
 *
 * - When the stored access token is genuinely past its `exp`, clears
 *   stored tokens so the next command kicks off a fresh OAuth login.
 * - Otherwise (e.g. issuer/audience mismatch against the configured
 *   backend), keeps the tokens and surfaces the backend's actual
 *   rejection message plus a pointer to `meticulous auth logout`.
 *
 * Throws `CliUserError` when the error is an auth failure, so the
 * command exits non-zero via `wrapHandler`. Returns `false` (no throw)
 * when the error is not an auth failure — the caller should rethrow.
 *
 * Typical use at a call site:
 *   try { ... } catch (error) { handleAuthFailure(error); throw error; }
 */
export const handleAuthFailure = (error: unknown): false => {
  if (!isFetchError(error)) {
    return false;
  }
  const status = error.response?.status;
  if (status !== 401 && status !== 403) {
    return false;
  }

  const stored = getStoredOAuthTokens();
  const expired = stored ? isJwtExpired(stored.accessToken) : false;

  if (expired) {
    clearOAuthTokens();
    throw new CliUserError(
      "Your stored OAuth token has expired and could not be refreshed. " +
        "Re-run the command to start a fresh login.",
    );
  }

  const serverMessage = extractServerMessage(error.response?.data);
  const detail = serverMessage ? `: ${serverMessage}` : ".";
  throw new CliUserError(
    `Authentication failed (HTTP ${status})${detail}\n` +
      "If the token is stale, run `meticulous auth logout` and re-run the command.",
  );
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
