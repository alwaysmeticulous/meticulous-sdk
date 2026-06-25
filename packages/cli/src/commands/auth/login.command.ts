import {
  clearStoredProject,
  createClient,
  isInteractiveContext,
  performOAuthLogin,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { selectAndStoreProject } from "../../utils/select-project";

interface Options {
  project?: string;
}

export const loginCommand: CommandModule<unknown, Options> = {
  command: "login",
  describe: "Log in to Meticulous via the browser (OAuth)",
  builder: {
    project: {
      string: true,
      description:
        "Project to select in 'organization/project' format (e.g. 'MyOrg/My App'). " +
        "When provided, skips the interactive picker after logging in.",
    },
  },
  handler: wrapHandler(async ({ project }: Options) => {
    const logger = initLogger();

    if (!isInteractiveContext()) {
      throw new CliUserError(
        "`meticulous auth login` requires an interactive terminal. In " +
          "non-interactive environments, set METICULOUS_API_TOKEN or pass " +
          "`--apiToken` instead.",
      );
    }

    // Force a fresh browser login. Don't clear anything beforehand: if the flow
    // is cancelled, times out, or token exchange fails, the existing session
    // and selected project must survive. A successful login overwrites the
    // stored OAuth tokens anyway.
    const tokens = await performOAuthLogin();

    // Logged in fresh (possibly as a different account), so drop any
    // previously-selected project before re-selecting — keeping it would leave
    // a stale selection the new user may not be able to access if the selection
    // step below is interrupted.
    clearStoredProject();

    const client = createClient({ apiToken: tokens.accessToken });

    // Pick a project for the freshly logged-in user: an explicit `--project`
    // wins, otherwise auto-select when there is only one and prompt otherwise.
    await selectAndStoreProject({ client, logger, project });

    logger.info(
      "You can change the selected project at any time with `meticulous auth set-project`.",
    );
  }),
};
