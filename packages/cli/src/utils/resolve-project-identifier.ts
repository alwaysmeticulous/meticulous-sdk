import { initLogger } from "@alwaysmeticulous/common";
import { isOAuthJwt, resolveDefaultProjectId } from "@alwaysmeticulous/client";
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
