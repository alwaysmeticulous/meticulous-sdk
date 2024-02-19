import { getProject, createClient } from "@alwaysmeticulous/client";
import { MeticulousLogger, METICULOUS_LOGGER_NAME } from "../../../../common/src/logger/console-logger";
// import log from "loglevel";
import { buildCommand } from "../../command-utils/command-builder";

interface Options {
  apiToken?: string | null | undefined;
}

const handler: (options: Options) => Promise<void> = async ({ apiToken }) => {
  const logger = MeticulousLogger.getLogger(METICULOUS_LOGGER_NAME);
  // const client = createClient({ apiToken });
  // const project = await getProject(client);
  // if (!project) {
  //   logger.error("Could not retrieve project data. Is the API token correct?");
  //   process.exit(1);
  // }
  logger.info("Test log v1");
  // logger.info(project);
};

export const showProjectCommand = buildCommand("show-project")
  .details({
    describe: "Shows project linked with current API token",
  })
  .options({
    apiToken: {
      string: true,
    },
  })
  .handler(handler);
