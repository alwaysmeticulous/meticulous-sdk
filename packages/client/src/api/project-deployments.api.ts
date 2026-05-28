import {
  AssetUploadMetadata,
  DeploymentArchiveType,
  DownloadDeploymentResponse,
  type TestRun,
} from "@alwaysmeticulous/api";
import { MeticulousClient } from "../types/client.types";

/**
 * Identifies a project for OAuth callers, whose token does not by itself
 * pin a project. The id is the one returned by `oauth/projects` and
 * persisted via `meticulous auth set-project`. Omitted when authenticating
 * with a project-scoped API token (the token already pins the project).
 */
export interface ProjectIdentifier {
  projectId?: string | undefined;
}

export interface RequestAssetUploadParams extends ProjectIdentifier {
  size: number;
}

export interface RequestAssetUploadResponse {
  uploadId: string;
  uploadUrl: string;
}

export interface RequestMultipartAssetUploadParams extends ProjectIdentifier {
  archiveType: DeploymentArchiveType;
}

export interface RequestMultipartAssetUploadResponse {
  uploadId: string;
  awsUploadId: string;
  uploadPartUrls: string[];
  uploadChunkSize: number;
}

export interface RequestUploadPartParams extends ProjectIdentifier {
  uploadId: string;
  awsUploadId: string;
  size: number;
  partNumber: number;
  archiveType: DeploymentArchiveType;
}

export interface RequestUploadPartResponse {
  uploadPartUrl: string;
}

export interface MultiPartUploadInfo {
  awsUploadId: string;
  eTags: string[];
}

export interface RequestGitDiffUploadParams extends ProjectIdentifier {
  uploadId: string;
  size: number;
}

export interface RequestGitDiffUploadResponse {
  uploadUrl: string;
}

export interface CompleteAssetUploadParams extends ProjectIdentifier {
  uploadId: string;
  commitSha: string;
  baseSha?: string | undefined;
  hasGitDiff?: boolean | undefined;
  withUncommittedChanges?: boolean | undefined;
  rewrites: AssetUploadMetadata["rewrites"];
  mustHaveBase: boolean;
  createDeployment?: boolean;
  multipartUploadInfo?: MultiPartUploadInfo;
}

export interface CompleteAssetUploadResponse {
  testRun?: TestRun;
  baseNotFound?: boolean;
  message?: string;
}

export interface CompleteContainerUploadParams extends ProjectIdentifier {
  uploadId: string;
  commitSha: string;
  baseSha?: string | undefined;
  hasGitDiff?: boolean | undefined;
  withUncommittedChanges?: boolean | undefined;
  mustHaveBase: boolean;
  isUserVisible?: boolean;
  skipPreprocessing?: boolean;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
  containerHealthCheckEndpoint?: string | undefined;
}

export interface CompleteContainerUploadResponse {
  testRun?: TestRun;
  message?: string;
  baseNotFound?: boolean;
}

export interface GetContainerDeploymentResponse {
  digest: string;
  size: number;
  pushedAt: string;
  containerPort?: number;
  containerEnv?: ContainerEnvVariable[];
  containerHealthCheckEndpoint?: string;
}

export interface ContainerEnvVariable {
  name: string;
  value: string;
}

/**
 * Builds a `RequestConfig` that puts `projectId` (if present) into the query
 * string. Every project-deployment endpoint reads `projectId` from
 * `@Query("projectId")` on the backend, not from the body.
 */
const projectIdQuery = (
  projectId: string | undefined,
): { params: { projectId: string } } | undefined =>
  projectId ? { params: { projectId } } : undefined;

export const requestAssetUpload = async ({
  client,
  projectId,
  ...body
}: RequestAssetUploadParams & {
  client: MeticulousClient;
}): Promise<RequestAssetUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: RequestAssetUploadResponse }
  >(
    "project-deployments/request-asset-upload",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const requestMultipartAssetUpload = async ({
  client,
  projectId,
  ...body
}: RequestMultipartAssetUploadParams & {
  client: MeticulousClient;
}): Promise<RequestMultipartAssetUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: RequestMultipartAssetUploadResponse }
  >(
    "project-deployments/request-multipart-asset-upload",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const requestUploadPart = async ({
  client,
  projectId,
  ...body
}: RequestUploadPartParams & {
  client: MeticulousClient;
}): Promise<RequestUploadPartResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: RequestUploadPartResponse }
  >(
    "project-deployments/request-upload-part",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const requestGitDiffUpload = async ({
  client,
  projectId,
  ...body
}: RequestGitDiffUploadParams & {
  client: MeticulousClient;
}): Promise<RequestGitDiffUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: RequestGitDiffUploadResponse }
  >(
    "project-deployments/request-git-diff-upload",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const triggerRunOnDeployment = async ({
  client,
  projectId,
  ...body
}: CompleteAssetUploadParams & {
  client: MeticulousClient;
}): Promise<CompleteAssetUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: CompleteAssetUploadResponse }
  >("project-deployments/trigger-run", body, projectIdQuery(projectId));
  return data;
};

export const completeAssetUpload = async ({
  client,
  projectId,
  ...body
}: CompleteAssetUploadParams & {
  client: MeticulousClient;
}): Promise<CompleteAssetUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: CompleteAssetUploadResponse }
  >(
    "project-deployments/complete-asset-upload-and-maybe-trigger-run",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const completeContainerUpload = async ({
  client,
  projectId,
  ...body
}: CompleteContainerUploadParams & {
  client: MeticulousClient;
}): Promise<CompleteContainerUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: CompleteContainerUploadResponse }
  >(
    "project-deployments/complete-container-upload",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export interface RequestAssetChunkUploadParams {
  chunkName: string;
  chunkVersionId: string;
  tarballSize: number;
  commitSha?: string | undefined;
}

export interface RequestAssetChunkUploadResponse {
  tarballUploadUrl: string;
}

export interface CompleteAssetChunkUploadParams {
  chunkName: string;
  chunkVersionId: string;
  uploadStatus?: "uploading" | "uploaded";
  commitSha?: string | undefined;
}

export interface CompleteAssetChunkUploadResponse {
  message: string;
}

export interface UploadedAssetChunkReference {
  name: string;
  versionId: string;
}

export interface RunWithUploadedAssetChunksParams extends ProjectIdentifier {
  commitSha: string;
  baseSha?: string | undefined;
  hasGitDiff?: boolean | undefined;
  withUncommittedChanges?: boolean | undefined;
  mustHaveBase: boolean;
  isUserVisible?: boolean;
  skipPreprocessing?: boolean;
  createDeployment?: boolean;
  assetReferencesManifest: UploadedAssetChunkReference[];
  rewrites?: AssetUploadMetadata["rewrites"];
}

export const runWithUploadedAssetChunks = async ({
  client,
  projectId,
  ...body
}: RunWithUploadedAssetChunksParams & {
  client: MeticulousClient;
}): Promise<CompleteAssetUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: CompleteAssetUploadResponse }
  >(
    "project-deployments/run-with-uploaded-asset-chunks",
    body,
    projectIdQuery(projectId),
  );
  return data;
};

export const requestAssetChunkUpload = async ({
  client,
  ...body
}: RequestAssetChunkUploadParams & {
  client: MeticulousClient;
}): Promise<RequestAssetChunkUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: RequestAssetChunkUploadResponse }
  >("project-deployments/request-asset-chunk-upload", body);
  return data;
};

export const completeAssetChunkUpload = async ({
  client,
  ...body
}: CompleteAssetChunkUploadParams & {
  client: MeticulousClient;
}): Promise<CompleteAssetChunkUploadResponse> => {
  const { data } = await client.post<
    typeof body,
    { data: CompleteAssetChunkUploadResponse }
  >("project-deployments/complete-asset-chunk-upload", body);
  return data;
};

export const downloadProjectDeployment = async ({
  client,
  deploymentUploadId,
}: {
  client: MeticulousClient;
  deploymentUploadId: string;
}): Promise<DownloadDeploymentResponse> => {
  const { data } = await client.get<
    unknown,
    { data: DownloadDeploymentResponse }
  >(`project-deployments/${deploymentUploadId}`);
  return data;
};

export const getContainerDeployment = async ({
  client,
  deploymentUploadId,
}: {
  client: MeticulousClient;
  deploymentUploadId: string;
}): Promise<GetContainerDeploymentResponse> => {
  const { data } = await client.get<
    unknown,
    { data: GetContainerDeploymentResponse }
  >(`project-deployments/container/${deploymentUploadId}`);
  return data;
};
