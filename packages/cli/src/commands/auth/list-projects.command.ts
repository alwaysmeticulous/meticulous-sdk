import {
  createClient,
  getAuthToken,
  isInteractiveContext,
  performOAuthLogin,
} from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { listProjectsForUser } from "../../utils/select-project";

interface Options {
  apiToken?: string;
  json?: boolean;
}

export const listProjectsCommand: CommandModule<unknown, Options> = {
  command: "list-projects",
  describe:
    "List the Meticulous projects you can access: those of your user account " +
    "when logged in, or an API token's own project plus any its " +
    "cross-project access covers",
  builder: {
    apiToken: {
      string: true,
      description:
        "Meticulous API token. When omitted, uses your OAuth login, then " +
        "METICULOUS_API_TOKEN, then ~/.meticulous/config.json.",
    },
    json: {
      boolean: true,
      description:
        "Output projects as a JSON array of {id, name, organization: {name}} " +
        "on stdout (an empty array when there are none) instead of one " +
        "'organization/project' slug per line. Notices still go to stderr.",
      default: false,
    },
  },
  handler: wrapHandler(async ({ apiToken, json }: Options) => {
    initLogger();

    const client = createClient({
      apiToken: (await getAuthToken(apiToken)) ?? (await loginForListing()),
    });
    const projects = await listProjectsForUser(client);

    if (json) {
      printJson(projects);
    } else {
      for (const p of projects) {
        console.log(`${p.organization.name}/${p.name}`);
      }
    }

    // Guidance on stderr regardless of --json (which only changes stdout).
    if (projects.length === 0) {
      logNotice("No projects are accessible to your account.");
    }
  }),
};

const loginForListing = async (): Promise<string> => {
  if (!isInteractiveContext()) {
    throw new CliUserError(
      "`meticulous auth list-projects` needs credentials: pass --apiToken, set " +
        "METICULOUS_API_TOKEN, or log in with `meticulous auth login " +
        "--non-interactive` (or run this from an interactive terminal to log " +
        "in via the browser).",
    );
  }

  const tokens = await performOAuthLogin();
  return tokens.accessToken;
};
