export type RefreshOutcome =
  | { status: "refreshed"; accessToken: string }
  | { status: "rejected"; reason: string }
  | { status: "failed"; reason: string };

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}
