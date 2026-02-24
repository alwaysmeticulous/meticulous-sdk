import { exec } from "child_process";
import { initLogger } from "@alwaysmeticulous/common";
import { startCallbackServer } from "./oauth-callback-server";
import {
  CLI_CLIENT_ID,
  getTokenEndpoint,
  getWebappBaseUrl,
  KEYCLOAK_ISSUER_URL,
  OAUTH_SCOPES,
} from "./oauth-constants";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "./oauth-pkce";
import { StoredOAuthTokens, storeOAuthTokens } from "./oauth-token-store";

export const performOAuthLogin = async (): Promise<StoredOAuthTokens> => {
  const logger = initLogger();

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const callbackServer = await startCallbackServer();
  const redirectUri = `http://127.0.0.1:${callbackServer.port}/callback`;

  const authUrl = buildAuthorizationUrl({
    codeChallenge,
    state,
    redirectUri,
  });

  logger.info("Opening browser for authentication...");
  logger.info(`If the browser does not open, visit: ${authUrl}`);
  openBrowser(authUrl);

  const { code, state: returnedState } = await callbackServer.waitForCallback();

  if (returnedState !== state) {
    throw new Error(
      "OAuth state mismatch. This could indicate a CSRF attack. Please try again.",
    );
  }

  const tokens = await exchangeCodeForTokens({
    code,
    codeVerifier,
    redirectUri,
  });

  storeOAuthTokens(tokens);
  logger.info("Authentication successful.");

  return tokens;
};

const buildAuthorizationUrl = ({
  codeChallenge,
  state,
  redirectUri,
}: {
  codeChallenge: string;
  state: string;
  redirectUri: string;
}): string => {
  const params = new URLSearchParams({
    client_id: CLI_CLIENT_ID,
    response_type: "code",
    scope: OAUTH_SCOPES,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    issuer: KEYCLOAK_ISSUER_URL,
  });

  const webappBaseUrl = getWebappBaseUrl();
  return `${webappBaseUrl}/cli-login?${params.toString()}`;
};

const exchangeCodeForTokens = async ({
  code,
  codeVerifier,
  redirectUri,
}: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<StoredOAuthTokens> => {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLI_CLIENT_ID,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const tokenEndpoint = await getTokenEndpoint();
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    id_token?: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    idToken: data.id_token,
  };
};

const openBrowser = (url: string): void => {
  const command =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;

  exec(command, (error) => {
    if (error) {
      // Browser open failure is non-fatal — the URL is logged as a fallback
    }
  });
};
