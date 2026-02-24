import { clearOAuthTokens } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { buildCommand } from "../../command-utils/command-builder";

const handler = async (): Promise<void> => {
  const logger = initLogger();
  clearOAuthTokens();
  logger.info("Logged out successfully.");
};

export const logoutCommand = buildCommand("logout")
  .details({
    describe: "Clear stored OAuth tokens",
  })
  .options({})
  .handler(handler);
