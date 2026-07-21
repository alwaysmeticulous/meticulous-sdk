import {
  createClient,
  isInteractiveContext,
  performDeviceLogin,
  performOAuthLogin,
} from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { selectProjectOnLogin } from "../../utils/select-project";

interface Options {
  project?: string;
  nonInteractive?: boolean;
  device?: boolean;
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
    device: {
      boolean: true,
      default: false,
      description:
        "Log in using the OAuth device flow: the CLI prints a URL and code " +
        "you open/confirm in a browser on any device. Use this on remote or " +
        "sandboxed machines (SSH, containers, cloud agents) where a browser " +
        "can't reach this machine's localhost.",
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
        "127.0.0.1, so a browser on a different machine cannot finish it — use " +
        "`--device` instead for that case.",
    },
  },
  handler: wrapHandler(
    async ({ project, nonInteractive = false, device = false }: Options) => {
      initLogger();

      // Treat an explicit `--non-interactive` or `--device` as authoritative;
      // otherwise fall back to detecting whether we're attached to a real
      // terminal.
      const hasTty = isInteractiveContext();
      const interactive = !nonInteractive && hasTty;

      if (!device && !nonInteractive && !hasTty) {
        throw new CliUserError(
          "`meticulous auth login` requires an interactive terminal. In " +
            "non-interactive environments, pass `--non-interactive` to print " +
            "the login URL (same machine only), `--device` to log in from a " +
            "different device, or set METICULOUS_API_TOKEN or pass " +
            "`--apiToken` instead.",
        );
      }

      // Force a fresh login. Don't clear anything beforehand: if the flow is
      // cancelled, times out, or token exchange fails, the existing session
      // and default project must survive. A successful login overwrites the
      // stored OAuth tokens anyway.
      const tokens = device
        ? await performDeviceLogin()
        : await performOAuthLogin({ openBrowserAutomatically: interactive });

      const client = createClient({ apiToken: tokens.accessToken });

      // Pick a project for the freshly logged-in user. An explicit `--project`
      // is persisted; an existing server-side default is respected as-is; a
      // sole accessible project is auto-selected and persisted; and a
      // multi-project account with no default is prompted interactively (or,
      // when headless, pointed at `auth set-project`). See
      // `selectProjectOnLogin`.
      await selectProjectOnLogin({ client, project, interactive });

      logNotice(
        "You can change the selected project at any time with `meticulous auth set-project`.",
      );
    },
  ),
};
