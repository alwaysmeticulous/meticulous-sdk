import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import log from "loglevel";
import { createClient } from "../../api/client";
import { getProject } from "../../api/project.api";
import { buildCommand } from "../../command-utils/command-builder";

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

export const showProject = buildCommand("show-project")
  .details({
    describe: "Shows project linked with current API token",
  })
  .options({
    apiToken: {
      string: true,
    },
  })
  .handler(handler);
