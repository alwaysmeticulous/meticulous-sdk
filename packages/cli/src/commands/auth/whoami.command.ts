import {
  createClient,
  createClientWithOAuth,
  getProject,
  getStoredProject,
  getWhoami,
  isOAuthJwt,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { handleAuthFailure } from "../../utils/handle-auth-failure";

interface Options {
  json: boolean;
}

export const whoamiCommand: CommandModule<unknown, Options> = {
  command: "whoami",
  describe: "Show the currently logged-in user",
  builder: {
    json: {
      boolean: true,
      default: false,
      description:
        "Output the result as JSON. Only stdout is affected — progress and " +
        "notices still go to stderr — and stdout is always valid JSON, " +
        "including an empty array/object when there is no result.",
    },
  },
  handler: wrapHandler(async ({ json }: Options) => {
    initLogger();

    const apiToken = await resolveApiTokenWithOAuth({
      apiToken: null,
      enableOAuthLogin: true,
    });

    // A project-scoped API token (env var or legacy config) cannot be used
    // against the OAuth-only `/oauth/whoami` endpoint — it would 403. Report
    // the active credential without a doomed round-trip.
    if (!isOAuthJwt(apiToken)) {
      const tokenSource = process.env["METICULOUS_API_TOKEN"]
        ? "METICULOUS_API_TOKEN environment variable"
        : "~/.meticulous/config.json";
      const pinnedProject = await resolvePinnedProject(apiToken);

      if (json) {
        printJson({
          authenticatedVia: "project-api-token",
          tokenSource,
          pinnedProject,
        });
      } else {
        console.log(`Authenticated via: project API token (${tokenSource})`);
        if (pinnedProject) {
          console.log(`Pinned project: ${pinnedProject}`);
        }
      }
      // Always-on guidance (stderr) — --json only changes stdout, so the hint
      // still surfaces.
      logNotice(
        "This token is scoped to a single project. To sign in as a user, " +
          "run `meticulous auth logout`, unset METICULOUS_API_TOKEN, then " +
          "`meticulous auth login`.",
      );
      return;
    }

    const client = await createClientWithOAuth({
      apiToken: null,
      enableOAuthLogin: true,
    });

    try {
      const { email, firstName, lastName, isAdmin, organizations } =
        await getWhoami(client);
      const selectedProject = getStoredProject();

      if (json) {
        printJson({
          authenticatedVia: "oauth",
          email,
          firstName,
          lastName,
          isAdmin,
          organizations: organizations.map((org) => ({
            name: org.name,
            role: org.role ?? null,
          })),
          selectedProject: selectedProject ?? null,
        });
      } else {
        console.log("Authenticated via: OAuth");
        console.log(`Logged in as: ${firstName} ${lastName} (${email})`);
        if (isAdmin) {
          console.log("Role: Admin");
        }
        if (organizations.length > 0) {
          const formatted = organizations
            .map((org) => (org.role ? `${org.name} (${org.role})` : org.name))
            .join(", ");
          console.log(`Organizations: ${formatted}`);
        }
        if (selectedProject) {
          console.log(`Selected project: ${selectedProject}`);
        }
      }
      // Always-on guidance (stderr) — --json only changes stdout, so the hint
      // still surfaces.
      if (!selectedProject) {
        logNotice(
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
 * Resolves the single project a project-scoped API token is bound to, via the
 * `token-info` endpoint. Best-effort: any failure (network, older backend
 * without the endpoint, etc.) resolves to `null` so `whoami` never fails just
 * because it could not name the pinned project.
 */
const resolvePinnedProject = async (
  apiToken: string,
): Promise<string | null> => {
  try {
    const client = createClient({ apiToken });
    const project = await getProject(client);
    return project ? `${project.organization.name}/${project.name}` : null;
  } catch {
    // Ignore — the project name is informational only.
    return null;
  }
};
