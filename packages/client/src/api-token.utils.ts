import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { initLogger } from "@alwaysmeticulous/common";
import { getValidAccessToken } from "./oauth/oauth-refresh";

const PERSONAL_CONFIG_FILE_PATH = ".meticulous/config.json";

interface PersonalConfig {
  apiToken?: string;
}

const getFileBasedToken = (): string | null => {
  const personalConfigFileAbsolutePath = join(
    homedir(),
    PERSONAL_CONFIG_FILE_PATH,
  );
  if (existsSync(personalConfigFileAbsolutePath)) {
    const config: PersonalConfig = JSON.parse(
      readFileSync(personalConfigFileAbsolutePath).toString("utf-8"),
    );
    if (config.apiToken) {
      const logger = initLogger();
      logger.info(`Using apiToken from ${personalConfigFileAbsolutePath}`);
      return config.apiToken;
    }
  }
  return null;
};

/**
 * Resolves the API token to use for authentication with the Meticulous API.
 *
 * The resolution order is as follows:
 * 1. Explicit apiToken parameter (e.g. from CLI flag)
 * 2. METICULOUS_API_TOKEN environment variable
 * 3. Legacy ~/.meticulous/config.json file
 *
 * This function does NOT check for OAuth tokens. Use getAuthToken for that functionality.
 */
export const getApiToken = (
  apiToken: string | null | undefined,
): string | null => {
  if (apiToken) {
    return apiToken;
  }
  if (process.env["METICULOUS_API_TOKEN"]) {
    return process.env["METICULOUS_API_TOKEN"];
  }
  return getFileBasedToken();
};

/**
 * Async version of getApiToken that also checks for OAuth tokens.
 *
 * Resolution order:
 * 1. Explicit apiToken parameter (CLI flag)
 * 2. METICULOUS_API_TOKEN env var
 * 3. OAuth access token (with auto-refresh)
 * 4. Legacy ~/.meticulous/config.json
 */
export const getAuthToken = async (
  apiToken: string | null | undefined,
): Promise<string | null> => {
  if (apiToken) {
    return apiToken;
  }
  if (process.env["METICULOUS_API_TOKEN"]) {
    return process.env["METICULOUS_API_TOKEN"];
  }

  const oauthToken = await getValidAccessToken();
  if (oauthToken) {
    return oauthToken;
  }

  return getFileBasedToken();
};
