import { readFile } from "fs/promises";
import type {
  AgenticAppTarget,
  AgenticLiveBackend,
  ContainerEnvVariable,
  ProjectIdentifier,
} from "@alwaysmeticulous/client";
import {
  completeAgenticSessionGeneration,
  createClient,
  getApiToken,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import { uploadAgenticInstructionsToS3 } from "./asset-upload-utils";
import { uploadSourceBundle } from "./source-bundle/upload-source-bundle";
import { uploadBuild } from "./upload-build";

export interface GenerateSessionsOptions extends ProjectIdentifier {
  apiToken: string | null | undefined;
  localImageTag?: string | undefined;
  assetsDirectory?: string | undefined;
  /**
   * A build already uploaded with `agent upload-build`, instead of uploading
   * `localImageTag` or `assetsDirectory` again.
   */
  deploymentId?: string | undefined;
  commitSha: string;
  /**
   * Projects without a hosting provider: upload the source of the change from
   * `baseSha` to `commitSha` in `repoDirectory`, which the run reads its diff
   * and source from.
   */
  sourceSnapshot?: { repoDirectory: string; baseSha: string } | undefined;
  /**
   * Projects without a hosting provider: the session-replay test run of this
   * build, whose base build the run compares against.
   */
  headTestRunId?: string | undefined;
  /** Path to a markdown file with instructions for the agent (login details, accounts, etc). */
  instructionsFile?: string | undefined;
  enableLocalMocks?: boolean | undefined;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
  containerHealthCheckEndpoint?: string | undefined;
  backend?: AgenticLiveBackend | undefined;
  /**
   * Name of the env var the container image reads its backend origin from at
   * runtime. Only meaningful with `localImageTag` and `backend`. Defaults to
   * METICULOUS_BACKEND_URL on the backend.
   */
  backendUrlEnvVariable?: string | undefined;
  /**
   * Loopback app-server port for uploaded assets or fronted containers.
   * Container targets require backend proxyPaths. Defaults to 8000.
   */
  appPort?: number | undefined;
}

export interface GenerateSessionsResult {
  /** Absent when the launch reused an uploaded `deploymentId`. */
  uploadId?: string;
  agenticRunId?: string | null;
  message?: string;
}

/**
 * Uploads the customer's app image (to Harbor) plus an optional markdown
 * instructions file (to S3), then kicks off a dedicated agentic session
 * generation workflow that spins up the app, drives a browser with the
 * Meticulous recorder injected, and produces new sessions to test on the PR.
 */
export const generateSessions = async ({
  apiToken: apiToken_,
  localImageTag,
  assetsDirectory,
  deploymentId,
  commitSha,
  sourceSnapshot,
  headTestRunId,
  instructionsFile,
  enableLocalMocks,
  containerPort,
  containerEnv,
  containerHealthCheckEndpoint,
  backend,
  backendUrlEnvVariable,
  appPort,
  projectId,
}: GenerateSessionsOptions): Promise<GenerateSessionsResult> => {
  const logger = initLogger();

  const apiToken = getApiToken(apiToken_);
  const client = createClient({ apiToken });
  const projectIdentifier = projectId ? { projectId } : {};

  const targetCount = [localImageTag, assetsDirectory, deploymentId].filter(
    Boolean,
  ).length;
  if (targetCount !== 1) {
    throw new Error(
      "Provide exactly one of localImageTag, assetsDirectory or deploymentId.",
    );
  }
  if (appPort != null && localImageTag && !backend?.proxyPaths?.length) {
    throw new Error("appPort with a container requires backend proxy paths.");
  }

  // Before the build, so a commit missing from the checkout fails fast.
  const uploadedSource =
    sourceSnapshot == null
      ? undefined
      : await uploadSourceBundle({
          client,
          repoDirectory: sourceSnapshot.repoDirectory,
          baseSha: sourceSnapshot.baseSha,
          headSha: commitSha,
          ...projectIdentifier,
        });

  let uploadId: string | undefined;
  let imageReference: string | undefined;
  let appTarget: AgenticAppTarget;
  if (deploymentId) {
    appTarget = {
      type: "deployment",
      projectDeploymentId: deploymentId,
      ...(enableLocalMocks == null ? {} : { enableLocalMocks }),
    };
  } else if (localImageTag) {
    const uploadedContainer = await uploadBuild({
      apiToken,
      commitSha,
      localImageTag,
      containerPort,
      containerEnv,
      containerHealthCheckEndpoint,
      ...projectIdentifier,
    });
    uploadId = uploadedContainer.uploadId;
    imageReference = uploadedContainer.imageReference;
    // The deployment row the upload registered: the run is keyed by it. The
    // upload id is dual-written for backends still running the pre-merge
    // launch API, which requires it and knows nothing of the row id.
    // proxyPaths are only sent when the user passed --backendProxyPaths
    // explicitly; the CLI applies the /api default to assets targets
    // only, so a container run defaults to env-var injection.
    appTarget = {
      type: "container",
      projectDeploymentId: uploadedContainer.deploymentId,
      uploadId,
      backend,
      ...(appPort != null ? { appPort } : {}),
      ...(backendUrlEnvVariable ? { backendUrlEnvVariable } : {}),
      enableLocalMocks,
      containerPort,
      containerEnv,
      containerHealthCheckEndpoint,
    };
  } else {
    // The validation above guarantees exactly one target, so this is the
    // assetsDirectory branch.
    const uploadedAssets = await uploadBuild({
      apiToken,
      commitSha,
      appDirectory: assetsDirectory!,
      rewrites: [],
      ...projectIdentifier,
    });
    uploadId = uploadedAssets.uploadId;
    appTarget = {
      type: "assets",
      projectDeploymentId: uploadedAssets.deploymentId,
      // Dual-written for backends still running the pre-merge launch API;
      // see the container branch above.
      assetsUploadId: uploadId,
      backend,
      ...(appPort != null ? { appPort } : {}),
    };
  }

  let instructionsId: string | undefined;
  if (instructionsFile) {
    const instructions = await readFile(instructionsFile, "utf-8");
    if (instructions.trim().length > 0) {
      instructionsId = await uploadAgenticInstructionsToS3({
        client,
        instructions,
        ...projectIdentifier,
      });
    }
  }

  logger.info("Launching agentic session generation workflow...");
  const result = await completeAgenticSessionGeneration({
    client,
    commitSha: uploadedSource?.headSha ?? commitSha,
    ...(instructionsId ? { instructionsId } : {}),
    appTarget,
    ...(uploadedSource == null
      ? {}
      : {
          sourceBundleId: uploadedSource.sourceBundleId,
          baseSha: uploadedSource.baseSha,
        }),
    ...(headTestRunId ? { headTestRunId } : {}),
    ...projectIdentifier,
  });

  Sentry.captureMessage("Agentic session generation triggered", {
    level: "debug",
    extra: {
      uploadId,
      deploymentId,
      commitSha,
      agenticRunId: result.agenticRunId,
      ...(imageReference ? { imageReference } : {}),
    },
  });

  if (result.message && !result.agenticRunId) {
    logger.info(result.message);
  } else {
    logger.info(
      `Agentic session generation launched. ${
        uploadId == null
          ? `Deployment: ${deploymentId}`
          : `Upload ID: ${uploadId}`
      }${result.agenticRunId ? `, agentic run: ${result.agenticRunId}` : ""}`,
    );
  }

  return {
    ...(uploadId == null ? {} : { uploadId }),
    agenticRunId: result.agenticRunId ?? null,
    ...(result.message ? { message: result.message } : {}),
  };
};
