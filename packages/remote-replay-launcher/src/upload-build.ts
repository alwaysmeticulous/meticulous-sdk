import { stat } from "fs/promises";
import { resolve } from "path";
import type { AssetUploadMetadata } from "@alwaysmeticulous/api";
import type {
  AgentUploadBuildResponse,
  ContainerEnvVariable,
  ProjectIdentifier,
} from "@alwaysmeticulous/client";
import {
  agentUploadAssetBuild,
  agentUploadContainerBuild,
  createClient,
  getApiToken,
} from "@alwaysmeticulous/client";
import { logProgress } from "@alwaysmeticulous/common";
import { uploadAssetBytesFromDirectory } from "./asset-upload-utils";
import { pushContainerImage } from "./upload-container";
import { UPLOAD_ARCHIVE_FILE_FORMAT } from "./upload-utils/multipart-compressing-uploader";

export interface UploadBuildOptions extends ProjectIdentifier {
  apiToken: string | null | undefined;
  /** The commit the build is of — stored on the resulting deployment. */
  commitSha: string;

  // Asset mode
  appDirectory?: string | undefined;
  rewrites?: AssetUploadMetadata["rewrites"];

  // Container mode
  localImageTag?: string | undefined;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
  containerHealthCheckEndpoint?: string | undefined;
}

export interface UploadBuildResult extends AgentUploadBuildResponse {
  uploadId: string;
  imageReference?: string;
}

/**
 * Uploads a build (static assets or a Docker container, auto-detected from the
 * inputs) and registers an ephemeral deployment WITHOUT triggering a test run.
 * Returns the `deploymentId` to hand to {@link triggerTestRun}; local uploads
 * are not discoverable later by commit SHA. Also returns the upload ID for
 * callers that need to reference the uploaded app.
 */
export const uploadBuild = async (
  options: UploadBuildOptions,
): Promise<UploadBuildResult> => {
  // Validate the build inputs here too (not only in the CLI), so direct SDK
  // callers can't silently upload a container when they also passed assets.
  // `appZip` is not on the type. A caller that still passes it would otherwise
  // upload a container and ignore the zip.
  if ("appZip" in options) {
    throw new Error(
      "appZip is no longer supported; pass the build output directory as appDirectory.",
    );
  }
  const hasContainer = Boolean(options.localImageTag);
  const hasAssets = Boolean(options.appDirectory);
  if (hasContainer && hasAssets) {
    throw new Error(
      "Provide either a container build (localImageTag) or an asset build " +
        "(appDirectory), not both.",
    );
  }
  if (!hasContainer && !hasAssets) {
    throw new Error(
      "No build input provided: pass localImageTag or appDirectory.",
    );
  }

  const source = hasContainer ? "container" : "asset";
  const result = hasContainer
    ? await uploadContainerBuild(options)
    : await uploadAssetBuild(options);

  logProgress(
    `Registered ${source} deployment ${result.deploymentId} for commit ${options.commitSha}`,
  );
  return result;
};

const uploadContainerBuild = async ({
  apiToken,
  commitSha,
  localImageTag,
  containerPort,
  containerEnv,
  containerHealthCheckEndpoint,
  projectId,
}: UploadBuildOptions): Promise<UploadBuildResult> => {
  if (!localImageTag) {
    throw new Error("Expected localImageTag for a container build");
  }
  const { client, uploadId, imageReference } = await pushContainerImage({
    apiToken,
    localImageTag,
    projectId,
  });
  const deployment = await agentUploadContainerBuild({
    client,
    uploadId,
    commitSha,
    ...(containerPort != null ? { containerPort } : {}),
    ...(containerEnv != null ? { containerEnv } : {}),
    ...(containerHealthCheckEndpoint != null
      ? { containerHealthCheckEndpoint }
      : {}),
    // `agentUploadContainerBuild` (agent namespace) takes the flexible
    // `project` override, unlike the project-deployment calls above.
    ...(projectId ? { project: projectId } : {}),
  });
  return { ...deployment, uploadId, imageReference };
};

const uploadAssetBuild = async ({
  apiToken: apiToken_,
  commitSha,
  appDirectory,
  rewrites,
  projectId,
}: UploadBuildOptions): Promise<UploadBuildResult> => {
  if (!appDirectory) {
    throw new Error(
      "Expected either appDirectory or localImageTag to be provided",
    );
  }

  const folderPath = resolve(appDirectory);
  await assertAppDirectory(folderPath);

  const apiToken = getApiToken(apiToken_);
  const client = createClient({ apiToken });
  const { uploadId, multipartUploadInfo } = await uploadAssetBytesFromDirectory(
    {
      client,
      folderPath,
      ...(projectId ? { projectId } : {}),
    },
  );

  const deployment = await agentUploadAssetBuild({
    client,
    uploadId,
    commitSha,
    rewrites: rewrites ?? [],
    archiveType: UPLOAD_ARCHIVE_FILE_FORMAT,
    multipartUploadInfo,
    // `agentUploadAssetBuild` (agent namespace) takes the flexible `project`
    // override, unlike the project-deployment calls above.
    ...(projectId ? { project: projectId } : {}),
  });
  return { ...deployment, uploadId };
};

const assertAppDirectory = async (folderPath: string): Promise<void> => {
  let folderStat;
  try {
    folderStat = await stat(folderPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`Directory does not exist: ${folderPath}`);
    }
    throw error;
  }
  if (!folderStat.isDirectory()) {
    throw new Error(
      `${folderPath} is not a directory. Pass the build output directory as appDirectory.`,
    );
  }
};
