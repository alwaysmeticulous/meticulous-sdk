import { readFile } from "fs/promises";
import type {
  AgenticAssetsBackend,
  ContainerEnvVariable,
  ProjectIdentifier,
} from "@alwaysmeticulous/client";
import {
  completeAgenticSessionGeneration,
  agentUploadAssetBuild,
  createClient,
  getApiToken,
  getRegistryAuth,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import type Docker from "dockerode";
import {
  uploadAgenticInstructionsToS3,
  uploadAssetBytesFromDirectory,
} from "./asset-upload-utils";
import { UPLOAD_ARCHIVE_FILE_FORMAT } from "./upload-utils/multipart-compressing-uploader";
import { resolve } from "path";
import {
  getDockerClient,
  getImageInfo,
  pushImage,
  tagImage,
  verifyDockerConnection,
} from "./docker-utils";

export interface GenerateSessionsOptions extends ProjectIdentifier {
  apiToken: string | null | undefined;
  localImageTag?: string | undefined;
  assetsDirectory?: string | undefined;
  assetsUploadId?: string | undefined;
  commitSha: string;
  /** Path to a markdown file with instructions for the agent (login details, accounts, etc). */
  instructionsFile?: string | undefined;
  enableLocalMocks?: boolean | undefined;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
  containerHealthCheckEndpoint?: string | undefined;
  backend?: AgenticAssetsBackend | undefined;
  /**
   * Extra HTTPS origins the agent's browser may call besides the app origin.
   * Only supported with uploaded assets (not `--localImageTag`).
   */
  trustedOrigins?: string[] | undefined;
  /**
   * Port to serve uploaded frontend assets on. Only supported with uploaded
   * assets (not `--localImageTag`). Defaults to 8000 on the worker when omitted.
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
  assetsUploadId: existingAssetsUploadId,
  commitSha,
  instructionsFile,
  enableLocalMocks,
  containerPort,
  containerEnv,
  containerHealthCheckEndpoint,
  backend,
  trustedOrigins,
  appPort,
  projectId,
}: GenerateSessionsOptions): Promise<GenerateSessionsResult> => {
  const logger = initLogger();

  const apiToken = getApiToken(apiToken_);
  const client = createClient({ apiToken });
  const projectIdentifier = projectId ? { projectId } : {};

  const targetCount = [
    localImageTag,
    assetsDirectory,
    existingAssetsUploadId,
  ].filter(Boolean).length;
  if (targetCount !== 1) {
    throw new Error(
      "Provide exactly one of localImageTag, assetsDirectory, or assetsUploadId.",
    );
  }
  if (backend && localImageTag) {
    throw new Error("backend is only supported with uploaded assets.");
  }
  if (trustedOrigins?.length && localImageTag) {
    throw new Error("trustedOrigins is only supported with uploaded assets.");
  }
  if (appPort != null && localImageTag) {
    throw new Error("appPort is only supported with uploaded assets.");
  }

  let uploadId: string;
  let imageReference: string | undefined;
  if (localImageTag) {
    const uploadedContainer = await uploadContainer({
      client,
      localImageTag,
      projectIdentifier,
    });
    uploadId = uploadedContainer.uploadId;
    imageReference = uploadedContainer.imageReference;
  } else if (assetsDirectory) {
    const uploadedAssets = await uploadAssetBytesFromDirectory({
      client,
      folderPath: resolve(assetsDirectory),
      ...projectIdentifier,
    });
    await agentUploadAssetBuild({
      client,
      uploadId: uploadedAssets.uploadId,
      commitSha,
      rewrites: [],
      archiveType: UPLOAD_ARCHIVE_FILE_FORMAT,
      multipartUploadInfo: uploadedAssets.multipartUploadInfo,
      ...(projectId ? { project: projectId } : {}),
    });
    uploadId = uploadedAssets.uploadId;
  } else {
    uploadId = existingAssetsUploadId!;
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
    appTarget: localImageTag
      ? {
          type: "container",
          uploadId,
          enableLocalMocks,
          containerPort,
          containerEnv,
          containerHealthCheckEndpoint,
        }
      : {
          type: "assets",
          assetsUploadId: uploadId,
          ...(backend ? { backend } : {}),
          ...(trustedOrigins?.length ? { trustedOrigins } : {}),
          ...(appPort != null ? { appPort } : {}),
        },
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

const uploadContainer = async ({
  client,
  localImageTag,
  projectIdentifier,
}: {
  client: ReturnType<typeof createClient>;
  localImageTag: string;
  projectIdentifier: ProjectIdentifier;
}): Promise<{ uploadId: string; imageReference: string }> => {
  const logger = initLogger();
  const docker = getDockerClient();

  logger.info("Verifying Docker connection...");
  await verifyDockerConnection(docker);
  const imageInfo = await getImageInfo(docker, localImageTag);
  if (!imageInfo) {
    throw new Error(
      `Docker image '${localImageTag}' not found locally. Please build the image first.`,
    );
  }

  const registryAuth = await getRegistryAuth({
    client,
    ...projectIdentifier,
  });
  const {
    uploadId,
    imageReference,
    registryUrl,
    robotAccountName,
    robotAccountSecret,
  } = registryAuth;
  await tagImage(docker, localImageTag, imageReference);
  const authconfig: Docker.AuthConfig = {
    username: robotAccountName,
    password: robotAccountSecret,
    serveraddress: registryUrl,
  };
  await pushImage(docker, imageReference, authconfig);
  return { uploadId, imageReference };
};
