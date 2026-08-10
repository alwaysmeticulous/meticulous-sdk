import {
  getAgentCurrentProject,
  type MeticulousClient,
} from "@alwaysmeticulous/client";

/**
 * How the project a project-scoped command ran against was chosen, when the
 * command didn't name one explicitly. Mirrors the backend's `AgentProjectSource`
 * (see `agent/project`'s `source` field) plus `unknown` for when it couldn't be
 * resolved at all (offline, older backend, credentials injected at request time
 * that the CLI itself never sees, ...).
 */
type ProjectSelection =
  | { source: "default"; slug: string }
  | { source: "auto-picked"; slug: string }
  | { source: "token"; slug: string }
  | { source: "unknown" };

/**
 * Appends guidance to an empty/not-found result from a project-scoped command,
 * naming the project the lookup actually ran against and how to change it. An
 * empty-handed lookup is far more often a wrong-project mismatch than a genuine
 * absence — a default project is stored server-side, so it is shared across
 * every machine and the hosted MCP server, and drifts without any local signal.
 * Returns `message` unchanged when `project` was passed explicitly: the caller
 * already chose the project, so there is nothing to disambiguate.
 *
 * Best-effort and never throws: the resolution is one extra request on a path
 * that has already failed, so a failure to describe the selection just falls
 * back to naming the commands rather than the project.
 */
export const appendProjectSelectionHint = async (
  message: string,
  client: MeticulousClient,
  project: string | undefined,
): Promise<string> => {
  const hint = await describeProjectSelection(client, project);
  return hint ? `${message} ${hint}` : message;
};

const describeProjectSelection = async (
  client: MeticulousClient,
  project: string | undefined,
): Promise<string> => {
  if (project != null && project.trim() !== "") {
    return "";
  }
  const selection = await resolveProjectSelection(client);
  switch (selection.source) {
    case "default":
      return (
        `Searched project ${selection.slug} — your default project, since no --project was given. ` +
        "If that is not the project you expected, run `meticulous auth list-projects` to see the " +
        'projects you can access, `meticulous auth set-project` (interactive) or `meticulous auth set-project --project "<org/project>"` ' +
        'to change the default, or pass --project "<org/project>" to override it for a single command.'
      );
    case "auto-picked":
      return (
        `Searched project ${selection.slug} — automatically selected since it's the only project your ` +
        "account can access, since no --project was given. If that is not the project you expected, run " +
        "`meticulous auth list-projects` to see the projects you can access, " +
        '`meticulous auth set-project --project "<org/project>"` to store an explicit default, or pass ' +
        '--project "<org/project>" to override it for a single command.'
      );
    case "token":
      // Only a project API token with cross-project access can actually use
      // --project (see `ApiTokenService.resolveProjectFromTokenOrRequest`); other
      // project and every test-run token reject it. Worded to be true either way
      // rather than assuming this token can't use it.
      return (
        `Searched project ${selection.slug}, which your API token is scoped to by default. Pass ` +
        '--project "<org/project>" to search a different project — this only works for a project API ' +
        "token with cross-project access; other tokens are rejected. `meticulous auth set-project` does " +
        "not apply to any API token — to change the default, log in as a user with `meticulous auth login`."
      );
    case "unknown":
      return (
        "No --project was given, so this used your default project. Run `meticulous auth get-project` to " +
        "see which project that is, `meticulous auth list-projects` for the projects you can access, and " +
        "`meticulous auth set-project` to change the default."
      );
  }
};

/**
 * Resolves which project the client's credentials target, and how, via a
 * single call to `agent/project` — it already reports this unambiguously for
 * either credential kind (see `AgentAccountService.getCurrentProject`), so
 * there's no need to guess from which of several endpoints happens to answer.
 */
const resolveProjectSelection = async (
  client: MeticulousClient,
): Promise<ProjectSelection> => {
  try {
    const current = await getAgentCurrentProject(client);
    switch (current.source) {
      case "user-default":
        return { source: "default", slug: current.project };
      case "auto-picked":
        return { source: "auto-picked", slug: current.project };
      case "api-token":
        return { source: "token", slug: current.project };
    }
  } catch {
    // Offline, an older backend without this route, no usable default, or
    // credentials injected at request time that this client never sees.
  }
  return { source: "unknown" };
};
