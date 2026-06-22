import type { OAuthProject } from "@alwaysmeticulous/client";
import {
  createClient,
  getOAuthProjects,
  isOAuthJwt,
  resolveApiTokenWithOAuth,
  setStoredProject,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import inquirer from "inquirer";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { handleAuthFailure } from "../../utils/handle-auth-failure";

export const setProjectCommand: CommandModule = {
  command: "set-project",
  describe:
    "Select the Meticulous project to use with OAuth-authenticated commands",
  builder: {},
  handler: wrapHandler(async () => {
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

    let projects: OAuthProject[];
    try {
      projects = await getOAuthProjects(client);
    } catch (error) {
      handleAuthFailure(error);
      throw error;
    }

    if (projects.length === 0) {
      throw new CliUserError(
        "No projects are accessible to your account. Ask an organization " +
          "admin to add you to a project.",
      );
    }

    const selected =
      projects.length === 1 ? projects[0] : await promptForProject(projects);

    const projectSlug = `${selected.organization.name}/${selected.name}`;
    setStoredProject({ project: projectSlug, projectId: selected.id });
    logger.info(`Selected project: ${projectSlug}`);
  }),
};

const promptForProject = async (
  projects: OAuthProject[],
): Promise<OAuthProject> => {
  const { projectId } = await inquirer.prompt<{ projectId: string }>([
    {
      type: "list",
      name: "projectId",
      message: "Select a project:",
      choices: projects.map((project) => ({
        name: `${project.organization.name}/${project.name}`,
        value: project.id,
      })),
    },
  ]);

  const selected = projects.find((project) => project.id === projectId);
  if (!selected) {
    throw new Error("Selected project not found in fetched list");
  }
  return selected;
};
