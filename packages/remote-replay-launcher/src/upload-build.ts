import { existsSync } from "fs";
import { resolve } from "path";
import { AssetUploadMetadata } from "@alwaysmeticulous/api";
import {
  agentUploadAssetBuild,
  agentUploadContainerBuild,
  AgentUploadBuildResponse,
  ContainerEnvVariable,
  createClient,
  getApiToken,
  ProjectIdentifier,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
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
 * Returns the `deploymentId` to hand to {@link triggerRun}.
 */
export const uploadBuild = async (
  options: UploadBuildOptions,
): Promise<AgentUploadBuildResponse> => {
  const logger = initLogger();

  const result = options.localImageTag
    ? await uploadContainerBuild(options)
    : await uploadAssetBuild(options);

  logger.info(
    `Registered ${result.source} deployment ${result.deploymentId} for commit ${result.commitSha}`,
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
  const logger = initLogger();

  if (!appDirectory && !appZip) {
    throw new Error(
      "Expected either appDirectory, appZip or localImageTag to be provided",
    );
  }

  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    logger.error(
      "You must provide an API token by using the --apiToken parameter",
    );
    process.exit(1);
  }
  const client = createClient({ apiToken });

  let uploadId: string;
  if (appDirectory) {
    const folderPath = resolve(appDirectory);
    if (!existsSync(folderPath)) {
      throw new Error(`Directory does not exist: ${folderPath}`);
    }
    ({ uploadId } = await uploadAssetBytesFromDirectory({
      client,
      folderPath,
      ...(projectId ? { projectId } : {}),
    }));
  } else {
    ({ uploadId } = await uploadAssetBytesFromZip({
      client,
      zipPath: appZip as string,
      ...(projectId ? { projectId } : {}),
    }));
  }

  return agentUploadAssetBuild({
    client,
    uploadId,
    commitSha,
    rewrites: rewrites ?? [],
    archiveType: UPLOAD_ARCHIVE_FILE_FORMAT,
    ...(projectId ? { projectId } : {}),
  });
};
