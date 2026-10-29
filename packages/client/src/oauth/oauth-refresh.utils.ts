import type { RefreshOutcome, TokenResponse } from "./oauth-refresh.types";
import type { StoredOAuthTokens } from "./oauth-token-store";
import { parseOAuthErrorBody } from "./oauth-utils";

const TOKEN_EXPIRY_BUFFER_SECONDS = 30;

// The RFC 6749 §5.2 token-endpoint errors: the server rejected the refresh
// request itself, so retrying it cannot succeed and the user has to log in
// again. Any other 400/401 (no OAuth body, e.g. from a proxy, or a code outside
// this set) is treated as transient.
const REJECTED_REFRESH_ERRORS = new Set([
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "unauthorized_client",
  "unsupported_grant_type",
  "invalid_scope",
]);

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export const isFresh = (tokens: StoredOAuthTokens): boolean =>
  tokens.expiresAt > nowSeconds() + TOKEN_EXPIRY_BUFFER_SECONDS;

export const isUnexpired = (tokens: StoredOAuthTokens): boolean =>
  tokens.expiresAt > nowSeconds();

export const classifyErrorResponse = async (
  response: Response,
): Promise<RefreshOutcome> => {
  const oauthError = await readOAuthError(response);
  const error = oauthError?.error ?? null;
  const detail = describeOAuthError(oauthError);
  const reason = detail
    ? `HTTP ${response.status}: ${detail}`
    : `HTTP ${response.status}`;
  const rejected =
    (response.status === 400 || response.status === 401) &&
    error != null &&
    REJECTED_REFRESH_ERRORS.has(error);
  return { status: rejected ? "rejected" : "failed", reason };
};

export const parseTokenResponse = (data: unknown): TokenResponse | null => {
  if (typeof data !== "object" || data == null) {
    return null;
  }
  const { access_token, expires_in } = data as Partial<TokenResponse>;
  if (typeof access_token !== "string" || typeof expires_in !== "number") {
    return null;
  }
  return data as TokenResponse;
};

// Node's fetch rejects with a bare `TypeError: fetch failed` and keeps the
// actual reason (DNS, TLS, connection refused, ...) in `cause`.
export const describeRequestError = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error);
  }
  if ("cause" in error && error.cause instanceof Error) {
    return `${error.message} (${error.cause.message})`;
  }
  return error.message;
};

const readOAuthError = async (
  response: Response,
): Promise<ReturnType<typeof parseOAuthErrorBody>> => {
  const body = await response.text().catch(() => "");
  return parseOAuthErrorBody(body);
};

const describeOAuthError = (
  oauthError: ReturnType<typeof parseOAuthErrorBody>,
): string | null => {
  const { error, errorDescription } = oauthError ?? {};
  if (error && errorDescription) {
    return `${error} (${errorDescription})`;
  }
  return error || errorDescription || null;
};
