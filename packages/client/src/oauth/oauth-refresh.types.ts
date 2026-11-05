export type RefreshOutcome =
  | { status: "refreshed"; accessToken: string }
  | { status: "rejected"; reason: string }
  | { status: "failed"; reason: string };

/** Why no usable OAuth access token is available. */
export type OAuthUnavailableReason =
  /** No OAuth login is stored. */
  | { kind: "not-logged-in" }
  /** The access token expired and there was no refresh token; cleared. */
  | { kind: "login-expired" }
  /** The authorization server rejected the refresh token; cleared. */
  | { kind: "login-rejected"; detail: string }
  /** Refreshing failed transiently after the access token expired; kept. */
  | { kind: "refresh-failed"; detail: string };

export type OAuthAccessTokenResolution =
  | { accessToken: string }
  | { accessToken: null; reason: OAuthUnavailableReason };

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}
