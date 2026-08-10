import {
  createClientWithOAuth,
  getAgentCurrentProject,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  handleAuthFailure,
  toServerMessageError,
} from "../../utils/handle-auth-failure";

interface Options {
  json: boolean;
}

/**
 * Prints the project that project-scoped CLI commands would currently use —
 * the token's own pinned project for a project/test-run API token, or the
 * OAuth caller's default project (`auth set-project`) otherwise. Scriptable:
 * only the resolved `organization/name` slug goes to stdout; exits non-zero
 * with the backend's guidance on stderr if nothing is resolved.
 */
export const getProjectCommand: CommandModule<unknown, Options> = {
  command: "get-project",
  describe:
    "Print the project that project-scoped commands would currently use",
  builder: {
    json: {
      boolean: true,
      default: false,
      description:
        "Output the result as JSON ({project, projectId, source}, where source " +
        "is 'user-default' or 'api-token') instead of the bare " +
        "'organization/project' slug. Only stdout is affected — notices still " +
        "go to stderr.",
    },
  },
  handler: wrapHandler(async ({ json }: Options) => {
    initLogger();

    const client = await createClientWithOAuth({
      apiToken: null,
      enableOAuthLogin: true,
    });
    const current = await getAgentCurrentProject(client).catch((error) => {
      handleAuthFailure(error);
      throw toServerMessageError(error);
    });

    if (json) {
      printJson(current);
    } else {
      console.log(current.project);
    }
  }),
};
