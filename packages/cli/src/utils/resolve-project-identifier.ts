import { getStoredProjectId, isOAuthJwt } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";

/**
 * Resolves the project identifier for project-scoped CLI commands given the
 * resolved API token.
 *
 * - OAuth tokens are user-scoped (not project-scoped), so they require a
 *   stored project id (set via `meticulous auth set-project`).
 * - Project-scoped API tokens already pin the project, so no extra
 *   identifier is needed.
 */
export const resolveProjectIdentifier = (
  apiToken: string,
): { projectId?: string } => {
  if (!isOAuthJwt(apiToken)) {
    return {};
  }

  const projectId = getStoredProjectId();
  if (!projectId) {
    const logger = initLogger();
    logger.error(
      "No project selected. Run `meticulous auth set-project` to choose " +
        "one before running OAuth-authenticated commands.",
    );
    process.exit(1);
  }
  return { projectId };
};

/**
 * Best-effort lookup of the stored projectId for OAuth callers. Returns
 * `undefined` for project-scoped API tokens (the token already pins the
 * project) and for OAuth tokens with no stored project. Use this for calls
 * where the project context is useful but not strictly required — e.g. agent
 * telemetry — and a missing project should not abort the command.
 */
export const getProjectIdForOAuthCaller = (
  apiToken: string,
): string | undefined => {
  if (!isOAuthJwt(apiToken)) {
    return undefined;
  }
  return getStoredProjectId() ?? undefined;
};
