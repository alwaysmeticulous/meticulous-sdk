import {
  createClientWithOAuth,
  getOAuthDefaultProject,
  getWhoami,
  isOAuthJwt,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { handleAuthFailure } from "../../utils/handle-auth-failure";
import { resolvePinnedProjectSlug } from "../../utils/resolve-project-identifier";
import { formatProjectSlug } from "../../utils/select-project";

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

    // No local token: some environments inject credentials into outbound
    // requests instead. The injected credential is a project API token, which
    // the OAuth-only `/oauth/whoami` endpoint would reject — so probe the
    // token-metadata endpoint (which accepts project tokens, and swallows
    // failures into `null`) rather than falling through to the OAuth path.
    if (!apiToken) {
      const pinnedProject = await resolvePinnedProjectSlug(null);
      if (!pinnedProject) {
        throw new CliUserError(
          "Not logged in. Run `meticulous auth login`, or set " +
            "METICULOUS_API_TOKEN. In terminals without a browser, use " +
            "`meticulous auth login --non-interactive`.",
        );
      }
      if (json) {
        printJson({
          authenticatedVia: "injected-credentials",
          pinnedProject,
        });
      } else {
        console.log("Authenticated via: credentials injected at request time");
        console.log(`Pinned project: ${pinnedProject}`);
      }
      return;
    }

    // A project-scoped API token (env var or legacy config) cannot be used
    // against the OAuth-only `/oauth/whoami` endpoint — it would 403. Report
    // the active credential without a doomed round-trip.
    if (!isOAuthJwt(apiToken)) {
      const tokenSource = process.env["METICULOUS_API_TOKEN"]
        ? "METICULOUS_API_TOKEN environment variable"
        : "~/.meticulous/config.json";
      const pinnedProject = await resolvePinnedProjectSlug(apiToken);

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
      const defaultProject = await getOAuthDefaultProject(client);
      const selectedProject = defaultProject.projectId
        ? formatProjectSlug(defaultProject)
        : null;

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
          "No default project set. Run `meticulous auth set-project` to choose one.",
        );
      }
    } catch (error) {
      handleAuthFailure(error);
      throw error;
    }
  }),
};
