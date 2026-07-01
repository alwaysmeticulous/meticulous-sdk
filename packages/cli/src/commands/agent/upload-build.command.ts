import {
  type ContainerEnvVariable,
  resolveApiTokenWithOAuth,
} from "@alwaysmeticulous/client";
import { logNotice, logProgress } from "@alwaysmeticulous/common";
import { uploadBuild } from "@alwaysmeticulous/remote-replay-launcher";
import type { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { parseContainerEnv } from "../../command-utils/parse-container-env";
import { parseRewrites } from "../../command-utils/parse-rewrites";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";
import { resolveProjectIdentifier } from "../../utils/resolve-project-identifier";
import { resolveBuildCommitSha } from "./build-git-options";
import { detectUploadMode } from "../../command-utils/detect-upload-mode";

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
  const mode = detectUploadMode({ localImageTag, appDirectory, appZip });
  const { commitSha, source: commitShaSource } = await resolveBuildCommitSha({
    commitSha: commitSha_,
    repoDirectory,
  });

  if (dryRun) {
    const what =
      mode === "container"
        ? `container image "${localImageTag}"`
        : `assets from ${appDirectory ?? appZip}`;
    logNotice(
      `Dry run: would upload ${what} and register a deployment for commit ${commitSha}`,
    );
    // Keep stdout machine-readable: emit the result shape (no deployment was
    // registered) so `--json` callers that JSON.parse(stdout) don't crash on an
    // empty short-circuit, mirroring `trigger-test-run`'s dry-run output.
    if (json) {
      console.log(
        JSON.stringify(
          { deploymentId: null, commitSha, commitShaSource },
          null,
          2,
        ),
      );
    }
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
    // The endpoint returns only the deploymentId; commitSha (and how it was
    // resolved) is echoed from here for convenience.
    console.log(
      JSON.stringify(
        { deploymentId: result.deploymentId, commitSha, commitShaSource },
        null,
        2,
      ),
    );
    return;
  }
  // The bare deploymentId is always printed (stdout) so it can be captured or
  // piped. The labelled deploymentId goes through the logger, so it appears with
  // --verbose (the default for `ci`) and is suppressed otherwise (the default
  // for `agent`), leaving just the bare deploymentId. The commitSha line is
  // logged by resolveBuildCommitSha, where its provenance is known.
  logProgress(`deploymentId: ${result.deploymentId}`);
  console.log(result.deploymentId);
};

export const uploadBuildCommand: CommandModule<unknown, Options> = {
  command: "upload-build",
  describe:
    "Upload a build (static assets or a Docker container) and register a reusable deployment, without triggering a test run",
  builder: {
    apiToken: OPTIONS.apiToken,
    commitSha: {
      ...OPTIONS.commitSha,
      description:
        "The commit the build is of. Defaults to the current git HEAD (or an ephemeral commit when the tree is dirty). Cannot be combined with --repoDirectory.",
    },
    repoDirectory: {
      string: true,
      description:
        "Path to a git repository, used to infer --commitSha from HEAD (or an ephemeral commit when dirty). Defaults to the current directory when --commitSha is not given. Cannot be combined with --commitSha.",
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
        ' If no rules are passed, we default to \'{ source: "**", destination: "/index.html" }\'.',
    },
    localImageTag: {
      string: true,
      description:
        "The local Docker image tag to upload, e.g. 'myapp:latest' (container upload mode).",
    },
    containerPort: {
      number: true,
      description:
        "The port to expose the container on (container upload mode).",
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
      description: "Output the result ({ deploymentId, commitSha }) as JSON.",
    },
    dryRun: {
      boolean: true,
      default: false,
      description:
        "Print what would be uploaded and registered, without uploading anything.",
    },
  },
  handler: wrapHandler(handler),
};
