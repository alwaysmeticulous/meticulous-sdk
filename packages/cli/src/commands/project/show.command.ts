import {
  createClientWithOAuth,
  getProject,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { resolveProjectIdentifier } from "../../utils/resolve-project-identifier";

interface Options {
  apiToken?: string | null | undefined;
}

export const showCommand: CommandModule<unknown, Options> = {
  command: "show",
  describe: "Show project linked with current API token",
  builder: {
    apiToken: {
      string: true,
    },
  },
  handler: wrapHandler(async ({ apiToken }) => {
    const logger = initLogger();
    const apiToken_ = await resolveApiTokenWithOAuth({
      apiToken,
      enableOAuthLogin: true,
    });
    const { projectId } = await resolveProjectIdentifier(apiToken_);
    const client = await createClientWithOAuth({
      apiToken,
      enableOAuthLogin: true,
    });
    const project = await getProject(client, projectId);
    if (!project) {
      logger.error(
        "Could not retrieve project data. Is the API token correct?",
      );
      process.exit(1);
    }
    logger.info(project);
  }),
};
