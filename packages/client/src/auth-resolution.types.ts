import type { OAuthUnavailableReason } from "./oauth/oauth-refresh.types";

/**
 * Why a request went out without an Authorization header, as known by the
 * token resolution that produced no credential. Used to explain a 401/403 to
 * the user instead of guessing.
 */
export type MissingCredentialReason =
  | OAuthUnavailableReason
  /** The stored OAuth login was removed while this client was in use. */
  | { kind: "login-cleared" }
  /**
   * The client was created from a static token chain (explicit token →
   * METICULOUS_API_TOKEN → config file) that found no token, and the stored
   * OAuth login's access token has expired (an earlier refresh attempt, if
   * any, failed). The login was kept.
   */
  | { kind: "login-not-renewed" }
  /**
   * The client was created from a static token chain that found no token,
   * while a still-valid OAuth login is stored: the caller authenticates with
   * an API token only, so it never used the login.
   */
  | { kind: "login-not-used" };

export type AuthTokenResolution =
  | { token: string }
  | { token: null; missingReason: MissingCredentialReason };

/** Which kind of credential a request carried when the server rejected it. */
export type SentCredentialKind = "oauth-login" | "api-token";
