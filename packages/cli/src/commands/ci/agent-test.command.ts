import type { ContainerEnvVariable } from "@alwaysmeticulous/client";
import { resolveApiTokenWithOAuth } from "@alwaysmeticulous/client";
import { initLogger, routeLogsToStderr } from "@alwaysmeticulous/common";
import { generateSessions } from "@alwaysmeticulous/remote-replay-launcher";
import * as Sentry from "@sentry/node";
import type { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";
import { CliUserError } from "../../utils/cli-user-error";
import { resolveProjectIdentifier } from "../../utils/resolve-project-identifier";
import { assertValidDeploymentIdArg } from "../agent/trigger-test-run.command";
import { printJson } from "../../command-utils/print-json";
import {
  resolveCheckedOutCommit,
  resolveUploadSource,
} from "./agent-test-source.utils";
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
  deploymentId?: string | undefined;
  baseSha?: string | undefined;
  uploadSource?: boolean | undefined;
  headTestRunId?: string | undefined;
  backendUrl?: string | undefined;
  backendProxyPaths?: string[] | undefined;
  /** Only meaningful with --localImageTag and --backendUrl. */
  backendUrlEnvVariable?: string | undefined;
  appPort?: number | undefined;
  instructionsFile?: string | undefined;
  enableLocalMocks?: boolean | undefined;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
  containerHealthCheckEndpoint?: string | undefined;
  dryRun?: boolean;
  json?: boolean;
}

const handler = async ({
  apiToken,
  commitSha: commitSha_,
  repoDirectory,
  localImageTag,
  assetsDir,
  deploymentId,
  baseSha,
  uploadSource: uploadSource_,
  headTestRunId,
  backendUrl,
  backendProxyPaths,
  backendUrlEnvVariable,
  appPort,
  instructionsFile,
  enableLocalMocks,
  containerPort,
  containerEnv,
  containerHealthCheckEndpoint,
  dryRun,
  json,
}: Options): Promise<void> => {
  if (json) {
    routeLogsToStderr();
  }
  const logger = initLogger();

  // With both, --repoDirectory is the checkout the source is read from and
  // --commitSha names the head, which that checkout must have checked out.
  const { commitSha } =
    commitSha_ && repoDirectory
      ? {
          commitSha: await resolveCheckedOutCommit({
            repoDirectory,
            commitSha: commitSha_,
          }),
        }
      : await resolveGitOptions({
          commitSha: commitSha_,
          baseSha: undefined,
          gitDiffOutput: undefined,
          repoDirectory,
        });
  const targets = [localImageTag, assetsDir, deploymentId].filter(Boolean);
  if (targets.length !== 1) {
    throw new CliUserError(
      "Provide exactly one of --localImageTag, --assetsDir or --deploymentId.",
    );
  }
  assertValidDeploymentIdArg(deploymentId);
  if (deploymentId && (backendUrl || containerPort != null || containerEnv)) {
    throw new CliUserError(
      "--deploymentId reuses an uploaded build as it was uploaded: it cannot be combined with --backendUrl, --containerPort or --containerEnv.",
    );
  }
  if (uploadSource_ === true && (!repoDirectory || !baseSha)) {
    throw new CliUserError(
      "--uploadSource requires --repoDirectory and --baseSha.",
    );
  }
  if (enableLocalMocks && backendUrl) {
    throw new Error("--enableLocalMocks cannot be combined with --backendUrl.");
  }
  if (
    appPort != null &&
    localImageTag &&
    (!backendUrl || !backendProxyPaths?.length)
  ) {
    throw new Error(
      "--appPort with a container requires --backendUrl and --backendProxyPaths.",
    );
  }
  if (backendUrlEnvVariable && assetsDir) {
    throw new Error(
      "--backendUrlEnvVariable is only supported with --localImageTag.",
    );
  }
  // The /api default moves from the yargs option into the handler so a
  // container target defaults to env-var-only injection; an explicit
  // --backendProxyPaths opts into the same-origin fronting proxy.
  const proxyPaths = backendProxyPaths ?? (assetsDir != null ? ["/api"] : []);
  if (localImageTag != null && backendUrl != null && proxyPaths.length > 0) {
    logger.warn(
      "--backendProxyPaths with --localImageTag is experimental: the worker " +
        "fronts the container and proxies matching backend paths, and covers no " +
        "server-side (SSR) fetches. If your image can route its backend traffic " +
        "through the injected backend URL env var, that is preferred.",
    );
  }

  const target = localImageTag ?? assetsDir ?? `deployment ${deploymentId}`;
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
      backendUrl,
      appPort,
      enableLocalMocks,
    },
  });

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const projectIdentifier = await resolveProjectIdentifier(apiToken_);
  const uploadSource = await resolveUploadSource({
    uploadSource: uploadSource_,
    apiToken: apiToken_,
    projectId: projectIdentifier.projectId,
  });
  if (uploadSource && (!repoDirectory || !baseSha)) {
    throw new CliUserError(
      "This project has no connected GitHub, GitLab or Bitbucket repository, so Agent swarm reads the change from source you upload: pass --repoDirectory and --baseSha (or --no-uploadSource to launch without source access, which fails).",
    );
  }
  if (!uploadSource && baseSha) {
    logger.warn(
      "--baseSha is only used with --uploadSource; this project's base comes from its hosting provider.",
    );
  }

  let result: Awaited<ReturnType<typeof generateSessions>>;
  try {
    result = await generateSessions({
      apiToken: apiToken_,
      localImageTag,
      assetsDirectory: assetsDir,
      deploymentId,
      commitSha,
      ...(uploadSource && repoDirectory && baseSha
        ? { sourceSnapshot: { repoDirectory, baseSha } }
        : {}),
      ...(headTestRunId ? { headTestRunId } : {}),
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
              proxyPaths,
            },
          }
        : {}),
      ...(backendUrlEnvVariable ? { backendUrlEnvVariable } : {}),
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
  const swarmRunId = result.agenticRunId ?? null;
  if (json) {
    printJson({
      swarmRunId,
      commitSha,
      ...(deploymentId ? { deploymentId } : {}),
      ...(result.uploadId ? { uploadId: result.uploadId } : {}),
      ...(result.message ? { message: result.message } : {}),
    });
    return;
  }
  if (swarmRunId != null) {
    // A stable line for scripts to parse; the rest is for people.
    console.log(`Agent swarm run: ${swarmRunId}`);
    logger.info(
      `Get its results with: meticulous agent agent-swarm-run --swarmRunId ${swarmRunId}` +
        ` (and each case's with: meticulous agent agent-swarm-run-case --swarmRunId ${swarmRunId} --caseIndex <n>)`,
    );
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
        "The path to a git repository (or worktree). Infers --commitSha from the repo when --commitSha is not given. " +
        "With --uploadSource, the checkout the source of --baseSha..--commitSha is packaged from.",
    },
    deploymentId: {
      string: true,
      description:
        "A build already uploaded with `meticulous agent upload-build` (the deploymentId it printed), instead of uploading --assetsDir or --localImageTag again.",
    },
    baseSha: {
      string: true,
      description:
        "With --uploadSource: the commit the change is diffed against, e.g. the merged pull request's base.",
    },
    uploadSource: {
      boolean: true,
      description:
        "Upload the source of --baseSha..--commitSha from --repoDirectory (as a git bundle of the two trees, without history) so Agent swarm can read the diff and code. " +
        "Defaults to on for projects with no connected GitHub, GitLab or Bitbucket repository, which have no other source. Only committed changes are uploaded.",
    },
    headTestRunId: {
      string: true,
      description:
        "Projects without a hosting provider: the session-replay test run of this build, so Agent swarm compares against that run's base build.",
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
    backendUrl: {
      string: true,
      description:
        "HTTPS staging backend URL. Login credentials and options are read from METICULOUS_STAGING_* environment variables and forwarded to the project's configured login flow: " +
        "METICULOUS_STAGING_USERNAME and METICULOUS_STAGING_PASSWORD, plus flow-specific values such as METICULOUS_STAGING_TOTP_SECRET (base32 TOTP seed) or METICULOUS_STAGING_SKIP_EMAIL_CLIENT_ID (trusted-automation id that bypasses an email verification challenge).",
    },
    backendProxyPaths: {
      array: true,
      string: true,
      description:
        "Same-origin path prefixes to reverse proxy to the staging backend. " +
        "Defaults to /api for uploaded assets; with a container, passing it " +
        "opts into the worker's same-origin fronting proxy (experimental).",
    },
    backendUrlEnvVariable: {
      string: true,
      description:
        "With --localImageTag and --backendUrl: the name of the env var the " +
        "container image reads its backend origin from at runtime. Defaults " +
        "to METICULOUS_BACKEND_URL.",
    },
    appPort: {
      number: true,
      description:
        "Loopback app-server port for uploaded assets or containers with --backendProxyPaths. Defaults to 8000 on the worker. " +
        "The run fails if the port is unavailable — there is no fallback — so staging " +
        "CORS allowlists can pin http://localhost:<port>. Container targets require --backendUrl and --backendProxyPaths.",
    },
    instructionsFile: {
      string: true,
      description:
        "Path to a markdown file that overrides the agent instructions in " +
        ".meticulous/agent-swarm-instructions.md at --commitSha (e.g. routes and accounts to use).",
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
    json: {
      boolean: true,
      description:
        "Print the result as JSON on stdout: swarmRunId (null when the launch was skipped or deferred, with the reason in message), commitSha, and the deploymentId or uploadId. " +
        "Without it, a launched run prints a line 'Agent swarm run: <id>'.",
    },
  },
  handler: wrapHandler(handler),
};
