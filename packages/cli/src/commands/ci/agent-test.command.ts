import type { ContainerEnvVariable } from "@alwaysmeticulous/client";
import { resolveApiTokenWithOAuth } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { generateSessions } from "@alwaysmeticulous/remote-replay-launcher";
import * as Sentry from "@sentry/node";
import type { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";
import { resolveProjectIdentifier } from "../../utils/resolve-project-identifier";
import { resolveGitOptions } from "./resolve-git-options";

const STAGING_ENV_PREFIX = "METICULOUS_STAGING_";

/**
 * Collects every METICULOUS_STAGING_* environment variable into a login-option
 * map keyed by the camelCased suffix (METICULOUS_STAGING_SKIP_EMAIL_CLIENT_ID
 * becomes skipEmailClientId). The map is opaque to the CLI and backend — only
 * the worker's login flow interprets keys — so new login options ship without
 * a CLI release.
 */
const collectLoginOptions = (env: NodeJS.ProcessEnv): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).flatMap(([name, value]) =>
      name.startsWith(STAGING_ENV_PREFIX) && value
        ? [[toCamelCase(name.slice(STAGING_ENV_PREFIX.length)), value]]
        : [],
    ),
  );

const toCamelCase = (screamingSnakeCase: string): string =>
  screamingSnakeCase
    .toLowerCase()
    .replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());

interface Options {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  repoDirectory?: string | undefined;
  localImageTag?: string | undefined;
  assetsDir?: string | undefined;
  assetsUploadId?: string | undefined;
  backendUrl?: string | undefined;
  backendProxyPaths?: string[] | undefined;
  trustedOrigins?: string[] | undefined;
  appPort?: number | undefined;
  instructionsFile?: string | undefined;
  enableLocalMocks?: boolean | undefined;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
  containerHealthCheckEndpoint?: string | undefined;
  dryRun?: boolean;
}

const handler = async ({
  apiToken,
  commitSha: commitSha_,
  repoDirectory,
  localImageTag,
  assetsDir,
  assetsUploadId,
  backendUrl,
  backendProxyPaths,
  trustedOrigins,
  appPort,
  instructionsFile,
  enableLocalMocks,
  containerPort,
  containerEnv,
  containerHealthCheckEndpoint,
  dryRun,
}: Options): Promise<void> => {
  const logger = initLogger();

  const { commitSha } = await resolveGitOptions({
    commitSha: commitSha_,
    baseSha: undefined,
    gitDiffOutput: undefined,
    repoDirectory,
  });
  const targets = [localImageTag, assetsDir, assetsUploadId].filter(Boolean);
  if (targets.length !== 1) {
    throw new Error(
      "Provide exactly one of --localImageTag, --assetsDir, or --assetsUploadId.",
    );
  }
  if (enableLocalMocks && backendUrl) {
    throw new Error("--enableLocalMocks cannot be combined with --backendUrl.");
  }
  if (trustedOrigins?.length && localImageTag) {
    throw new Error("--trustedOrigins is only supported with uploaded assets.");
  }
  if (appPort != null && localImageTag) {
    throw new Error("--appPort is only supported with uploaded assets.");
  }

  const target =
    localImageTag ?? assetsDir ?? `uploaded assets ${assetsUploadId ?? ""}`;
  logger.info(
    `Launching agentic PR testing with ${target} for commit ${commitSha}`,
  );

  if (dryRun) {
    logger.info(
      `Dry run: would prepare "${target}" and launch agentic session generation for commit ${commitSha}`,
    );
    return;
  }

  Sentry.captureMessage("Received generate sessions request", {
    level: "debug",
    extra: {
      commitSha,
      localImageTag,
      assetsDir,
      assetsUploadId,
      backendUrl,
      trustedOrigins,
      appPort,
      enableLocalMocks,
    },
  });

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const projectIdentifier = await resolveProjectIdentifier(apiToken_);

  try {
    await generateSessions({
      apiToken: apiToken_,
      localImageTag,
      assetsDirectory: assetsDir,
      assetsUploadId,
      commitSha,
      ...(instructionsFile ? { instructionsFile } : {}),
      enableLocalMocks,
      containerPort,
      containerEnv,
      containerHealthCheckEndpoint,
      ...(backendUrl
        ? {
            backend: {
              url: backendUrl,
              loginOptions: collectLoginOptions(process.env),
              proxyPaths: backendProxyPaths,
            },
          }
        : {}),
      ...(trustedOrigins?.length ? { trustedOrigins } : {}),
      ...(appPort != null ? { appPort } : {}),
      ...projectIdentifier,
    });
  } catch (error) {
    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    } else {
      throw error;
    }
  }
};

export const ciAgentTestCommand: CommandModule<unknown, Options> = {
  command: "agent-test",
  describe:
    "Upload a container or static frontend assets to Meticulous and " +
    "launch an agent that explores and tests the PR, generating additional sessions",
  builder: {
    apiToken: OPTIONS.apiToken,
    commitSha: OPTIONS.commitSha,
    repoDirectory: {
      string: true,
      description:
        "The path to a git repository. Automatically infers --commitSha from the repo. " +
        "Cannot be combined with --commitSha.",
    },
    localImageTag: {
      string: true,
      description:
        "The local Docker image tag of the app under test (e.g., 'myapp:latest' or image SHA)",
    },
    assetsDir: {
      string: true,
      description:
        "A directory of built frontend assets to upload and serve to the agent.",
    },
    assetsUploadId: {
      string: true,
      description: "An existing uploaded-assets upload ID to serve.",
    },
    backendUrl: {
      string: true,
      description:
        "HTTPS staging backend URL. Login credentials and options are read from METICULOUS_STAGING_* environment variables and forwarded to the project's configured login flow: " +
        "METICULOUS_STAGING_USERNAME and METICULOUS_STAGING_PASSWORD, plus flow-specific values such as METICULOUS_STAGING_TOTP_SECRET (base32 TOTP seed) or METICULOUS_STAGING_SKIP_EMAIL_CLIENT_ID (trusted-automation id that bypasses an email verification challenge).",
    },
    backendProxyPaths: {
      array: true,
      string: true,
      default: ["/api"],
      description:
        "Same-origin path prefixes to reverse proxy to the staging backend.",
    },
    trustedOrigins: {
      array: true,
      string: true,
      description:
        "HTTPS origins the agent's browser may call besides the app origin, " +
        "e.g. --trustedOrigins https://auth.example.com --trustedOrigins https://api.example.com. " +
        "Use when the uploaded frontend makes absolute cross-origin requests. " +
        "Each value must be an https origin (no path, query, or credentials). " +
        "Only supported with uploaded assets.",
    },
    appPort: {
      number: true,
      description:
        "Port to serve uploaded frontend assets on. Defaults to 8000 on the worker. " +
        "The run fails if the port is unavailable — there is no fallback — so staging " +
        "CORS allowlists can pin http://localhost:<port>. Only supported with uploaded assets.",
    },
    instructionsFile: {
      string: true,
      description:
        "Path to a markdown file with instructions for the agent (e.g. how to log in, which accounts to use).",
    },
    enableLocalMocks: {
      boolean: true,
      description:
        "Mock the container's network traffic from relevant recorded sessions.",
    },
    containerPort: {
      number: true,
      description: "The port to expose the container on.",
    },
    containerEnv: {
      array: true,
      coerce: (value: string[]) =>
        value.map((v) => {
          const [name, ...rest] = v.split("=");
          const envValue = rest.join("=");
          if (!name || !envValue) {
            throw new Error(`Invalid environment variable: ${v}`);
          }
          return { name, value: envValue };
        }),
      description: "The environment variables to set in the container.",
    },
    containerHealthCheckEndpoint: {
      string: true,
      description:
        "The endpoint path to use for health checks on the container (e.g., '/health').",
    },
    dryRun: {
      boolean: true,
      description: "Validate the options and exit without launching a run.",
    },
  },
  handler: wrapHandler(handler),
};
