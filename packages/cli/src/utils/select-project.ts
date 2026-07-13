import {
  getOAuthDefaultProject,
  getOAuthProjects,
  isFetchError,
  setOAuthDefaultProject,
} from "@alwaysmeticulous/client";
import type {
  MeticulousClient,
  OAuthDefaultProjectResponse,
  OAuthProject,
} from "@alwaysmeticulous/client";
import { logNotice } from "@alwaysmeticulous/common";
import inquirer from "inquirer";
import { CliUserError } from "./cli-user-error";
import { extractServerMessage, handleAuthFailure } from "./handle-auth-failure";

/**
 * Fetches the projects accessible to the OAuth caller, surfacing auth failures
 * via `handleAuthFailure`. Shared by the project selection and listing flows.
 *
 * Results are sorted alphabetically by `organization/project` slug
 * (case-insensitive) so the interactive picker, listing output, and error
 * messages present projects in a predictable order regardless of what the API
 * returns.
 */
export const fetchAccessibleProjects = async (
  client: MeticulousClient,
): Promise<OAuthProject[]> => {
  try {
    const projects = await getOAuthProjects(client);
    return [...projects].sort(compareProjectsBySlug);
  } catch (error) {
    handleAuthFailure(error);
    throw error;
  }
};

const compareProjectsBySlug = (a: OAuthProject, b: OAuthProject): number => {
  const orgComparison = a.organization.name.localeCompare(
    b.organization.name,
    undefined,
    {
      sensitivity: "base",
    },
  );
  if (orgComparison !== 0) {
    return orgComparison;
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
};

/** `"organization/name"` slug, falling back to the bare id if unnamed. */
export const formatProjectSlug = (
  project: Pick<
    OAuthDefaultProjectResponse,
    "projectId" | "name" | "organization"
  >,
): string =>
  project.organization && project.name
    ? `${project.organization.name}/${project.name}`
    : (project.projectId ?? "");

/**
 * Picks a project and persists it as the caller's default (via the backend —
 * see `setOAuthDefaultProject`, consistent across machines and visible to the
 * MCP server). Shared by `auth login` and `auth set-project`.
 *
 * - When `project` is given, it's resolved by the backend, which accepts any of
 *   a bare id, an `organization/name` slug, or a unique bare name (see
 *   `ProjectService.resolveForUserByIdentifier`). We deliberately do NOT match
 *   client-side — the CLI would only understand the slug form and diverge from
 *   the backend (and from the `--project` override on agent commands).
 * - Otherwise auto-selects the only project, or prompts interactively when
 *   there are several — unless `allowInteractivePrompt` is `false` (e.g. a
 *   headless login), in which case it throws with guidance rather than
 *   blocking on a prompt that no terminal can answer.
 *
 * Throws `CliUserError` when the identifier can't be resolved, the caller has
 * no accessible projects, or a project can't be resolved without a prompt.
 */
export const selectAndStoreProject = async ({
  client,
  project,
  allowInteractivePrompt = true,
}: {
  client: MeticulousClient;
  project?: string | undefined;
  allowInteractivePrompt?: boolean;
}): Promise<string> => {
  if (project) {
    // Tolerate accidental surrounding whitespace (e.g. from copy-paste). The
    // backend resolves the identifier flexibly and returns the resolved
    // project, so there's no client-side lookup here.
    const trimmedProject = project.trim();
    let stored: OAuthDefaultProjectResponse;
    try {
      stored = await setOAuthDefaultProject(client, trimmedProject);
    } catch (error) {
      handleAuthFailure(error);
      throw await toProjectResolutionError(client, trimmedProject, error);
    }
    const projectSlug = formatProjectSlug(stored);
    logNotice(`Selected project: ${projectSlug}`);
    return projectSlug;
  }

  const projects = await fetchAccessibleProjects(client);
  if (projects.length === 0) {
    throw new CliUserError(
      "No projects are accessible to your account. Ask an organization " +
        "admin to add you to a project.",
    );
  }

  let selected: OAuthProject;
  if (projects.length === 1) {
    selected = projects[0];
  } else if (allowInteractivePrompt) {
    selected = await promptForProject(projects);
  } else {
    throw new CliUserError(
      "Multiple projects are accessible but none was selected (no interactive " +
        "terminal). Pass `--project` or run `meticulous auth set-project` to " +
        "choose one.",
      1,
      "warn",
    );
  }

  const projectSlug = `${selected.organization.name}/${selected.name}`;
  await setOAuthDefaultProject(client, selected.id);
  logNotice(`Selected project: ${projectSlug}`);
  return projectSlug;
};

/**
 * Turns a failed explicit-project resolution into a helpful `CliUserError`: the
 * backend's own message (not found / not accessible / ambiguous name) plus the
 * list of accessible projects to pick from.
 */
const toProjectResolutionError = async (
  client: MeticulousClient,
  identifier: string,
  error: unknown,
): Promise<CliUserError> => {
  const serverMessage = isFetchError(error)
    ? extractServerMessage(error.response?.data)
    : null;
  const projects = await fetchAccessibleProjects(client).catch(() => []);
  const list = projects.length
    ? `\n\nAvailable projects:\n${formatProjectList(projects)}`
    : "";
  const detail =
    serverMessage ?? `Project '${identifier}' not found or not accessible.`;
  return new CliUserError(`${detail}${list}`);
};

/**
 * Project selection for `auth login`. Behaves like `selectAndStoreProject`
 * (persist an explicit `--project`, auto-select+persist a sole project, prompt
 * among several) with one addition: if the user already has a stored default,
 * respect it rather than re-prompting or failing — so a returning user (in
 * particular a headless `--non-interactive` login) succeeds without re-picking.
 *
 * There's no "cleared default" to preserve here: clearing isn't user-reachable
 * (no `unset-project` command, no web "no default" option), so always selecting
 * a sole project can't silently undo an intentional clear.
 */
export const selectProjectOnLogin = async ({
  client,
  project,
  interactive,
}: {
  client: MeticulousClient;
  project?: string | undefined;
  interactive: boolean;
}): Promise<void> => {
  // An explicit `--project` always wins.
  if (project) {
    await selectAndStoreProject({
      client,
      project,
      allowInteractivePrompt: interactive,
    });
    return;
  }

  // With several accessible projects, respect an already-stored default (the
  // backend only auto-picks when there's exactly one project, so a non-null
  // result here is necessarily the stored preference). This is what lets a
  // returning `--non-interactive` login succeed instead of failing for lack of
  // a picker.
  const projects = await fetchAccessibleProjects(client);
  if (projects.length > 1) {
    const existing = await getOAuthDefaultProject(client);
    if (existing.projectId) {
      logNotice(`Using your default project: ${formatProjectSlug(existing)}.`);
      return;
    }
  }

  // Otherwise select-and-persist: a sole project is auto-selected, several
  // prompt interactively (or, headless, error with guidance).
  await selectAndStoreProject({ client, allowInteractivePrompt: interactive });
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
