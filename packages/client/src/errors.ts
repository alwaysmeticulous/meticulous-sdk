import type {
  AuthTokenResolution,
  MissingCredentialReason,
} from "./auth-resolution.types";
import { explainMissingApiToken } from "./explain-missing-api-token";
import { describeFetchError } from "./fetch-error-message";
import {
  isMissingCredentialsError,
  MissingCredentialsError,
} from "./missing-credentials";
import {
  credentialKindOf,
  isRejectedCredentialsError,
  RejectedCredentialsError,
} from "./rejected-credentials";

export interface FetchError extends Error {
  response?:
    | {
        status: number;
        statusText: string;
        data: any;
        headers: Record<string, string>;
      }
    | undefined;
  config?:
    | {
        url: string;
        method?: string;
      }
    | undefined;
}

export const isFetchError = (error: any): error is FetchError => {
  return error && typeof error === "object" && error.response;
};

export const isAuthFailureStatus = (status: number | undefined): boolean =>
  status === 401 || status === 403;

export const maybeEnrichFetchError = <T = unknown>(error: T): T => {
  if (isFetchError(error)) {
    // buildClient may already have explained an auth failure. Rebuilding from
    // the response body would discard that explanation (or, for a rejected
    // credential, which kind of credential was sent), so leave those alone.
    if (isMissingCredentialsError(error) || isRejectedCredentialsError(error)) {
      return error;
    }
    return enrichFetchError(error) as T;
  }
  return error;
};

/**
 * When a request was sent without an Authorization header (the token
 * resolution produced none) and the server responded 401/403, replaces the
 * error with a {@link MissingCredentialsError} explaining why no credential
 * was sent and how to log in. Returns the original error unchanged otherwise.
 *
 * `credential` also accepts a boolean (whether an Authorization header was
 * sent) for compatibility with earlier versions. A missing token that no
 * resolution explains (`false`, or an empty token) is explained by the stored
 * OAuth login at the time of the failure: no login, an expired one, or one the
 * caller does not use because it authenticates with an API token only.
 */
export const maybeEnrichMissingAuthFetchError = <T = unknown>(
  error: T,
  credential: boolean | AuthTokenResolution,
): T => {
  if (!isFetchError(error) || !isAuthFailureStatus(error.response?.status)) {
    return error;
  }
  const missingReason = getMissingCredentialReason(credential);
  if (missingReason === null) {
    return error;
  }
  return new MissingCredentialsError(error, missingReason) as T;
};

/**
 * When a request that carried `sentToken` got a 401/403, replaces the error
 * with a {@link RejectedCredentialsError} saying which kind of credential was
 * rejected. Returns the original error unchanged otherwise.
 */
export const maybeTagRejectedCredentialsError = <T = unknown>(
  error: T,
  sentToken: string,
): T => {
  if (!isFetchError(error) || !isAuthFailureStatus(error.response?.status)) {
    return error;
  }
  return new RejectedCredentialsError(error, credentialKindOf(sentToken)) as T;
};

const getMissingCredentialReason = (
  credential: boolean | AuthTokenResolution,
): MissingCredentialReason | null => {
  if (typeof credential === "boolean") {
    return credential ? null : explainMissingApiToken();
  }
  if (credential.token === null) {
    return credential.missingReason;
  }
  // An empty token is sent as no Authorization header at all.
  return credential.token ? null : explainMissingApiToken();
};

const enrichFetchError = (error: FetchError) => {
  const message = describeFetchError(error);
  if (!message) {
    return error;
  }

  const newError = new Error(message) as FetchError;
  newError.response = error.response;
  newError.config = error.config;
  return newError;
};
