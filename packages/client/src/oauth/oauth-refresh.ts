import { CLI_CLIENT_ID, getTokenEndpoint } from "./oauth-constants";
import {
  clearOAuthTokens,
  getStoredOAuthTokens,
  storeOAuthTokens,
} from "./oauth-token-store";

const TOKEN_EXPIRY_BUFFER_SECONDS = 30;

export const getValidAccessToken = async (): Promise<string | null> => {
  const tokens = getStoredOAuthTokens();
  if (!tokens) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (tokens.expiresAt > now + TOKEN_EXPIRY_BUFFER_SECONDS) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    clearOAuthTokens();
    return null;
  }

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLI_CLIENT_ID,
      refresh_token: tokens.refreshToken,
    });

    const tokenEndpoint = await getTokenEndpoint();
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      clearOAuthTokens();
      return null;
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      id_token?: string;
    };

    const updatedTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      idToken: data.id_token,
    };

    storeOAuthTokens(updatedTokens);
    return updatedTokens.accessToken;
  } catch {
    clearOAuthTokens();
    return null;
  }
};
