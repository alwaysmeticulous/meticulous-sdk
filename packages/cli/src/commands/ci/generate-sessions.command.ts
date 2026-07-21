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
  localImageTag: string;
  instructionsFile?: string | undefined;
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
  instructionsFile,
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

  logger.info(
    `Generating sessions with image ${localImageTag} for commit ${commitSha}`,
  );

  if (dryRun) {
    logger.info(
      `Dry run: would push container image "${localImageTag}" and launch agentic session generation for commit ${commitSha}`,
    );
    return;
  }

  Sentry.captureMessage("Received generate sessions request", {
    level: "debug",
    extra: { commitSha, localImageTag },
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
      commitSha,
      ...(instructionsFile ? { instructionsFile } : {}),
      containerPort,
      containerEnv,
      containerHealthCheckEndpoint,
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

export const ciGenerateSessionsCommand: CommandModule<unknown, Options> = {
  command: "generate-sessions",
  describe:
    "Upload a Docker container and an instructions file to Meticulous and " +
    "launch an agent that generates additional sessions to test on the PR",
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
      demandOption: true,
      string: true,
      description:
        "The local Docker image tag of the app under test (e.g., 'myapp:latest' or image SHA)",
    },
    instructionsFile: {
      string: true,
      description:
        "Path to a markdown file with instructions for the agent (e.g. how to log in, which accounts to use).",
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
  },
  handler: wrapHandler(handler),
};
