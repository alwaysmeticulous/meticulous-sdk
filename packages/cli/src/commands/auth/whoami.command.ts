import {
  createClientWithOAuth,
  getAgentWhoami,
  getAuthToken,
  isMissingCredentialsError,
  MISSING_AUTH_GUIDANCE,
} from "@alwaysmeticulous/client";
import type { AgentWhoamiResponse } from "@alwaysmeticulous/client";
import { initLogger, logNotice } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import {
  handleAuthFailure,
  toServerMessageError,
} from "../../utils/handle-auth-failure";

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

    // `createClientWithOAuth` already resolves the token (including any
    // interactive login and the legacy `selected-project.json` migration) via
    // `resolveApiTokenWithOAuth` internally — re-run that whole resolution just
    // to learn whether a local token exists would repeat the migration and
    // double-print its "no API token found" notice. `getAuthToken` reads back
    // the same (by now already-resolved) state without redoing any of that.
    const client = await createClientWithOAuth({
      apiToken: null,
      enableOAuthLogin: true,
    });
    const apiToken = await getAuthToken(null);

    // No local token: some environments inject credentials into outbound
    // requests instead, so the call still doubles as the probe for that — it
    // succeeds when injection is working and is refused when there is simply
    // no credential at all.
    if (!apiToken) {
      const injected = await getAgentWhoami(client).catch((error: unknown) => {
        if (!isMissingCredentialsError(error)) {
          throw error;
        }
        // The backend answers a request with no Authorization header with a
        // 403, so neither status tells a rejected injected credential apart
        // from never having logged in.
        if (error.missingReason.kind === "not-logged-in") {
          return null;
        }
        // A stored login that expired, was revoked or failed to refresh is
        // not the same as never having logged in; the error says which it was.
        throw new CliUserError(error.message, 1, "error", { reason: "auth" });
      });
      if (!injected) {
        throw new CliUserError(`Not logged in. ${MISSING_AUTH_GUIDANCE}`);
      }
      const selectedProject = injected.selectedProject;
      if (json) {
        printJson({
          authenticatedVia: "injected-credentials",
          selectedProject,
          // Deprecated alias for `selectedProject`, which is the key the OAuth
          // branch below and the MCP `whoami` tool both use for the same thing.
          pinnedProject: selectedProject,
        });
      } else {
        console.log("Authenticated via: credentials injected at request time");
        if (selectedProject) {
          console.log(`Pinned project: ${selectedProject}`);
        }
      }
      return;
    }

    const whoami = await getAgentWhoami(client).catch((error) => {
      handleAuthFailure(error);
      throw toServerMessageError(error);
    });

    if (whoami.authenticatedVia === "project-api-token") {
      printPinnedTokenWhoami(whoami, json);
      return;
    }

    printOAuthWhoami(whoami, json);
    // Always-on guidance (stderr) — --json only changes stdout, so the hint
    // still surfaces.
    if (!whoami.selectedProject) {
      logNotice(
        "No default project set. Run `meticulous auth set-project` to choose one.",
      );
    }
  }),
};

const printPinnedTokenWhoami = (
  whoami: AgentWhoamiResponse,
  json: boolean,
): void => {
  // Which local file or env var supplied the token is knowable only here — the
  // backend sees a bearer, not where it came from.
  const tokenSource = process.env["METICULOUS_API_TOKEN"]
    ? "METICULOUS_API_TOKEN environment variable"
    : "~/.meticulous/config.json";
  if (json) {
    printJson({
      authenticatedVia: whoami.authenticatedVia,
      tokenSource,
      selectedProject: whoami.selectedProject,
      // Deprecated alias for `selectedProject` — see the injected-credentials
      // branch above.
      pinnedProject: whoami.selectedProject,
    });
  } else {
    console.log(`Authenticated via: project API token (${tokenSource})`);
    if (whoami.selectedProject) {
      console.log(`Pinned project: ${whoami.selectedProject}`);
    }
  }
  // Always-on guidance (stderr) — --json only changes stdout, so the hint
  // still surfaces.
  logNotice(
    "This token is scoped to a single project. To sign in as a user, " +
      "run `meticulous auth logout`, unset METICULOUS_API_TOKEN, then " +
      "`meticulous auth login`.",
  );
};

const printOAuthWhoami = (whoami: AgentWhoamiResponse, json: boolean): void => {
  const organizations = whoami.organizations ?? [];
  if (json) {
    printJson({
      authenticatedVia: "oauth",
      email: whoami.email,
      firstName: whoami.firstName,
      lastName: whoami.lastName,
      isAdmin: whoami.isAdmin,
      organizations,
      selectedProject: whoami.selectedProject,
    });
    return;
  }
  console.log("Authenticated via: OAuth");
  console.log(
    `Logged in as: ${whoami.firstName} ${whoami.lastName} (${whoami.email})`,
  );
  if (whoami.isAdmin) {
    console.log("Role: Admin");
  }
  if (organizations.length > 0) {
    const formatted = organizations
      .map((org) => (org.role ? `${org.name} (${org.role})` : org.name))
      .join(", ");
    console.log(`Organizations: ${formatted}`);
  }
  if (whoami.selectedProject) {
    console.log(`Selected project: ${whoami.selectedProject}`);
  }
};
