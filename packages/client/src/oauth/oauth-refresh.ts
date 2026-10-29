import { initLogger, logNotice } from "@alwaysmeticulous/common";
import { CLI_CLIENT_ID, getTokenEndpoint } from "./oauth-constants";
import type { RefreshOutcome } from "./oauth-refresh.types";
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

// A long-lived client re-resolves its token on every request, so during an
// outage each request retries the refresh; only warn about it once.
let hasWarnedAboutFailedRefresh = false;

// Parallel requests at expiry would otherwise each refresh with the same
// refresh token, and once the server rotates it the losers get `invalid_grant`.
let inFlightAccessToken: Promise<string | null> | null = null;

/**
 * Returns a usable OAuth access token, refreshing it if it is about to expire.
 *
 * Stored tokens are only cleared when the authorization server rejects the
 * refresh token. Transient failures (network errors, timeouts, 5xx, 429, ...)
 * keep them so a later call can retry the refresh, and return the current
 * access token while it has not yet expired, or null once it has.
 */
export const getValidAccessToken = (): Promise<string | null> => {
  inFlightAccessToken ??= resolveAccessToken().finally(() => {
    inFlightAccessToken = null;
  });
  return inFlightAccessToken;
};

const resolveAccessToken = async (): Promise<string | null> => {
  const tokens = getStoredOAuthTokens();
  if (!tokens) {
    return null;
  }

  if (isFresh(tokens)) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    clearOAuthTokens();
    return null;
  }

  const outcome = await refreshTokens(tokens);
  if (outcome.status === "refreshed") {
    return outcome.accessToken;
  }

  if (outcome.status === "rejected") {
    return clearRejectedTokens(tokens.refreshToken, outcome.reason);
  }

  if (isUnexpired(tokens)) {
    return tokens.accessToken;
  }

  warnRefreshFailedOnce(outcome.reason);
  return null;
};

const refreshTokens = async (
  tokens: StoredOAuthTokens,
): Promise<RefreshOutcome> => {
  try {
    const signal = AbortSignal.timeout(REFRESH_TIMEOUT_MS);
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
  } catch (error) {
    return { status: "failed", reason: describeRequestError(error) };
  }
};

// Another CLI process may have rotated the refresh token while this refresh was
// in flight; the server then rejects our superseded copy even though the stored
// login is fine, so only clear it if it is still the token that was rejected.
const clearRejectedTokens = (
  rejectedRefreshToken: string,
  reason: string,
): string | null => {
  const current = getStoredOAuthTokens();
  if (current && current.refreshToken !== rejectedRefreshToken) {
    return isUnexpired(current) ? current.accessToken : null;
  }
  clearOAuthTokens();
  logNotice(
    `Your Meticulous login is no longer valid (${reason}); log in again with \`meticulous auth login\`.`,
  );
  return null;
};

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
