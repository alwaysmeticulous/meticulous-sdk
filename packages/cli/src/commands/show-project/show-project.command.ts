import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import { CommandModule } from "yargs";
import { createClient } from "../../api/client";
import { getProject } from "../../api/project.api";
import { wrapHandler } from "../../utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
}

const handler: (options: Options) => Promise<void> = async ({ apiToken }) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const client = createClient({ apiToken });
  const project = await getProject(client);
  if (!project) {
    logger.error("Could not retrieve project data. Is the API token correct?");
    process.exit(1);
  }
  logger.info(project);
};

export const showProject: CommandModule<unknown, Options> = {
  command: "show-project",
  describe: "Shows project linked with current API token",
  builder: {
    apiToken: {
      string: true,
    },
  },
  handler: wrapHandler(handler),
};
