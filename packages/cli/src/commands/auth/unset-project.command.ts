import { clearStoredProject, getStoredProject } from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

export const unsetProjectCommand: CommandModule = {
  command: "unset-project",
  describe: "Clear the project selected via `auth set-project`",
  builder: {},
  handler: wrapHandler(() => {
    initLogger();
    const previous = getStoredProject();
    clearStoredProject();
    if (previous) {
      logNotice(`Cleared selected project (was: ${previous}).`);
    } else {
      logNotice("No project was selected.");
    }
    return Promise.resolve();
  }),
};
