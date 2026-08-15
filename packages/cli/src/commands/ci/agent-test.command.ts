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

interface Options {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  repoDirectory?: string | undefined;
  localImageTag?: string | undefined;
  assetsDir?: string | undefined;
  assetsUploadId?: string | undefined;
  backendUrl?: string | undefined;
  backendProxyPaths?: string[] | undefined;
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
              username: process.env["METICULOUS_STAGING_USERNAME"],
              password: process.env["METICULOUS_STAGING_PASSWORD"],
              totpSecret: process.env["METICULOUS_STAGING_TOTP_SECRET"],
              proxyPaths: backendProxyPaths,
            },
          }
        : {}),
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
        "HTTPS staging backend URL. Credentials are read from METICULOUS_STAGING_USERNAME, METICULOUS_STAGING_PASSWORD, and METICULOUS_STAGING_TOTP_SECRET when the configured login flow requires TOTP.",
    },
    backendProxyPaths: {
      array: true,
      string: true,
      default: ["/api"],
      description:
        "Same-origin path prefixes to reverse proxy to the staging backend.",
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
