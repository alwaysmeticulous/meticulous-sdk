import {
  createClientWithOAuth,
  getWhoami,
  isFetchError,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

export const whoamiCommand: CommandModule = {
  command: "whoami",
  describe: "Show the currently logged-in user",
  builder: {},
  handler: wrapHandler(async () => {
    const logger = initLogger();

    logger.debug(
      `API URL: ${process.env["METICULOUS_API_URL"] || "https://app.meticulous.ai/api/ (default)"}`,
    );
    logger.debug(
      `OAuth issuer: ${process.env["METICULOUS_OAUTH_ISSUER_URL"] || "https://app.meticulous.ai/auth/realms/meticulous (default)"}`,
    );

    const client = await createClientWithOAuth({
      apiToken: null,
      enableOAuthLogin: true,
    });

    try {
      const { email, firstName, lastName, isAdmin, organizations } =
        await getWhoami(client);
      logger.info(`Logged in as: ${firstName} ${lastName} (${email})`);

      if (isAdmin) {
        logger.info("Role: Admin");
      }

      if (organizations.length > 0) {
        logger.info("Organizations:");
        for (const org of organizations) {
          logger.info(`  - ${org.name}`);
        }
      }
    } catch (error) {
      if (isFetchError(error) && error.response?.status === 403) {
        logger.error(
          "Authentication failed. Your token may be expired. Try logging in again.",
        );
      } else {
        throw error;
      }
    }
  }),
};
