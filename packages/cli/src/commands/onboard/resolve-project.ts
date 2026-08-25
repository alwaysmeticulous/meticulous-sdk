import type { Project } from "@alwaysmeticulous/api";
import {
  CLI_LOGIN_INTENT_ONBOARD,
  createClientWithOAuth,
  getAuthToken,
  getOAuthDefaultProject,
  getProject,
  isInteractiveContext,
  isOAuthJwt,
  performOAuthLogin,
  resolveApiTokenWithOAuth,
  setOAuthDefaultProject,
} from "@alwaysmeticulous/client";
import type { MeticulousClient, OAuthProject } from "@alwaysmeticulous/client";
import chalk from "chalk";
import { CliUserError } from "../../utils/cli-user-error";
import {
  fetchAccessibleProjects,
  formatProjectSlug,
  promptForProject,
} from "../../utils/select-project";

/**
 * Resolves which Meticulous project this onboard run is for.
 *
 * - Not logged in: interactive runs open a browser OAuth flow; otherwise errors.
 * - Interactive OAuth: searchable picker (type to filter, ↑/↓ to select).
 * - `--project` / sole accessible project / project-scoped API token: no prompt.
 * - Non-interactive OAuth with several projects: requires `--project`.
 * - Project lookup failure after login: returns null and continues with local
 *   git context only.
 */
export const resolveOnboardProject = async (options: {
  apiToken: string | undefined;
  project: string | undefined;
}): Promise<Project | null> => {
  await ensureOnboardAuthenticated(options.apiToken);

  try {
    const apiToken = await resolveApiTokenWithOAuth({
      apiToken: options.apiToken,
      enableOAuthLogin: true,
    });
    const client = await createClientWithOAuth({
      apiToken: options.apiToken,
      enableOAuthLogin: true,
    });

    // Project-scoped API tokens already pin a single project.
    if (apiToken && !isOAuthJwt(apiToken)) {
      return await getProject(client);
    }

    const selectedId = await selectOAuthProjectId({
      client,
      project: options.project,
    });
    if (!selectedId) {
      return null;
    }
    return await getProject(client, selectedId);
  } catch (error) {
    if (error instanceof CliUserError) {
      throw error;
    }
    console.log(
      chalk.yellow(
        "Could not resolve a Meticulous project from your login (continuing with local git context only).",
      ),
    );
    console.log(
      chalk.dim(
        error instanceof Error ? `  ${error.message}` : `  ${String(error)}`,
      ),
    );
    return null;
  }
};

/**
 * Makes sure onboard has a token before it tries to pick a project. Interactive
 * runs open the same browser OAuth page as `auth login`, tagged so that page
 * does not print the agent-facing sign-in steps.
 */
export const ensureOnboardAuthenticated = async (
  apiToken: string | undefined,
): Promise<void> => {
  if (await getAuthToken(apiToken)) {
    return;
  }

  if (!isInteractiveContext()) {
    throw new CliUserError(
      "`meticulous onboard` needs you to be logged in. Run it in an interactive " +
        "terminal so it can open a browser, pass `--apiToken`, set " +
        "METICULOUS_API_TOKEN, or run `meticulous auth login --device` first " +
        "on a remote machine.",
    );
  }

  console.log("Not logged in. Opening the browser to sign in to Meticulous…");
  await performOAuthLogin({ intent: CLI_LOGIN_INTENT_ONBOARD });
};

const selectOAuthProjectId = async (options: {
  client: MeticulousClient;
  project: string | undefined;
}): Promise<string | null> => {
  const { client, project } = options;

  if (project) {
    const stored = await setOAuthDefaultProject(client, project.trim());
    if (!stored.projectId) {
      throw new CliUserError(
        `Could not resolve project '${project.trim()}'. Pass an organization/name slug or project id.`,
      );
    }
    console.log(chalk.dim(`  Using project: ${formatProjectSlug(stored)}`));
    return stored.projectId;
  }

  const projects = await fetchAccessibleProjects(client);
  if (projects.length === 0) {
    throw new CliUserError(
      "No projects are accessible to your account. Ask an organization admin to add you to a project.",
    );
  }

  if (projects.length === 1) {
    const only = projects[0];
    await setOAuthDefaultProject(client, only.id);
    console.log(
      chalk.dim(`  Using project: ${only.organization.name}/${only.name}`),
    );
    return only.id;
  }

  if (!isInteractiveContext()) {
    throw new CliUserError(
      "Multiple projects are accessible but none was selected (no interactive terminal). " +
        "Pass `--project organization/name` to choose one.",
    );
  }

  const selected = await promptForOnboardProject(client, projects);
  await setOAuthDefaultProject(client, selected.id);
  return selected.id;
};

const promptForOnboardProject = async (
  client: MeticulousClient,
  projects: OAuthProject[],
): Promise<OAuthProject> => {
  const existing = await getOAuthDefaultProject(client).catch(() => ({
    projectId: null as string | null,
  }));

  return promptForProject(projects, {
    message: "Which Meticulous project are you onboarding?",
    defaultProjectId: existing.projectId,
  });
};
