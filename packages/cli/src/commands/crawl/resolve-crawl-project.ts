import { getProject } from "@alwaysmeticulous/client";
import type { MeticulousClient } from "@alwaysmeticulous/client";
import { CliUserError } from "../../utils/cli-user-error";
import { resolveProjectIdentifier } from "../../utils/resolve-project-identifier";

/**
 * Resolves which project a `crawl` should record into, given the resolved API
 * token and the optional `--project` identifier (`<id | org/name | name>`).
 *
 * Without `--project`, the stored default applies (`resolveProjectIdentifier`:
 * the OAuth default project or the API token's own project). With `--project`,
 * resolution is left to the server's `getProject`, which fails closed — a real
 * project id the caller can't access is a 404, never a fallback to some other
 * project that happens to share the name.
 */
export const resolveCrawlProjectId = async ({
  client,
  apiToken,
  project,
}: {
  client: MeticulousClient;
  apiToken: string | null;
  project?: string | undefined;
}): Promise<string | undefined> => {
  const identifier = project?.trim();
  if (!identifier) {
    const { projectId } = await resolveProjectIdentifier(apiToken);
    return projectId;
  }

  const resolved = await getProject(client, identifier);
  if (resolved == null) {
    throw new CliUserError(
      `Project '${identifier}' not found or not accessible. ` +
        `List your accessible projects with 'meticulous auth list-projects'.`,
    );
  }
  return resolved.id;
};
