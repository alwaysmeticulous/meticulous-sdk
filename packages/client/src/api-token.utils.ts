import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";

const PERSONAL_CONFIG_FILE_PATH = ".meticulous/config.json";

interface PersonalConfig {
  apiToken?: string;
}

export const getApiToken = (
  apiToken: string | null | undefined
): string | null => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  if (apiToken) {
    return apiToken;
  }
  if (process.env["METICULOUS_API_TOKEN"]) {
    return process.env["METICULOUS_API_TOKEN"];
  }

  const personalConfigFileAbsolutePath = join(
    homedir(),
    PERSONAL_CONFIG_FILE_PATH
  );
  if (existsSync(personalConfigFileAbsolutePath)) {
    const config: PersonalConfig = JSON.parse(
      readFileSync(personalConfigFileAbsolutePath).toString("utf-8")
    );
    if (config.apiToken) {
      logger.info(`Using apiToken from ${personalConfigFileAbsolutePath}`);
      return config.apiToken;
    }
  }

  return null;
};
