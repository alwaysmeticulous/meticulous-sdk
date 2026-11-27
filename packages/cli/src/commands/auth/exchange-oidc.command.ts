import {
  CI_OIDC_DEFAULT_AUDIENCE,
  isFetchError,
  resolveCiOidcAccessToken,
} from "@alwaysmeticulous/client";
import { initLogger, routeLogsToStderr } from "@alwaysmeticulous/common";
import type { CommandModule } from "yargs";
import { printJson } from "../../command-utils/print-json";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";
import { extractServerMessage } from "../../utils/handle-auth-failure";

interface Options {
  project?: string | undefined;
  oidcToken?: string | undefined;
  audience?: string | undefined;
  json: boolean;
}

/**
 * Exchanges a CI provider's OIDC identity JWT for a short-lived Meticulous
 * project-scoped API token (`wfat-...`). Prints only the token (or JSON with
 * `--json`) on stdout so CI scripts can capture it into `METICULOUS_API_TOKEN`.
 */
export const exchangeOidcCommand: CommandModule<unknown, Options> = {
  command: "exchange-oidc",
  describe:
    "Exchange a CI OIDC identity token for a short-lived Meticulous API token",
  builder: {
    project: {
      string: true,
      description:
        "Target project as 'organization/project'. Falls back to METICULOUS_PROJECT. " +
        "Optional when the OIDC token's repository maps to a single project with CI OIDC enabled.",
    },
    oidcToken: {
      string: true,
      description:
        "Raw OIDC identity JWT from your CI provider. Falls back to METICULOUS_OIDC_TOKEN, " +
        "then the GitHub Actions OIDC endpoint (requires 'permissions: id-token: write').",
    },
    audience: {
      string: true,
      description:
        "OIDC audience ('aud') to request on GitHub Actions. Falls back to " +
        `METICULOUS_OIDC_AUDIENCE or '${CI_OIDC_DEFAULT_AUDIENCE}'.`,
    },
    json: {
      boolean: true,
      default: false,
      description:
        "Output JSON ({accessToken, expiresAt}) instead of the bare access token.",
    },
  },
  handler: wrapHandler(async ({ project, oidcToken, audience, json }) => {
    routeLogsToStderr();
    initLogger();

    let result: Awaited<ReturnType<typeof resolveCiOidcAccessToken>>;
    try {
      result = await resolveCiOidcAccessToken({
        project,
        oidcToken,
        audience,
      });
    } catch (error) {
      throw toExchangeCliUserError(error);
    }

    if (json) {
      printJson(result);
    } else {
      console.log(result.accessToken);
    }
  }),
};

const toExchangeCliUserError = (error: unknown): unknown => {
  if (isFetchError(error)) {
    const status = error.response?.status;
    if (status === 400 || status === 401 || status === 403) {
      const serverMessage = extractServerMessage(error.response?.data);
      return new CliUserError(serverMessage ?? error.message, 1, "error", {
        reason: status === 400 ? "remote" : "auth",
      });
    }
    return error;
  }
  if (error instanceof Error) {
    return new CliUserError(error.message, 1, "error", { reason: "auth" });
  }
  return error;
};
