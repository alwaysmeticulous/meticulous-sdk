import type { SentCredentialKind } from "./auth-resolution.types";
import type { FetchError } from "./errors";
import { describeFetchError } from "./fetch-error-message";
import { isOAuthJwt } from "./oauth/oauth-utils";

/**
 * A 401/403 for a request that did carry a credential: the server rejected
 * it, or it does not have access to the requested project or resource. The
 * message is the server's, as `maybeEnrichFetchError` would describe it;
 * `credentialKind` lets callers advise on the credential that was sent.
 */
export class RejectedCredentialsError extends Error implements FetchError {
  readonly credentialKind: SentCredentialKind;
  response: FetchError["response"];
  config: FetchError["config"];

  constructor(error: FetchError, credentialKind: SentCredentialKind) {
    super(describeFetchError(error) || error.message);
    this.name = "RejectedCredentialsError";
    this.credentialKind = credentialKind;
    this.response = error.response;
    this.config = error.config;
  }
}

/**
 * Also recognises errors from another loaded copy of this package (where
 * `instanceof` fails) by their name and `credentialKind`.
 */
export const isRejectedCredentialsError = (
  error: unknown,
): error is RejectedCredentialsError => {
  if (error instanceof RejectedCredentialsError) {
    return true;
  }
  if (!(error instanceof Error) || error.name !== "RejectedCredentialsError") {
    return false;
  }
  return typeof Reflect.get(error, "credentialKind") === "string";
};

export const credentialKindOf = (token: string): SentCredentialKind =>
  isOAuthJwt(token) ? "oauth-login" : "api-token";
