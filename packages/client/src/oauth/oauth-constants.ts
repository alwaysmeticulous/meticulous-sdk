export const KEYCLOAK_ISSUER_URL =
  process.env["METICULOUS_OAUTH_ISSUER_URL"] ||
  "https://app.meticulous.ai/auth/realms/meticulous";

export const CLI_CLIENT_ID = "meticulous-cli";

export const OAUTH_SCOPES = "openid email profile offline_access";

const WELL_KNOWN_PATH = "/.well-known/openid-configuration";

interface OidcConfiguration {
  token_endpoint: string;
  device_authorization_endpoint?: string;
}

let cachedOidcConfiguration: OidcConfiguration | null = null;

const getOidcConfiguration = async (): Promise<OidcConfiguration> => {
  if (cachedOidcConfiguration) {
    return cachedOidcConfiguration;
  }

  const response = await fetch(`${KEYCLOAK_ISSUER_URL}${WELL_KNOWN_PATH}`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenID configuration: ${response.status} ${response.statusText}`,
    );
  }

  const config = (await response.json()) as OidcConfiguration;
  if (!config.token_endpoint) {
    throw new Error("OpenID configuration missing token_endpoint");
  }

  cachedOidcConfiguration = config;
  return cachedOidcConfiguration;
};

export const getTokenEndpoint = async (): Promise<string> => {
  const config = await getOidcConfiguration();
  return config.token_endpoint;
};

export const getDeviceAuthorizationEndpoint = async (): Promise<string> => {
  const config = await getOidcConfiguration();
  if (!config.device_authorization_endpoint) {
    throw new Error(
      "OpenID configuration missing device_authorization_endpoint. " +
        "The OAuth 2.0 Device Authorization Grant is not enabled for the " +
        `meticulous-cli client on this realm (${KEYCLOAK_ISSUER_URL}).`,
    );
  }
  return config.device_authorization_endpoint;
};

const DEFAULT_WEBAPP_BASE_URL = "https://app.meticulous.ai";

export const getWebappBaseUrl = (): string => {
  const apiUrlFromEnv = process.env["METICULOUS_API_URL"];

  if (apiUrlFromEnv && apiUrlFromEnv.includes("localhost")) {
    // The webapp frontend runs on the port immediately above the backend API
    // (backend 3000 -> frontend 3001).
    return apiUrlFromEnv
      .replace(/\/api\/?$/, "")
      .replace(
        /localhost:(\d+)/,
        (_match, port) => `localhost:${Number(port) + 1}`,
      );
  }

  return DEFAULT_WEBAPP_BASE_URL;
};
