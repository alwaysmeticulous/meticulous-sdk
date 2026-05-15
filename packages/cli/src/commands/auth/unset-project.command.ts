import {
  clearStoredProject,
  getStoredProject,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

export const unsetProjectCommand: CommandModule = {
  command: "unset-project",
  describe: "Clear the project selected via `auth set-project`",
  builder: {},
  handler: wrapHandler(async () => {
    const logger = initLogger();
    const previous = getStoredProject();
    clearStoredProject();
    if (previous) {
      logger.info(`Cleared selected project (was: ${previous}).`);
    } else {
      logger.info("No project was selected.");
    }
  }),
};
