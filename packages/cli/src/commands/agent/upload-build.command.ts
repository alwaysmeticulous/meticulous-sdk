import { ContainerEnvVariable, resolveApiTokenWithOAuth } from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { uploadBuild } from "@alwaysmeticulous/remote-replay-launcher";
import { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";
import { resolveProjectIdentifier } from "../../utils/resolve-project-identifier";
import { resolveBuildCommitSha } from "./build-git-options";
import { detectUploadMode, parseRewrites } from "./trigger-test-run/trigger-test-run.utils";

interface Options {
  apiToken?: string | undefined;
  commitSha?: string | undefined;
  repoDirectory?: string | undefined;
  appDirectory?: string | undefined;
  appZip?: string | undefined;
  rewrites?: string;
  localImageTag?: string | undefined;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
  containerHealthCheckEndpoint?: string | undefined;
  json: boolean;
  dryRun?: boolean;
}

const handler = async ({
  apiToken,
  commitSha: commitSha_,
  repoDirectory,
  appDirectory,
  appZip,
  rewrites,
  localImageTag,
  containerPort,
  containerEnv,
  containerHealthCheckEndpoint,
  json,
  dryRun,
}: Options): Promise<void> => {
  const logger = initLogger();

  const mode = detectUploadMode({ localImageTag, appDirectory, appZip });
  const commitSha = await resolveBuildCommitSha({
    commitSha: commitSha_,
    repoDirectory,
  });

  if (dryRun) {
    const what =
      mode === "container"
        ? `container image "${localImageTag}"`
        : `assets from ${appDirectory ?? appZip}`;
    logger.info(
      `Dry run: would upload ${what} and register a deployment for commit ${commitSha}`,
    );
    return;
  }

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });
  const projectIdentifier = resolveProjectIdentifier(apiToken_);

  let result;
  try {
    result = await uploadBuild({
      apiToken: apiToken_,
      commitSha,
      appDirectory,
      appZip,
      rewrites: parseRewrites(rewrites),
      localImageTag,
      containerPort,
      containerEnv,
      containerHealthCheckEndpoint,
      ...projectIdentifier,
    });
  } catch (error) {
    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    }
    throw error;
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(result.deploymentId);
};

const parseContainerEnv = (value: string[]): ContainerEnvVariable[] =>
  value.map((v) => {
    const [name, ...rest] = v.split("=");
    const envValue = rest.join("=");
    if (!name || !envValue) {
      throw new Error(`Invalid environment variable: ${v}`);
    }
    return { name, value: envValue };
  });

export const uploadBuildCommand: CommandModule<unknown, Options> = {
  command: "upload-build",
  describe:
    "Upload a build (static assets or a Docker container) and register a reusable deployment, without triggering a test run",
  builder: {
    apiToken: OPTIONS.apiToken,
    commitSha: {
      ...OPTIONS.commitSha,
      description:
        "The commit the build is of. Defaults to the current git HEAD (or an ephemeral commit when the tree is dirty).",
    },
    repoDirectory: {
      string: true,
      description:
        "Path to a git repository, used to infer --commitSha from HEAD (or an ephemeral commit when dirty).",
    },
    appDirectory: {
      string: true,
      description:
        "The directory containing the application's static assets (asset upload mode).",
    },
    appZip: {
      string: true,
      description:
        "The zip file containing the application's static assets (asset upload mode).",
    },
    rewrites: {
      string: true,
      default: "[]",
      description:
        "URL rewrite rules (asset upload mode). A valid JSON array as described at https://github.com/vercel/serve-handler?tab=readme-ov-file#rewrites-array." +
        " If no rules are passed, we default to '{ source: \"**\", destination: \"/index.html\" }'.",
    },
    localImageTag: {
      string: true,
      description:
        "The local Docker image tag to upload, e.g. 'myapp:latest' (container upload mode).",
    },
    containerPort: {
      number: true,
      description: "The port to expose the container on (container upload mode).",
    },
    containerEnv: {
      array: true,
      coerce: parseContainerEnv,
      description:
        "Environment variables to set in the container, as name=value (container upload mode).",
    },
    containerHealthCheckEndpoint: {
      string: true,
      description:
        "The endpoint path to use for health checks on the container, e.g. '/health' (container upload mode).",
    },
    json: {
      boolean: true,
      default: false,
      description:
        "Output the result ({ deploymentId, source, commitSha }) as JSON.",
    },
  },
  handler: wrapHandler(handler),
};
