import { existsSync } from "fs";
import { resolve } from "path";
import type {
  AssetUploadMetadata,
  DeploymentArchiveType,
} from "@alwaysmeticulous/api";
import type {
  AgentUploadBuildResponse,
  ContainerEnvVariable,
  MultiPartUploadInfo,
  ProjectIdentifier,
} from "@alwaysmeticulous/client";
import {
  agentUploadAssetBuild,
  agentUploadContainerBuild,
  createClient,
  getApiToken,
} from "@alwaysmeticulous/client";
import { logProgress } from "@alwaysmeticulous/common";
import {
  uploadAssetBytesFromDirectory,
  uploadAssetBytesFromZip,
} from "./asset-upload-utils";
import { pushContainerImage } from "./upload-container";
import { UPLOAD_ARCHIVE_FILE_FORMAT } from "./upload-utils/multipart-compressing-uploader";

export interface UploadBuildOptions extends ProjectIdentifier {
  apiToken: string | null | undefined;
  /** The commit the build is of — stored on the resulting deployment. */
  commitSha: string;

  // Asset mode (provide one of appDirectory / appZip)
  appDirectory?: string | undefined;
  appZip?: string | undefined;
  rewrites?: AssetUploadMetadata["rewrites"];

  // Container mode
  localImageTag?: string | undefined;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
  containerHealthCheckEndpoint?: string | undefined;
}

/**
 * Uploads a build (static assets or a Docker container, auto-detected from the
 * inputs) and registers a reusable deployment WITHOUT triggering a test run.
 * Returns the `deploymentId` to hand to {@link triggerTestRun}.
 */
export const uploadBuild = async (
  options: UploadBuildOptions,
): Promise<AgentUploadBuildResponse> => {
  // Validate the build inputs here too (not only in the CLI), so direct SDK
  // callers can't silently upload a container when they also passed assets.
  const hasContainer = Boolean(options.localImageTag);
  const hasAssets = Boolean(options.appDirectory || options.appZip);
  if (hasContainer && hasAssets) {
    throw new Error(
      "Provide either a container build (localImageTag) or an asset build " +
        "(appDirectory/appZip), not both.",
    );
  }
  if (!hasContainer && !hasAssets) {
    throw new Error(
      "No build input provided: pass localImageTag, appDirectory, or appZip.",
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
}: UploadBuildOptions): Promise<AgentUploadBuildResponse> => {
  if (!localImageTag) {
    throw new Error("Expected localImageTag for a container build");
  }
  const { client, uploadId } = await pushContainerImage({
    apiToken,
    localImageTag,
    projectId,
  });
  return agentUploadContainerBuild({
    client,
    uploadId,
    commitSha,
    ...(containerPort != null ? { containerPort } : {}),
    ...(containerEnv != null ? { containerEnv } : {}),
    ...(containerHealthCheckEndpoint != null
      ? { containerHealthCheckEndpoint }
      : {}),
    ...(projectId ? { projectId } : {}),
  });
};

const uploadAssetBuild = async ({
  apiToken: apiToken_,
  commitSha,
  appDirectory,
  appZip,
  rewrites,
  projectId,
}: UploadBuildOptions): Promise<AgentUploadBuildResponse> => {
  if (!appDirectory && !appZip) {
    throw new Error(
      "Expected either appDirectory, appZip or localImageTag to be provided",
    );
  }

  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    throw new Error(
      "You must provide an API token by using the --apiToken parameter",
    );
  }
  const client = createClient({ apiToken });

  let uploadId: string;
  let multipartUploadInfo: MultiPartUploadInfo | undefined;
  // The directory path streams a multipart `tar.d`; the zip path uses the
  // single-part legacy upload, which the backend stores under the `zip` key.
  // The archive type must match where the bytes actually landed so the backend
  // reads the right S3 object.
  let archiveType: DeploymentArchiveType;
  if (appDirectory) {
    const folderPath = resolve(appDirectory);
    if (!existsSync(folderPath)) {
      throw new Error(`Directory does not exist: ${folderPath}`);
    }
    ({ uploadId, multipartUploadInfo } = await uploadAssetBytesFromDirectory({
      client,
      folderPath,
      ...(projectId ? { projectId } : {}),
    }));
    archiveType = UPLOAD_ARCHIVE_FILE_FORMAT;
  } else {
    ({ uploadId } = await uploadAssetBytesFromZip({
      client,
      zipPath: appZip as string,
      ...(projectId ? { projectId } : {}),
    }));
    archiveType = "zip";
  }

  return agentUploadAssetBuild({
    client,
    uploadId,
    commitSha,
    rewrites: rewrites ?? [],
    archiveType,
    ...(multipartUploadInfo ? { multipartUploadInfo } : {}),
    ...(projectId ? { projectId } : {}),
  });
};
