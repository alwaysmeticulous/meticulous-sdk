import {
  clearStoredProject,
  createClient,
  getStoredProject,
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
  nonInteractive?: boolean;
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
    nonInteractive: {
      boolean: true,
      default: false,
      description:
        "Run without an interactive terminal: print the login URL instead of " +
        "opening a browser, and skip the interactive project picker. Use this " +
        "when there is no TTY (e.g. an agent starts the flow and a human " +
        "completes it by opening the printed URL). The URL must be opened on " +
        "the same machine as the CLI: login completes via a local callback on " +
        "127.0.0.1, so a browser on a different machine cannot finish it.",
    },
  },
  handler: wrapHandler(async ({ project, nonInteractive = false }: Options) => {
    const logger = initLogger();

    // Treat an explicit `--non-interactive` as authoritative; otherwise fall
    // back to detecting whether we're attached to a real terminal.
    const hasTty = isInteractiveContext();
    const interactive = !nonInteractive && hasTty;

    if (!nonInteractive && !hasTty) {
      throw new CliUserError(
        "`meticulous auth login` requires an interactive terminal. In " +
          "non-interactive environments, pass `--non-interactive` to print the " +
          "login URL, or set METICULOUS_API_TOKEN or pass `--apiToken` instead.",
      );
    }

    // Force a fresh browser login. Don't clear anything beforehand: if the flow
    // is cancelled, times out, or token exchange fails, the existing session
    // and selected project must survive. A successful login overwrites the
    // stored OAuth tokens anyway.
    const tokens = await performOAuthLogin({
      openBrowserAutomatically: interactive,
    });

    // Logged in fresh (possibly as a different account), so drop any
    // previously-selected project before re-selecting — keeping it would leave
    // a stale selection the new user may not be able to access if the selection
    // step below is interrupted. Remember it first so we can restore it below
    // when it's still valid and selection would otherwise pick nothing.
    const previousProject = getStoredProject();
    clearStoredProject();

    const client = createClient({ apiToken: tokens.accessToken });

    // Pick a project for the freshly logged-in user: an explicit `--project`
    // wins, otherwise auto-select when there is only one. Only prompt when
    // running interactively — a non-interactive login must not block on the
    // interactive picker. When the picker is skipped, fall back to the
    // previously-selected project if it's still accessible.
    // Resolves a project or throws: a non-interactive login with several
    // accessible projects and no `--project`/fallback fails with guidance
    // rather than leaving nothing selected.
    await selectAndStoreProject({
      client,
      logger,
      project,
      allowInteractivePrompt: interactive,
      fallbackToProject: previousProject ?? undefined,
    });

    logger.info(
      "You can change the selected project at any time with `meticulous auth set-project`.",
    );
  }),
};
