import {
  clearOAuthTokens,
  clearStoredProject,
  readFileBasedToken,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { Logger } from "loglevel";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  dryRun?: boolean;
}

export const logoutCommand: CommandModule<unknown, Options> = {
  command: "logout",
  describe: "Clear stored OAuth tokens and selected project",
  builder: {},
  handler: wrapHandler(({ dryRun }) => {
    const logger = initLogger();
    if (dryRun) {
      logger.info(
        "Dry run: would clear stored OAuth tokens and selected project",
      );
      return Promise.resolve();
    }
    clearOAuthTokens();
    clearStoredProject();
    logger.info("Logged out successfully.");

    warnAboutRemainingCredentials(logger);
    return Promise.resolve();
  }),
};

const warnAboutRemainingCredentials = (logger: Logger): void => {
  if (process.env["METICULOUS_API_TOKEN"]) {
    logger.warn(
      "Note: METICULOUS_API_TOKEN is still set in your environment and will " +
        "continue to be used. Unset it in your shell to fully log out.",
    );
  }

  // Best-effort: a malformed ~/.meticulous/config.json must not fail logout —
  // the credentials have already been cleared by this point.
  let fileToken: ReturnType<typeof readFileBasedToken> = null;
  try {
    fileToken = readFileBasedToken();
  } catch {
    return;
  }
  if (fileToken) {
    logger.warn(
      `Note: an apiToken is still present in ${fileToken.path} and ` +
        "will continue to be used. Remove it from that file to fully log out.",
    );
  }
};
