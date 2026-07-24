import {
  createClientWithOAuth,
  getOAuthDefaultProject,
  isOAuthJwt,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { resolvePinnedProjectSlug } from "../../utils/resolve-project-identifier";
import { formatProjectSlug } from "../../utils/select-project";

/**
 * Prints the project that project-scoped CLI commands would currently use —
 * the token's own pinned project for a project/test-run API token, or the
 * OAuth caller's default project (`auth set-project`) otherwise. Scriptable:
 * only the resolved `organization/name` slug goes to stdout; exits non-zero
 * with guidance on stderr if nothing is resolved.
 */
export const getProjectCommand: CommandModule = {
  command: "get-project",
  describe:
    "Print the project that project-scoped commands would currently use",
  builder: {},
  handler: wrapHandler(async () => {
    initLogger();

    const apiToken = await resolveApiTokenWithOAuth({
      apiToken: null,
      enableOAuthLogin: true,
    });

    if (apiToken && !isOAuthJwt(apiToken)) {
      const pinned = await resolvePinnedProjectSlug(apiToken);
      if (!pinned) {
        throw new CliUserError(
          "Could not resolve the project this API token is bound to.",
        );
      }
      console.log(pinned);
      return;
    }

    const client = await createClientWithOAuth({
      apiToken: null,
      enableOAuthLogin: true,
    });
    const defaultProject = await getOAuthDefaultProject(client);
    if (!defaultProject.projectId) {
      throw new CliUserError(
        "No default project set. Run `meticulous auth set-project` to choose one.",
      );
    }
    console.log(formatProjectSlug(defaultProject));
  }),
};
