import { initLogger } from "@alwaysmeticulous/common";
import {
  createClient,
  getProject,
  isOAuthJwt,
  resolveDefaultProjectId,
} from "@alwaysmeticulous/client";
import { CliUserError } from "./cli-user-error";

/**
 * Resolves the project identifier for project-scoped CLI commands given the
 * resolved API token.
 *
 * - OAuth tokens are user-scoped (not project-scoped), so they require a
 *   default project — set via `meticulous auth set-project` or the web app's
 *   user settings, resolved from the backend (not a local file: it needs to
 *   be consistent across machines and visible to the hosted MCP server).
 * - Project-scoped API tokens already pin the project, so no extra
 *   identifier is needed.
 *
 * Throws `CliUserError` when an OAuth caller has no default project. The
 * top-level `wrapHandler` catches it and exits non-zero with the message.
 */
export const resolveProjectIdentifier = async (
  apiToken: string | null,
): Promise<{ projectId?: string }> => {
  if (!apiToken || !isOAuthJwt(apiToken)) {
    return {};
  }

  const logger = initLogger();
  // The legacy `selected-project.json` migration runs in the shared OAuth
  // token-init path (`resolveApiTokenWithOAuth`), so by the time we resolve the
  // default here it has already been migrated if it was present.
  const projectId = await resolveDefaultProjectId(apiToken, logger);
  if (!projectId) {
    throw new CliUserError(
      "No default project set. Run `meticulous auth set-project` to choose " +
        "one before running OAuth-authenticated commands.",
    );
  }
  return { projectId };
};

/**
 * Resolves the single project a project-scoped API token is bound to, via the
 * `token-info` endpoint, as an `"organization/name"` slug. Best-effort: any
 * failure (network, older backend without the endpoint, etc.) resolves to
 * `null` rather than throwing — used for informational display (`whoami`,
 * `get-project`), where a missing project name shouldn't fail the command.
 *
 * A `null` token sends the request without an Authorization header, which
 * doubles as a probe for environments that inject credentials into outbound
 * requests: it resolves to the pinned project when injection is working and
 * `null` otherwise.
 */
export const resolvePinnedProjectSlug = async (
  apiToken: string | null,
): Promise<string | null> => {
  try {
    const client = createClient({ apiToken });
    const project = await getProject(client);
    return project ? `${project.organization.name}/${project.name}` : null;
  } catch {
    return null;
  }
};
