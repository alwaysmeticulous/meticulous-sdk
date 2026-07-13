import type log from "loglevel";
import { getOAuthDefaultProject } from "../api/oauth.api";
import { buildClient } from "../client";

/**
 * Resolves the OAuth caller's default project (set via `auth set-project` or
 * the web app's user settings) directly from the backend — there's no local
 * cache; every OAuth-authenticated CLI command that needs a project id and
 * wasn't given one explicitly makes this call. Returns `null` when no
 * default is set (and the backend didn't transiently auto-pick a sole
 * project — see `DefaultProjectService.resolveDefaultProjectForExecution`).
 */
export const resolveDefaultProjectId = async (
  apiToken: string,
  logger: log.Logger,
  appInfo?: string,
): Promise<string | null> => {
  const client = buildClient(apiToken, logger, appInfo);
  const { projectId } = await getOAuthDefaultProject(client);
  return projectId;
};
