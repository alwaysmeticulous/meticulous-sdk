import {
  createClient,
  getValidAccessToken,
  isInteractiveContext,
  performOAuthLogin,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { fetchAccessibleProjects } from "../../utils/select-project";

interface Options {
  json?: boolean;
}

export const listProjectsCommand: CommandModule<unknown, Options> = {
  command: "list-projects",
  describe: "List all Meticulous projects accessible to the authenticated user",
  builder: {
    json: {
      boolean: true,
      description:
        "Output projects as a JSON array of {id, name, organization: {name}} " +
        "instead of one 'organization/project' slug per line.",
      default: false,
    },
  },
  handler: wrapHandler(async ({ json }: Options) => {
    const logger = initLogger();

    // Enumerating the user's projects is an OAuth-only operation: a
    // project-scoped API token (env var or legacy config) is bound to a single
    // project and cannot list the rest. Rather than asking the user to log out
    // of that token, we just use their OAuth login — performing one now if
    // there isn't a stored one yet (interactive only; CI can't show a browser).
    const apiToken = await resolveOAuthToken();

    const client = createClient({ apiToken });
    const projects = await fetchAccessibleProjects(client);

    if (json) {
      const payload = projects.map((p) => ({
        id: p.id,
        name: p.name,
        organization: { name: p.organization.name },
      }));
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
      return;
    }

    if (projects.length === 0) {
      logger.info("No projects are accessible to your account.");
      return;
    }

    for (const p of projects) {
      process.stdout.write(`${p.organization.name}/${p.name}\n`);
    }
  }),
};

const resolveOAuthToken = async (): Promise<string> => {
  const oauthToken = await getValidAccessToken();
  if (oauthToken) {
    return oauthToken;
  }

  if (!isInteractiveContext()) {
    throw new CliUserError(
      "`meticulous auth list-projects` lists the projects your user account " +
        "can access, which requires an OAuth login. Run it from an " +
        "interactive terminal to log in via the browser. (A project-scoped " +
        "METICULOUS_API_TOKEN or ~/.meticulous/config.json token cannot " +
        "enumerate projects.)",
    );
  }

  const tokens = await performOAuthLogin();
  return tokens.accessToken;
};
