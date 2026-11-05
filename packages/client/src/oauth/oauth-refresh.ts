import {
  executeWithRetry,
  getErrorCode,
  initLogger,
  logNotice,
} from "@alwaysmeticulous/common";
import { CLI_CLIENT_ID, getTokenEndpoint } from "./oauth-constants";
import type {
  OAuthAccessTokenResolution,
  OAuthUnavailableReason,
  RefreshOutcome,
} from "./oauth-refresh.types";
import {
  classifyErrorResponse,
  describeRequestError,
  isFresh,
  isUnexpired,
  nowSeconds,
  parseTokenResponse,
} from "./oauth-refresh.utils";
import {
  clearOAuthTokens,
  getStoredOAuthTokens,
  type StoredOAuthTokens,
  storeOAuthTokens,
} from "./oauth-token-store";

const REFRESH_TIMEOUT_MS = 30_000;
const MAX_REFRESH_RETRIES = 2;
const REFRESH_RETRY_DELAY_MS = 200;

// Failures where the request never reached the server, such as writing to a
// keep-alive connection it closed while a long-running command sat idle. A
// refresh that did reach it may have rotated the refresh token, and retrying
// with the old one would be rejected and clear the login, so nothing else is
// retried.
const UNSENT_REQUEST_ERROR_CODES = new Set([
  "EPIPE",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
]);

// A long-lived client re-resolves its token on every request, so during an
// outage each request retries the refresh; only warn about it once.
let hasWarnedAboutFailedRefresh = false;

// Parallel requests at expiry would otherwise each refresh with the same
// refresh token, and once the server rotates it the losers get `invalid_grant`.
let inFlightResolution: Promise<OAuthAccessTokenResolution> | null = null;

/**
 * Returns a usable OAuth access token, refreshing it if it is about to expire.
 *
 * Stored tokens are only cleared when the authorization server rejects the
 * refresh token. Transient failures (network errors, timeouts, 5xx, 429, ...)
 * keep them so a later call can retry the refresh, and return the current
 * access token while it has not yet expired, or null once it has.
 */
export const getValidAccessToken = async (): Promise<string | null> =>
  (await resolveOAuthAccessToken()).accessToken;

/**
 * Like {@link getValidAccessToken}, but when no access token is usable it also
 * says why, so a later auth failure can be explained accurately.
 */
export const resolveOAuthAccessToken =
  (): Promise<OAuthAccessTokenResolution> => {
    inFlightResolution ??= resolveAccessToken().finally(() => {
      inFlightResolution = null;
    });
    return inFlightResolution;
  };

const resolveAccessToken = async (): Promise<OAuthAccessTokenResolution> => {
  const tokens = getStoredOAuthTokens();
  if (!tokens) {
    return unavailable({ kind: "not-logged-in" });
  }

  if (isFresh(tokens)) {
    return { accessToken: tokens.accessToken };
  }

  if (!tokens.refreshToken) {
    clearOAuthTokens();
    return unavailable({ kind: "login-expired" });
  }

  const outcome = await refreshTokens(tokens);
  if (outcome.status === "refreshed") {
    return { accessToken: outcome.accessToken };
  }

  if (outcome.status === "rejected") {
    return clearRejectedTokens(tokens.refreshToken, outcome.reason);
  }

  if (isUnexpired(tokens)) {
    return { accessToken: tokens.accessToken };
  }

  warnRefreshFailedOnce(outcome.reason);
  return unavailable({ kind: "refresh-failed", detail: outcome.reason });
};

const refreshTokens = async (
  tokens: StoredOAuthTokens,
): Promise<RefreshOutcome> => {
  try {
    // One deadline for every attempt: queued callers wait on this refresh.
    const signal = AbortSignal.timeout(REFRESH_TIMEOUT_MS);
    return await executeWithRetry(() => requestRefresh(tokens, signal), {
      maxRetries: MAX_REFRESH_RETRIES,
      retryDelay: REFRESH_RETRY_DELAY_MS,
      shouldRetry: (error) => {
        const code = getErrorCode(error);
        return code != null && UNSENT_REQUEST_ERROR_CODES.has(code);
      },
    });
  } catch (error) {
    return { status: "failed", reason: describeRequestError(error) };
  }
};

const requestRefresh = async (
  tokens: StoredOAuthTokens,
  signal: AbortSignal,
): Promise<RefreshOutcome> => {
  const tokenEndpoint = await getTokenEndpoint(signal);
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLI_CLIENT_ID,
      refresh_token: tokens.refreshToken,
    }).toString(),
    signal,
  });

  if (!response.ok) {
    return await classifyErrorResponse(response);
  }

  const data = parseTokenResponse(await response.json());
  if (!data) {
    return {
      status: "failed",
      reason: "token response is missing access_token or expires_in",
    };
  }

  const updatedTokens: StoredOAuthTokens = {
    ...tokens,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    expiresAt: nowSeconds() + data.expires_in,
    ...(data.id_token !== undefined ? { idToken: data.id_token } : {}),
  };
  storeOAuthTokens(updatedTokens);
  return { status: "refreshed", accessToken: updatedTokens.accessToken };
};

// Another CLI process may have rotated the refresh token while this refresh was
// in flight; the server then rejects our superseded copy even though the stored
// login is fine, so only clear it if it is still the token that was rejected.
const clearRejectedTokens = (
  rejectedRefreshToken: string,
  reason: string,
): OAuthAccessTokenResolution => {
  const current = getStoredOAuthTokens();
  if (current && current.refreshToken !== rejectedRefreshToken) {
    return isUnexpired(current)
      ? { accessToken: current.accessToken }
      : unavailable({
          kind: "refresh-failed",
          detail: `${reason}; another Meticulous process renewed your login at the same time`,
        });
  }
  clearOAuthTokens();
  logNotice(
    `Your Meticulous login is no longer valid (${reason}); log in again with \`meticulous auth login\`.`,
  );
  return unavailable({ kind: "login-rejected", detail: reason });
};

const unavailable = (
  reason: OAuthUnavailableReason,
): OAuthAccessTokenResolution => ({ accessToken: null, reason });

const warnRefreshFailedOnce = (reason: string): void => {
  if (hasWarnedAboutFailedRefresh) {
    return;
  }
  hasWarnedAboutFailedRefresh = true;
  initLogger().warn(
    `Could not refresh your Meticulous login (${reason}). Your login ` +
      "has been kept; re-run the command to retry. If this keeps happening, " +
      "run `meticulous auth login`.",
  );
};
