export const KEYCLOAK_ISSUER_URL =
  process.env["METICULOUS_OAUTH_ISSUER_URL"] ||
  "https://app.meticulous.ai/auth/realms/meticulous";

export const CLI_CLIENT_ID = "meticulous-cli";

export const OAUTH_SCOPES = "openid email profile";

const WELL_KNOWN_PATH = "/.well-known/openid-configuration";

let cachedTokenEndpoint: string | null = null;

export const getTokenEndpoint = async (): Promise<string> => {
  if (cachedTokenEndpoint) {
    return cachedTokenEndpoint;
  }

  const response = await fetch(`${KEYCLOAK_ISSUER_URL}${WELL_KNOWN_PATH}`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenID configuration: ${response.status} ${response.statusText}`,
    );
  }

  const config = (await response.json()) as { token_endpoint: string };
  if (!config.token_endpoint) {
    throw new Error("OpenID configuration missing token_endpoint");
  }

  cachedTokenEndpoint = config.token_endpoint;
  return cachedTokenEndpoint;
};

const DEFAULT_WEBAPP_BASE_URL = "https://app.meticulous.ai";

export const getWebappBaseUrl = (): string => {
  const apiUrlFromEnv = process.env["METICULOUS_API_URL"];

  if (apiUrlFromEnv && apiUrlFromEnv.includes("localhost")) {
    return apiUrlFromEnv.replace(/\/api\/?$/, "").replace(":3000", ":3001");
  }

  return DEFAULT_WEBAPP_BASE_URL;
};
