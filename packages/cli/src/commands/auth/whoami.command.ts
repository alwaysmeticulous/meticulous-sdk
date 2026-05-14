import {
  createClientWithOAuth,
  getStoredProject,
  getWhoami,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { handleAuthFailure } from "../../utils/handle-auth-failure";

export const whoamiCommand: CommandModule = {
  command: "whoami",
  describe: "Show the currently logged-in user",
  builder: {},
  handler: wrapHandler(async () => {
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
        const formatted = organizations
          .map((org) => (org.role ? `${org.name} (${org.role})` : org.name))
          .join(", ");
        logger.info(`Organizations: ${formatted}`);
      }

      const project = getStoredProject();
      if (project) {
        logger.info(`Selected project: ${project}`);
      } else {
        logger.info(
          "No project selected. Run `meticulous auth set-project` to choose one.",
        );
      }
    } catch (error) {
      if (!handleAuthFailure(error)) {
        throw error;
      }
    }
  }),
};
