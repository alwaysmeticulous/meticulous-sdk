import {
  createClient,
  isOAuthJwt,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { selectAndStoreProject } from "../../utils/select-project";

interface Options {
  project?: string;
}

export const setProjectCommand: CommandModule<unknown, Options> = {
  command: "set-project",
  describe:
    "Select the Meticulous project to use with OAuth-authenticated commands",
  builder: {
    project: {
      string: true,
      description:
        "Project to select in 'organization/project' format (e.g. 'MyOrg/My App'). " +
        "When provided, skips the interactive picker.",
    },
  },
  handler: wrapHandler(async ({ project }: Options) => {
    const logger = initLogger();

    const apiToken = await resolveApiTokenWithOAuth({
      apiToken: null,
      enableOAuthLogin: true,
    });

    // Project-scoped API tokens (env var or legacy config) already pin a
    // project, so `set-project` has nothing to do.
    if (!isOAuthJwt(apiToken)) {
      throw new CliUserError(
        "An API token (env var or legacy config) is already in use; it " +
          "is bound to a single project, so `auth set-project` does not " +
          "apply.\n" +
          "To select a project interactively, first run `meticulous auth " +
          "logout` and unset `METICULOUS_API_TOKEN`, then re-run this " +
          "command to log in with OAuth.",
      );
    }

    const client = createClient({ apiToken });
    await selectAndStoreProject({ client, logger, project });
  }),
};
