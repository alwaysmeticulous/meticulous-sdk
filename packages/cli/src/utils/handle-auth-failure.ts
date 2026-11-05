import {
  getStoredOAuthTokens,
  isAuthFailureStatus,
  isFetchError,
  isJwtExpired,
  isMissingCredentialsError,
  isRejectedCredentialsError,
  type SentCredentialKind,
} from "@alwaysmeticulous/client";
import { CliUserError, type CliUserErrorMetadata } from "./cli-user-error";

/**
 * Handles a 401/403 response by throwing the {@link toAuthFailureCliUserError}
 * explanation, so the command exits non-zero via `wrapHandler`. Returns
 * `false` (no throw) when the error is not an auth failure — the caller should
 * rethrow.
 *
 * Typical use at a call site:
 *   try { ... } catch (error) { handleAuthFailure(error); throw error; }
 */
export const handleAuthFailure = (error: unknown): false => {
  const authFailure = toAuthFailureCliUserError(error);
  if (authFailure) {
    throw authFailure;
  }
  return false;
};

/**
 * Explains a 401/403 as a `CliUserError`, or returns `null` when the error is
 * not an auth failure.
 *
 * - When the request went out without credentials, the client already
 *   explained why (not logged in, login expired/revoked/removed/not used,
 *   refresh failed) and how to authenticate; surfaces that as-is.
 * - Otherwise a credential was sent and rejected (e.g. issuer/audience
 *   mismatch against the configured backend, or no access to the project).
 *   The client tags which kind of credential that was; for an untagged error
 *   (e.g. from a client built by an older copy of the package) it is inferred
 *   from whether an OAuth login is stored.
 *   - For an OAuth login whose stored access token is genuinely past its
 *     `exp`, it could not be refreshed for a transient reason (a refresh token
 *     the server rejects is cleared during the refresh), so keeps the tokens
 *     for the next command to retry and points at `meticulous auth login` if
 *     that keeps failing.
 *   - Otherwise keeps the tokens and surfaces the backend's actual rejection
 *     message plus what to check for that kind of credential.
 */
export const toAuthFailureCliUserError = (
  error: unknown,
  metadata: Pick<CliUserErrorMetadata, "sourceDeploymentId"> = {},
): CliUserError | null => {
  if (!isFetchError(error)) {
    return null;
  }
  const status = error.response?.status;
  if (!isAuthFailureStatus(status)) {
    return null;
  }
  const authError = (message: string) =>
    new CliUserError(message, 1, "error", { ...metadata, reason: "auth" });

  if (isMissingCredentialsError(error)) {
    return authError(error.message);
  }

  const stored = getStoredOAuthTokens();
  const credentialKind = isRejectedCredentialsError(error)
    ? error.credentialKind
    : inferCredentialKind(stored != null);

  if (
    credentialKind === "oauth-login" &&
    stored &&
    isJwtExpired(stored.accessToken)
  ) {
    return authError(
      "Your stored OAuth token has expired and could not be refreshed. " +
        "Check your network connection and re-run the command; if this keeps " +
        "happening, run `meticulous auth login`.",
    );
  }

  const serverMessage = extractServerMessage(error.response?.data);
  const detail = serverMessage ? `: ${serverMessage}` : ".";

  return authError(
    `Authentication failed (HTTP ${status})${detail}\n` +
      "The credential sent with this request was rejected, or does not have " +
      "access to this project or resource. " +
      REJECTED_CREDENTIAL_ADVICE[credentialKind],
  );
};

const inferCredentialKind = (hasStoredLogin: boolean): SentCredentialKind =>
  hasStoredLogin ? "oauth-login" : "api-token";

const REJECTED_CREDENTIAL_ADVICE: Record<SentCredentialKind, string> = {
  "oauth-login":
    "If your login is stale, run `meticulous auth logout` and re-run the " +
    "command.",
  "api-token":
    "Check the API token in use (--apiToken, METICULOUS_API_TOKEN or the " +
    "Meticulous config file), or run `meticulous auth login` to use your own " +
    "login instead.",
};

/**
 * Re-presents a backend rejection as a `CliUserError` carrying the server's own
 * message, so `wrapHandler` prints that message and exits non-zero instead of
 * dumping a fetch error and stack. Use for endpoints whose 4xx bodies are
 * written for the user (e.g. "no default project is set ..." — the backend is
 * the only side that knows *why*, and duplicating that reasoning in the CLI is
 * how the two drift apart). Returns the error unchanged when it carries no
 * message, so genuine transport failures keep their original diagnostics.
 *
 * Deliberately narrowed to `400` rather than "any fetch error with a message":
 * every business rejection these agent endpoints throw for a user to read is a
 * `400` (see `AgentAccountService`'s `BadRequestException`/`AgentReasonedHttpException`
 * throws). A `404` can just as easily mean the route itself doesn't exist (an
 * older backend than this CLI) and a `5xx` is always a real defect — converting
 * those into a `CliUserError` here would stop them reaching Sentry and hide the
 * status/body that would explain them.
 */
export const toServerMessageError = (error: unknown): unknown => {
  if (!isFetchError(error) || error.response?.status !== 400) {
    return error;
  }
  const message = extractServerMessage(error.response?.data);
  return message
    ? new CliUserError(message, 1, "error", { reason: "remote" })
    : error;
};

/**
 * Whether `error` is Nest's default response for a request that matched no
 * route at all (as opposed to a route that matched and rejected the request) —
 * e.g. `{"statusCode":404,"message":"Cannot PUT /api/agent/project", "error":"Not Found"}`.
 * Distinguishes "this CLI is newer than the backend it's talking to" from a
 * genuine, intentionally-thrown 404 (like "project not found"), which callers
 * must not conflate — see `toProjectResolutionError` in `select-project.ts`.
 */
export const isRouteNotFoundError = (error: unknown): boolean => {
  if (!isFetchError(error) || error.response?.status !== 404) {
    return false;
  }
  const message = extractServerMessage(error.response?.data);
  return message != null && /^Cannot [A-Z]+ /.test(message);
};

export const extractServerMessage = (data: unknown): string | null => {
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
