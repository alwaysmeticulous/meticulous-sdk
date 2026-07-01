import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  getMeticulousLocalDataDir,
  initLogger,
} from "@alwaysmeticulous/common";
import { getValidAccessToken } from "./oauth/oauth-refresh";

interface PersonalConfig {
  apiToken?: string;
}

export const readFileBasedToken = (): {
  token: string;
  path: string;
} | null => {
  // `getMeticulousLocalDataDir()` honours `METICULOUS_DIR` / `--dataDir`,
  // defaulting to `~/.meticulous`, so the config file follows the same data dir
  // as the OAuth login.
  const personalConfigFileAbsolutePath = join(
    getMeticulousLocalDataDir(),
    "config.json",
  );
  if (existsSync(personalConfigFileAbsolutePath)) {
    const config: PersonalConfig = JSON.parse(
      readFileSync(personalConfigFileAbsolutePath).toString("utf-8"),
    );
    if (config.apiToken) {
      return { token: config.apiToken, path: personalConfigFileAbsolutePath };
    }
  }
  return null;
};

const getFileBasedToken = (): string | null => {
  const fileToken = readFileBasedToken();
  if (fileToken) {
    initLogger().info(`Using apiToken from ${fileToken.path}`);
    return fileToken.token;
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
 * 2. OAuth access token (with auto-refresh)
 * 3. METICULOUS_API_TOKEN env var
 * 4. Legacy ~/.meticulous/config.json
 *
 * OAuth is preferred over the env var / legacy config file so that a logged-in
 * user is used unless they explicitly `meticulous auth logout`. An explicit
 * `--apiToken` still wins over everything. The chosen source is logged at debug
 * (`meticulous auth whoami` surfaces it at info).
 */
export const getAuthToken = async (
  apiToken: string | null | undefined,
): Promise<string | null> => {
  const logger = initLogger();

  if (apiToken) {
    logger.debug("Authenticated via --apiToken flag");
    return apiToken;
  }

  const oauthToken = await getValidAccessToken();
  if (oauthToken) {
    logger.debug("Authenticated via OAuth");
    return oauthToken;
  }

  if (process.env["METICULOUS_API_TOKEN"]) {
    logger.debug("Authenticated via METICULOUS_API_TOKEN environment variable");
    return process.env["METICULOUS_API_TOKEN"];
  }

  const fileToken = readFileBasedToken();
  if (fileToken) {
    logger.debug(`Authenticated via ${fileToken.path}`);
    return fileToken.token;
  }

  return null;
};
