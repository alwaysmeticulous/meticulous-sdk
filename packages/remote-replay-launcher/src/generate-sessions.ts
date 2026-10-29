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
import { uploadBuild } from "./upload-build";

export interface GenerateSessionsOptions extends ProjectIdentifier {
  apiToken: string | null | undefined;
  localImageTag?: string | undefined;
  assetsDirectory?: string | undefined;
  commitSha: string;
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
  uploadId: string;
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
  commitSha,
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

  const targetCount = [localImageTag, assetsDirectory].filter(Boolean).length;
  if (targetCount !== 1) {
    throw new Error("Provide exactly one of localImageTag or assetsDirectory.");
  }
  if (appPort != null && localImageTag && !backend?.proxyPaths?.length) {
    throw new Error("appPort with a container requires backend proxy paths.");
  }

  let uploadId: string;
  let imageReference: string | undefined;
  let appTarget: AgenticAppTarget;
  if (localImageTag) {
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
    commitSha,
    ...(instructionsId ? { instructionsId } : {}),
    appTarget,
    ...projectIdentifier,
  });

  Sentry.captureMessage("Agentic session generation triggered", {
    level: "debug",
    extra: {
      uploadId,
      commitSha,
      agenticRunId: result.agenticRunId,
      ...(imageReference ? { imageReference } : {}),
    },
  });

  if (result.message && !result.agenticRunId) {
    logger.info(result.message);
  } else {
    logger.info(
      `Agentic session generation launched. Upload ID: ${uploadId}${
        result.agenticRunId ? `, agentic run: ${result.agenticRunId}` : ""
      }`,
    );
  }

  return {
    uploadId,
    agenticRunId: result.agenticRunId ?? null,
    ...(result.message ? { message: result.message } : {}),
  };
};
