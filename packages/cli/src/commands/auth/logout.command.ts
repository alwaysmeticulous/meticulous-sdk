import { clearOAuthTokens } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

export const logoutCommand: CommandModule = {
  command: "logout",
  describe: "Clear stored OAuth tokens",
  builder: {},
  handler: wrapHandler(async () => {
    const logger = initLogger();
    clearOAuthTokens();
    logger.info("Logged out successfully.");
  }),
};
