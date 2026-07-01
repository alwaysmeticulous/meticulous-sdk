import { getOAuthProjects, setStoredProject } from "@alwaysmeticulous/client";
import type { MeticulousClient, OAuthProject } from "@alwaysmeticulous/client";
import inquirer from "inquirer";
import type log from "loglevel";
import { CliUserError } from "./cli-user-error";
import { handleAuthFailure } from "./handle-auth-failure";

/**
 * Fetches the projects accessible to the OAuth caller, surfacing auth failures
 * via `handleAuthFailure`. Shared by the project selection and listing flows.
 */
export const fetchAccessibleProjects = async (
  client: MeticulousClient,
): Promise<OAuthProject[]> => {
  try {
    return await getOAuthProjects(client);
  } catch (error) {
    handleAuthFailure(error);
    throw error;
  }
};

/**
 * Picks a project, stores it as the selected project, and logs the selection.
 * Shared by `auth login` and `auth set-project`.
 *
 * - When `project` (an `organization/project` slug) is given, selects that
 *   project non-interactively, erroring with the available list if it does
 *   not match.
 * - Otherwise auto-selects the only project, or prompts interactively when
 *   there are several — unless `allowInteractivePrompt` is `false` (e.g. a
 *   headless login), in which case it keeps `fallbackToProject` if that is
 *   still accessible, and otherwise throws with guidance rather than blocking
 *   on a prompt that no terminal can answer.
 *
 * Throws `CliUserError` when the caller has no accessible projects, or when a
 * project cannot be resolved without an interactive prompt.
 */
export const selectAndStoreProject = async ({
  client,
  logger,
  project,
  allowInteractivePrompt = true,
  fallbackToProject,
}: {
  client: MeticulousClient;
  logger: log.Logger;
  project?: string | undefined;
  allowInteractivePrompt?: boolean;
  fallbackToProject?: string | undefined;
}): Promise<string> => {
  const projects = await fetchAccessibleProjects(client);

  if (projects.length === 0) {
    throw new CliUserError(
      "No projects are accessible to your account. Ask an organization " +
        "admin to add you to a project.",
    );
  }

  let selected: OAuthProject;
  if (project) {
    // Tolerate accidental surrounding whitespace (e.g. from copy-paste), but
    // keep the match case-sensitive: organization/project names are
    // case-sensitive, so two projects could differ only by case and a
    // case-insensitive match would be ambiguous.
    const trimmedProject = project.trim();
    const match = projects.find(
      (p) => `${p.organization.name}/${p.name}` === trimmedProject,
    );
    if (!match) {
      throw new CliUserError(
        `Project '${trimmedProject}' not found. Available projects:\n${formatProjectList(projects)}`,
      );
    }
    selected = match;
  } else if (projects.length === 1) {
    selected = projects[0];
  } else if (allowInteractivePrompt) {
    selected = await promptForProject(projects);
  } else {
    // No interactive terminal to answer the picker. Keep the previously
    // selected project if it's still accessible; otherwise fail with guidance
    // on how to choose one, so callers (and scripts) know no project is set.
    const fallback = fallbackToProject
      ? projects.find(
          (p) => `${p.organization.name}/${p.name}` === fallbackToProject,
        )
      : undefined;
    if (fallback) {
      const fallbackSlug = `${fallback.organization.name}/${fallback.name}`;
      setStoredProject({ project: fallbackSlug, projectId: fallback.id });
      logger.info(`Kept previously selected project: ${fallbackSlug}`);
      return fallbackSlug;
    }
    throw new CliUserError(
      "Multiple projects are accessible but none was selected (no interactive " +
        "terminal). Pass `--project` or run `meticulous auth set-project` to " +
        "choose one.",
      1,
      "warn",
    );
  }

  const projectSlug = `${selected.organization.name}/${selected.name}`;
  setStoredProject({ project: projectSlug, projectId: selected.id });
  logger.info(`Selected project: ${projectSlug}`);
  return projectSlug;
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
    throw new CliUserError("Selected project not found in fetched list.");
  }
  return selected;
};

const formatProjectList = (projects: OAuthProject[]): string =>
  projects.map((p) => `  - ${p.organization.name}/${p.name}`).join("\n");
