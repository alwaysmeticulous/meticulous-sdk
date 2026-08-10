import {
  clearOAuthTokens,
  getStoredOAuthTokens,
  isAuthFailureStatus,
  isFetchError,
  isJwtExpired,
  MISSING_AUTH_GUIDANCE,
} from "@alwaysmeticulous/client";
import { CliUserError } from "./cli-user-error";

/**
 * Handles a 401/403 response from an OAuth-authenticated request.
 *
 * - When the stored access token is genuinely past its `exp`, clears
 *   stored tokens so the next command kicks off a fresh OAuth login.
 * - When no OAuth tokens are stored, surfaces guidance that auth is
 *   probably missing (token / login / env injection).
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
  if (!isAuthFailureStatus(status)) {
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

  if (!stored) {
    throw new CliUserError(
      `Authentication failed (HTTP ${status})${detail}\n${MISSING_AUTH_GUIDANCE}`,
    );
  }

  throw new CliUserError(
    `Authentication failed (HTTP ${status})${detail}\n` +
      "If the token is stale, run `meticulous auth logout` and re-run the command.",
  );
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
  return message ? new CliUserError(message) : error;
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
