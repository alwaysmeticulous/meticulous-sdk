import { initLogger } from "@alwaysmeticulous/common";
import {
  CLI_CLIENT_ID,
  getDeviceAuthorizationEndpoint,
  getTokenEndpoint,
  getWebappBaseUrl,
  KEYCLOAK_ISSUER_URL,
  OAUTH_SCOPES,
} from "./oauth-constants";
import { generateCodeChallenge, generateCodeVerifier } from "./oauth-pkce";
import type { StoredOAuthTokens } from "./oauth-token-store";
import { storeOAuthTokens } from "./oauth-token-store";

const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const SLOW_DOWN_INCREMENT_SECONDS = 5;

interface DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

interface DeviceTokenSuccessResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  id_token?: string;
}

type DeviceTokenPollResult =
  | { kind: "success"; tokens: StoredOAuthTokens }
  | { kind: "pending" }
  | { kind: "slow_down" };

export const performDeviceLogin = async (): Promise<StoredOAuthTokens> => {
  const logger = initLogger();

  // PKCE binds the token poll to this process: Keycloak enforces the client's
  // PKCE policy on the device authorization endpoint too.
  const codeVerifier = generateCodeVerifier();
  const authorization = await requestDeviceAuthorization({
    codeChallenge: generateCodeChallenge(codeVerifier),
  });

  const webappBaseUrl = getWebappBaseUrl();
  const cliLoginParams = new URLSearchParams({
    user_code: authorization.user_code,
    issuer: KEYCLOAK_ISSUER_URL,
  });
  logger.info(
    `On any device, open: ${webappBaseUrl}/cli-device-login?${cliLoginParams.toString()} ` +
      `and confirm the code: ${authorization.user_code}`,
  );
  logger.info(
    authorization.verification_uri_complete
      ? `If that doesn't work, open ${authorization.verification_uri_complete}`
      : `If that doesn't work, open ${authorization.verification_uri} and enter the code manually: ${authorization.user_code}`,
  );

  const tokens = await pollForTokens({ authorization, codeVerifier });

  storeOAuthTokens(tokens);
  logger.info("Authentication successful.");

  return tokens;
};

const requestDeviceAuthorization = async ({
  codeChallenge,
}: {
  codeChallenge: string;
}): Promise<DeviceAuthorizationResponse> => {
  const deviceAuthorizationEndpoint = await getDeviceAuthorizationEndpoint();

  const body = new URLSearchParams({
    client_id: CLI_CLIENT_ID,
    scope: OAUTH_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const response = await fetch(deviceAuthorizationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    // Discovery advertises `device_authorization_endpoint` at the realm level
    // regardless of whether the grant is enabled on this specific client, so
    // disabling it only on `meticulous-cli` isn't caught by
    // `getDeviceAuthorizationEndpoint()`. Keycloak instead rejects the request
    // itself with `unauthorized_client` — catch that here for the same clear
    // message.
    if (parseOAuthErrorCode(bodyText) === "unauthorized_client") {
      throw new Error(
        "The OAuth 2.0 Device Authorization Grant is not enabled for the " +
          `meticulous-cli client on this realm (${KEYCLOAK_ISSUER_URL}).`,
      );
    }
    throw new Error(
      `Device authorization request failed: ${response.status} ${bodyText}`,
    );
  }

  return parseDeviceAuthorizationResponse(bodyText);
};

const REQUIRED_DEVICE_AUTHORIZATION_STRING_FIELDS = [
  "device_code",
  "user_code",
  "verification_uri",
] as const;

const parseDeviceAuthorizationResponse = (
  bodyText: string,
): DeviceAuthorizationResponse => {
  const data = JSON.parse(bodyText) as Partial<DeviceAuthorizationResponse>;

  for (const field of REQUIRED_DEVICE_AUTHORIZATION_STRING_FIELDS) {
    if (typeof data[field] !== "string" || data[field].length === 0) {
      throw new Error(
        `Device authorization response missing required field "${field}".`,
      );
    }
  }
  if (
    typeof data.expires_in !== "number" ||
    !Number.isFinite(data.expires_in)
  ) {
    throw new Error(
      'Device authorization response missing a valid "expires_in".',
    );
  }

  return data as DeviceAuthorizationResponse;
};

const pollForTokens = async ({
  authorization,
  codeVerifier,
}: {
  authorization: DeviceAuthorizationResponse;
  codeVerifier: string;
}): Promise<StoredOAuthTokens> => {
  const tokenEndpoint = await getTokenEndpoint();
  const deadline = Date.now() + authorization.expires_in * 1000;
  let intervalSeconds = authorization.interval ?? DEFAULT_POLL_INTERVAL_SECONDS;

  for (;;) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error("Device code expired, run login again.");
    }

    // Cap the sleep to the remaining lifetime so a final token request still
    // fires before the local deadline, instead of giving up one interval early.
    await sleep(Math.min(intervalSeconds * 1000, remainingMs));

    const result = await requestDeviceToken({
      tokenEndpoint,
      deviceCode: authorization.device_code,
      codeVerifier,
    });

    if (result.kind === "success") {
      return result.tokens;
    }
    if (result.kind === "slow_down") {
      intervalSeconds += SLOW_DOWN_INCREMENT_SECONDS;
    }
  }
};

const requestDeviceToken = async ({
  tokenEndpoint,
  deviceCode,
  codeVerifier,
}: {
  tokenEndpoint: string;
  deviceCode: string;
  codeVerifier: string;
}): Promise<DeviceTokenPollResult> => {
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    device_code: deviceCode,
    client_id: CLI_CLIENT_ID,
    code_verifier: codeVerifier,
  });

  let response: Response;
  let bodyText: string;
  try {
    response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    bodyText = await response.text();
  } catch {
    // Transient network blip: keep polling until the local deadline instead
    // of aborting an otherwise-valid, in-progress login.
    return { kind: "pending" };
  }

  if (response.ok) {
    const data = JSON.parse(bodyText) as DeviceTokenSuccessResponse;
    return { kind: "success", tokens: mapTokenResponse(data) };
  }

  if (response.status >= 500) {
    // Transient server error (5xx): same reasoning as the network-error case.
    return { kind: "pending" };
  }

  const errorCode = parseOAuthErrorCode(bodyText);

  if (errorCode === "authorization_pending") {
    return { kind: "pending" };
  }
  if (errorCode === "slow_down") {
    return { kind: "slow_down" };
  }
  if (errorCode === "access_denied") {
    throw new Error("Login was denied.");
  }
  if (errorCode === "expired_token") {
    throw new Error("Device code expired, run login again.");
  }

  throw new Error(
    `Device token request failed: ${response.status} ${bodyText}`,
  );
};

const parseOAuthErrorCode = (bodyText: string): string | undefined => {
  try {
    return (JSON.parse(bodyText) as { error?: string }).error;
  } catch {
    return undefined;
  }
};

const mapTokenResponse = (
  data: DeviceTokenSuccessResponse,
): StoredOAuthTokens => ({
  accessToken: data.access_token,
  refreshToken: data.refresh_token,
  expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
  idToken: data.id_token,
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
