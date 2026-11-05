import type { MissingCredentialReason } from "./auth-resolution.types";
import type { FetchError } from "./errors";

/**
 * How to authenticate the CLI and agent tooling: an OAuth login first, a
 * static API token only for environments where nobody can log in.
 */
export const MISSING_AUTH_GUIDANCE =
  "Run `meticulous auth login` to log in (add `--non-interactive` in a " +
  "terminal without a browser). For CI or other unattended use, set " +
  "METICULOUS_API_TOKEN or pass --apiToken instead.";

/**
 * A 401/403 for a request that was sent without an Authorization header,
 * carrying why the client had no credential to send.
 */
export class MissingCredentialsError extends Error implements FetchError {
  readonly missingReason: MissingCredentialReason;
  response: FetchError["response"];
  config: FetchError["config"];

  constructor(error: FetchError, missingReason: MissingCredentialReason) {
    super(
      buildMissingCredentialsMessage(
        error.response?.status ?? 401,
        missingReason,
      ),
    );
    this.name = "MissingCredentialsError";
    this.missingReason = missingReason;
    this.response = error.response;
    this.config = error.config;
  }
}

/**
 * Also recognises errors from another loaded copy of this package (where
 * `instanceof` fails) by their name and `missingReason`.
 */
export const isMissingCredentialsError = (
  error: unknown,
): error is MissingCredentialsError => {
  if (error instanceof MissingCredentialsError) {
    return true;
  }
  if (!(error instanceof Error) || error.name !== "MissingCredentialsError") {
    return false;
  }
  const missingReason: unknown = Reflect.get(error, "missingReason");
  return (
    typeof missingReason === "object" &&
    missingReason !== null &&
    typeof Reflect.get(missingReason, "kind") === "string"
  );
};

export const buildMissingCredentialsMessage = (
  status: number,
  reason: MissingCredentialReason,
): string =>
  [
    `Authentication failed (HTTP ${status}): the request was sent without ` +
      `credentials. ${describeMissingCredentialReason(reason)}`,
    adviseOnMissingCredential(reason),
  ].join("\n");

const RETRY_ADVICE =
  "Re-run the command to retry; if this keeps happening, run " +
  "`meticulous auth login` to log in again.";

const API_TOKEN_ONLY_ADVICE = "Pass --apiToken or set METICULOUS_API_TOKEN.";

// The client cannot tell whether its caller would have used the login, so this
// covers commands that authenticate with an API token only.
const API_TOKEN_ONLY_COMMAND_ADVICE =
  "If this command authenticates with an API token only, pass --apiToken or " +
  "set METICULOUS_API_TOKEN instead.";

const adviseOnMissingCredential = (reason: MissingCredentialReason): string => {
  switch (reason.kind) {
    case "refresh-failed":
      return RETRY_ADVICE;
    case "login-not-renewed":
      return `${RETRY_ADVICE} ${API_TOKEN_ONLY_COMMAND_ADVICE}`;
    case "login-not-used":
      return API_TOKEN_ONLY_ADVICE;
    case "not-logged-in":
    case "login-expired":
    case "login-rejected":
    case "login-cleared":
      return MISSING_AUTH_GUIDANCE;
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
};

const describeMissingCredentialReason = (
  reason: MissingCredentialReason,
): string => {
  switch (reason.kind) {
    case "not-logged-in":
      return "You are not logged in, and no API token is set.";
    case "login-expired":
      return (
        "Your Meticulous login expired and could not be renewed (it has no " +
        "refresh token), so it was removed."
      );
    case "login-rejected":
      return (
        `Your Meticulous login is no longer valid (${reason.detail}) — it ` +
        "may have been revoked or logged out elsewhere — so it was removed."
      );
    case "login-cleared":
      return (
        "Your Meticulous login was removed while this command was running, " +
        "by `meticulous auth logout` or by another Meticulous process whose " +
        "login refresh was rejected."
      );
    case "refresh-failed":
      return (
        `Your Meticulous login has expired and refreshing it failed ` +
        `(${reason.detail}). Your login has been kept.`
      );
    case "login-not-renewed":
      return (
        "Your Meticulous login has expired and could not be renewed, and no " +
        "API token is set. Your login has been kept."
      );
    case "login-not-used":
      return (
        "This command authenticates with an API token only, so it does not " +
        "use your Meticulous login, and no API token was passed or found in " +
        "METICULOUS_API_TOKEN or the Meticulous config file."
      );
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
};
