import { clearOAuthTokens } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  dryRun?: boolean;
}

export const logoutCommand: CommandModule<unknown, Options> = {
  command: "logout",
  describe: "Clear stored OAuth tokens",
  builder: {},
  handler: wrapHandler(({ dryRun }) => {
    const logger = initLogger();
    if (dryRun) {
      logger.info("Dry run: would clear stored OAuth tokens");
      return Promise.resolve();
    }
    clearOAuthTokens();
    logger.info("Logged out successfully.");
    return Promise.resolve();
  }),
};
