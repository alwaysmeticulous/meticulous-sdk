import {
  createClient,
  getProject,
  getStoredProject,
  getWhoami,
  isOAuthJwt,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import type { Logger } from "loglevel";
import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { handleAuthFailure } from "../../utils/handle-auth-failure";

export const whoamiCommand: CommandModule = {
  command: "whoami",
  describe: "Show the currently logged-in user",
  builder: {},
  handler: wrapHandler(async () => {
    const logger = initLogger();

    const apiToken = await resolveApiTokenWithOAuth({
      apiToken: null,
      enableOAuthLogin: true,
    });

    // A project-scoped API token (env var or legacy config) cannot be used
    // against the OAuth-only `/oauth/whoami` endpoint — it would 403. Report
    // the active credential without a doomed round-trip.
    if (!isOAuthJwt(apiToken)) {
      const source = process.env["METICULOUS_API_TOKEN"]
        ? "METICULOUS_API_TOKEN environment variable"
        : "~/.meticulous/config.json";
      logger.info(`Authenticated via: project API token (${source})`);
      await reportProjectForApiToken(apiToken, logger);
      logger.info(
        "This token is scoped to a single project. To sign in as a user, " +
          "run `meticulous auth logout`, unset METICULOUS_API_TOKEN, then " +
          "`meticulous auth login`.",
      );
      return;
    }

    const client = createClient({ apiToken });

    try {
      const { email, firstName, lastName, isAdmin, organizations } =
        await getWhoami(client);
      logger.info("Authenticated via: OAuth");
      logger.info(`Logged in as: ${firstName} ${lastName} (${email})`);

      if (isAdmin) {
        logger.info("Role: Admin");
      }

      if (organizations.length > 0) {
        const formatted = organizations
          .map((org) => (org.role ? `${org.name} (${org.role})` : org.name))
          .join(", ");
        logger.info(`Organizations: ${formatted}`);
      }

      const project = getStoredProject();
      if (project) {
        logger.info(`Selected project: ${project}`);
      } else {
        logger.info(
          "No project selected. Run `meticulous auth set-project` to choose one.",
        );
      }
    } catch (error) {
      handleAuthFailure(error);
      throw error;
    }
  }),
};

/**
 * Resolves and logs the single project a project-scoped API token is bound to,
 * via the `token-info` endpoint. Best-effort: any failure (network, older
 * backend without the endpoint, etc.) is swallowed so `whoami` never fails just
 * because it could not name the pinned project.
 */
const reportProjectForApiToken = async (
  apiToken: string,
  logger: Logger,
): Promise<void> => {
  try {
    const client = createClient({ apiToken });
    const project = await getProject(client);
    if (project) {
      logger.info(
        `Pinned project: ${project.organization.name}/${project.name}`,
      );
    }
  } catch {
    // Ignore — the project name is informational only.
  }
};
