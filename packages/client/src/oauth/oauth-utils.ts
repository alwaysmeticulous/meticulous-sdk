const PROJECT_API_TOKEN_PREFIX = "prat-";
const TEST_RUN_API_TOKEN_PREFIX = "trat";

/**
 * Detects whether a token string is an OAuth JWT.
 *
 * JWTs have exactly 3 dot-separated non-empty segments and are not
 * project or test-run API tokens. Mirrors the backend's `isOAuthJwt`.
 */
export const isOAuthJwt = (token: string): boolean => {
  if (
    !token ||
    token.startsWith(PROJECT_API_TOKEN_PREFIX) ||
    token.startsWith(TEST_RUN_API_TOKEN_PREFIX)
  ) {
    return false;
  }
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
};

/**
 * Decodes a JWT's payload claims without verifying the signature. Returns
 * `null` if the token is not a well-formed JWT.
 *
 * Intended for client-side hints (e.g. "is this token expired?"). Never
 * use the result for authorization decisions.
 */
export const getJwtClaims = (token: string): Record<string, unknown> | null => {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/**
 * Returns true if the JWT's `exp` claim has already passed. Returns false
 * if the token is malformed or has no `exp` claim — callers should treat
 * "false" as "no evidence of expiry", not "definitely still valid".
 */
export const isJwtExpired = (token: string): boolean => {
  const claims = getJwtClaims(token);
  const exp = claims?.["exp"];
  if (typeof exp !== "number") {
    return false;
  }
  return exp * 1000 < Date.now();
};
