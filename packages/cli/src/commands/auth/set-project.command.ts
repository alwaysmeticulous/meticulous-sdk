import {
  createClientWithOAuth,
  getAuthToken,
  isInteractiveContext,
  isOAuthJwt,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { selectAndStoreProject } from "../../utils/select-project";

interface Options {
  project?: string;
  json: boolean;
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
        "When provided, skips the interactive picker. Required in non-interactive " +
        "environments (no TTY), where the interactive picker is unavailable.",
    },
    json: {
      boolean: true,
      default: false,
      description:
        "Output the selected project as JSON ({project, projectId}) on stdout. " +
        "Only stdout is affected — notices still go to stderr.",
    },
  },
  handler: wrapHandler(async ({ project, json }: Options) => {
    initLogger();

    // `createClientWithOAuth` already resolves the token (including any
    // interactive login and the legacy `selected-project.json` migration) via
    // `resolveApiTokenWithOAuth` internally — re-run that whole resolution just
    // to check the token kind would repeat the migration and double-print its
    // "no API token found" notice. `getAuthToken` reads back the same (by now
    // already-resolved) state without redoing any of that.
    const client = await createClientWithOAuth({
      apiToken: null,
      enableOAuthLogin: true,
    });
    const apiToken = await getAuthToken(null);

    // Project-scoped API tokens (env var or legacy config) already pin a
    // project, so `set-project` has nothing to do.
    if (apiToken && !isOAuthJwt(apiToken)) {
      throw new CliUserError(
        "An API token (env var or legacy config) is already in use; it " +
          "is bound to a single project, so `auth set-project` does not " +
          "apply.\n" +
          "To select a project interactively, first run `meticulous auth " +
          "logout` and unset `METICULOUS_API_TOKEN`, then re-run this " +
          "command to log in with OAuth.",
      );
    }

    const selected = await selectAndStoreProject({
      client,
      project,
      allowInteractivePrompt: isInteractiveContext(),
    });
    if (json) {
      printJson(selected);
    }
  }),
};
