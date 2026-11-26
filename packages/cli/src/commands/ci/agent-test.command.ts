import { rm } from "fs/promises";
import type { ContainerEnvVariable } from "@alwaysmeticulous/client";
import { resolveApiTokenWithOAuth } from "@alwaysmeticulous/client";
import { initLogger, routeLogsToStderr } from "@alwaysmeticulous/common";
import { generateSessions } from "@alwaysmeticulous/remote-replay-launcher";
import * as Sentry from "@sentry/node";
import type { CommandModule } from "yargs";
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
import { parseEgressRule } from "./agent-test-egress-rule.utils";
import { AGENT_TEST_OPTIONS } from "./agent-test.options";
import {
  assertPreviewUrlAgentSwarmOptions,
  PREVIEW_URL_SWARM_PROXY_PATHS,
  writePreviewUrlPlaceholderAssets,
} from "./agent-test-preview-url-swarm.utils";
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
  previewUrl?: string | undefined;
  previewUrlAgentSwarm?: boolean | undefined;
  basePreviewUrl?: string | undefined;
  baseSha?: string | undefined;
  uploadSource?: boolean | undefined;
  headTestRunId?: string | undefined;
  backendUrl?: string | undefined;
  backendProxyPaths?: string[] | undefined;
  /** Only meaningful with --localImageTag and --backendUrl. */
  backendUrlEnvVariable?: string | undefined;
  appPort?: number | undefined;
  instructionsFile?: string | undefined;
  egressRule?: string[] | undefined;
  hostRewriteRegex?: string | undefined;
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
  previewUrl,
  previewUrlAgentSwarm,
  basePreviewUrl,
  baseSha,
  uploadSource: uploadSource_,
  headTestRunId,
  backendUrl,
  backendProxyPaths,
  backendUrlEnvVariable,
  appPort,
  instructionsFile,
  egressRule,
  hostRewriteRegex,
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
  const egressRules = egressRule ? egressRule.map(parseEgressRule) : undefined;
  if (previewUrlAgentSwarm) {
    assertPreviewUrlAgentSwarmOptions({
      backendUrl,
      backendProxyPaths,
      conflictingOptionsGiven:
        Boolean(
          previewUrl ||
          basePreviewUrl ||
          deploymentId ||
          localImageTag ||
          backendUrlEnvVariable ||
          containerEnv ||
          containerHealthCheckEndpoint,
        ) ||
        enableLocalMocks != null ||
        appPort != null ||
        containerPort != null,
    });
  }
  if (hostRewriteRegex != null) {
    try {
      new RegExp(hostRewriteRegex);
    } catch (error) {
      throw new CliUserError(
        `Invalid --hostRewriteRegex: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

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
  // A preview-URL launch uploads a placeholder when --assetsDir is left out.
  const targets = [
    localImageTag,
    assetsDir || previewUrlAgentSwarm,
    deploymentId,
    previewUrl,
  ].filter(Boolean);
  if (targets.length !== 1) {
    throw new CliUserError(
      "Provide exactly one of --localImageTag, --assetsDir, --deploymentId or --previewUrl.",
    );
  }

  if (
    previewUrl &&
    (backendUrl ||
      backendProxyPaths ||
      backendUrlEnvVariable ||
      appPort != null ||
      containerPort != null ||
      containerEnv ||
      containerHealthCheckEndpoint ||
      enableLocalMocks != null)
  )
    throw new CliUserError(
      "--previewUrl cannot be combined with backend or container options.",
    );
  if (basePreviewUrl && (!previewUrl || !baseSha))
    throw new CliUserError(
      "--basePreviewUrl requires --previewUrl and --baseSha (the revision served by the base URL).",
    );
  assertValidDeploymentIdArg(deploymentId);
  if (
    deploymentId &&
    (backendUrl ||
      containerPort != null ||
      containerEnv ||
      containerHealthCheckEndpoint ||
      appPort != null)
  ) {
    throw new CliUserError(
      "--deploymentId reuses an uploaded build as it was uploaded: it cannot be combined with --backendUrl, --containerPort, --containerEnv, --containerHealthCheckEndpoint or --appPort.",
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
  const proxyPaths =
    backendProxyPaths ??
    (previewUrlAgentSwarm
      ? PREVIEW_URL_SWARM_PROXY_PATHS
      : assetsDir != null
        ? ["/api"]
        : []);
  if (localImageTag != null && backendUrl != null && proxyPaths.length > 0) {
    logger.warn(
      "--backendProxyPaths with --localImageTag is experimental: the worker " +
        "fronts the container and proxies matching backend paths, and covers no " +
        "server-side (SSR) fetches. If your image can route its backend traffic " +
        "through the injected backend URL env var, that is preferred.",
    );
  }

  const target = previewUrlAgentSwarm
    ? `the live preview at ${backendUrl}`
    : (localImageTag ??
      assetsDir ??
      (previewUrl ? "preview URL" : `deployment ${deploymentId}`));
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
  if (!uploadSource && baseSha && !basePreviewUrl) {
    logger.warn(
      "--baseSha is only used with --uploadSource (or --basePreviewUrl); this project's base comes from its hosting provider.",
    );
  }

  const placeholderAssetsDir =
    assetsDir == null && previewUrlAgentSwarm
      ? await writePreviewUrlPlaceholderAssets()
      : undefined;
  const assetsDirectory = assetsDir ?? placeholderAssetsDir;

  let result: Awaited<ReturnType<typeof generateSessions>>;
  try {
    result = await generateSessions({
      ...(previewUrlAgentSwarm ? { swarmKind: "preview-url" as const } : {}),
      apiToken: apiToken_,
      localImageTag,
      assetsDirectory,
      deploymentId,
      previewUrl,
      ...(basePreviewUrl ? { basePreviewUrl, baseSha } : {}),
      commitSha,
      ...(uploadSource && repoDirectory && baseSha
        ? { sourceSnapshot: { repoDirectory, baseSha } }
        : {}),
      ...(headTestRunId ? { headTestRunId } : {}),
      ...(instructionsFile ? { instructionsFile } : {}),
      ...(egressRules ? { egressRules } : {}),
      ...(hostRewriteRegex == null ? {} : { hostRewriteRegex }),
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
  } finally {
    if (placeholderAssetsDir != null) {
      await rm(placeholderAssetsDir, { recursive: true, force: true });
    }
  }
  const swarmRunId = result.agenticRunId ?? null;
  if (
    previewUrlAgentSwarm &&
    swarmRunId != null &&
    result.swarmKind !== "preview-url"
  ) {
    // An older backend ignores the kind it doesn't know.
    logger.warn(
      "This Meticulous backend launched a regular Agent swarm run: it doesn't support --previewUrlAgentSwarm yet.",
    );
  }
  if (json) {
    printJson({
      swarmRunId,
      ...(result.swarmKind ? { swarmKind: result.swarmKind } : {}),
      commitSha,
      ...(deploymentId ? { deploymentId } : {}),
      ...(previewUrl ? { previewUrl } : {}),
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
  builder: AGENT_TEST_OPTIONS,
  handler: wrapHandler(handler),
};
