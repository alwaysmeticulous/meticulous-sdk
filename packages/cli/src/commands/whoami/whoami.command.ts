import {
  createClientWithOAuth,
  getWhoami,
  isFetchError,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { buildCommand } from "../../command-utils/command-builder";

const handler = async (): Promise<void> => {
  const logger = initLogger();

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
  } catch (error: any) {
    if (isFetchError(error) && error.response?.status === 403) {
      logger.error(
        "Authentication failed. Your token may be expired. Try logging in again.",
      );
    } else {
      throw error;
    }
  }
};

export const whoamiCommand = buildCommand("whoami")
  .details({
    describe: "Show the currently authenticated user",
  })
  .options({})
  .handler(handler);
