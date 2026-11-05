import type { MissingCredentialReason } from "./auth-resolution.types";
import { getStoredOAuthTokens } from "./oauth/oauth-token-store";
import { isJwtExpired } from "./oauth/oauth-utils";

/**
 * Why a request from a client built from the static token chain (explicit
 * token → METICULOUS_API_TOKEN → config file), which found no token, went out
 * without credentials. That chain never consults the OAuth login, so its state
 * at the time the server rejected the request tells the user what to fix.
 * Never throws: it runs while reporting another error.
 */
export const explainMissingApiToken = (): MissingCredentialReason => {
  try {
    const stored = getStoredOAuthTokens();
    const accessToken = stored?.accessToken;
    if (typeof accessToken !== "string" || !accessToken) {
      return { kind: "not-logged-in" };
    }
    return isJwtExpired(accessToken)
      ? { kind: "login-not-renewed" }
      : { kind: "login-not-used" };
  } catch {
    return { kind: "not-logged-in" };
  }
};
