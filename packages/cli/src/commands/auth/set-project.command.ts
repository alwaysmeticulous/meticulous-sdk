import {
  createClientWithOAuth,
  getOAuthProjects,
  OAuthProject,
  setStoredProject,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import inquirer from "inquirer";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { handleAuthFailure } from "../../utils/handle-auth-failure";

export const setProjectCommand: CommandModule = {
  command: "set-project",
  describe:
    "Select the Meticulous project to use with OAuth-authenticated commands",
  builder: {},
  handler: wrapHandler(async () => {
    const logger = initLogger();

    const client = await createClientWithOAuth({
      apiToken: null,
      enableOAuthLogin: true,
    });

    let projects: OAuthProject[];
    try {
      projects = await getOAuthProjects(client);
    } catch (error) {
      if (handleAuthFailure(error)) {
        return;
      }
      throw error;
    }

    if (projects.length === 0) {
      logger.error(
        "No projects are accessible to your account. Ask an organization admin to add you to a project.",
      );
      process.exit(1);
    }

    const selected =
      projects.length === 1
        ? projects[0]
        : await promptForProject(projects);

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
