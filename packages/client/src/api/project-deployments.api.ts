import { AssetUploadMetadata, DeploymentArchiveType } from "@alwaysmeticulous/api";
import { MeticulousClient } from "../types/client.types";
import { TestRun } from "./test-run.api";

export interface RequestAssetUploadParams {
  size: number;
}

export interface RequestAssetUploadResponse {
  uploadId: string;
  uploadUrl: string;
}

export interface RequestMultipartAssetUploadParams {
  archiveType: DeploymentArchiveType;
}

export interface RequestMultipartAssetUploadResponse {
  uploadId: string;
  awsUploadId: string;
  uploadPartUrls: string[];
  uploadChunkSize: number;
}

export interface RequestUploadPartParams {
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

export interface CompleteAssetUploadParams {
  uploadId: string;
  commitSha: string;
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

export interface CompleteContainerUploadParams {
  uploadId: string;
  commitSha: string;
  mustHaveBase: boolean;
  isUserVisible?: boolean;
  skipPreprocessing?: boolean;
  containerPort?: number | undefined;
  containerEnv?: ContainerEnvVariable[] | undefined;
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
}

export interface ContainerEnvVariable {
  name: string;
  value: string;
}

export interface DownloadDeploymentResponse {
  assetsUrl: string;
  metadataUrl: string;
  archiveType: DeploymentArchiveType;
}

export const requestAssetUpload = async ({
  client,
  ...params
}: RequestAssetUploadParams & {
  client: MeticulousClient;
}): Promise<RequestAssetUploadResponse> => {
  const { data } = await client.post<
    RequestAssetUploadParams,
    { data: RequestAssetUploadResponse }
  >("project-deployments/request-asset-upload", params);
  return data;
};

export const requestMultipartAssetUpload = async ({
  client,
  ...params
}: RequestMultipartAssetUploadParams & {
  client: MeticulousClient;
}): Promise<RequestMultipartAssetUploadResponse> => {
  const { data } = await client.post<
    RequestMultipartAssetUploadParams,
    { data: RequestMultipartAssetUploadResponse }
  >("project-deployments/request-multipart-asset-upload", params);
  return data;
};

export const requestUploadPart = async ({
  client,
  ...params
}: RequestUploadPartParams & {
  client: MeticulousClient;
}): Promise<RequestUploadPartResponse> => {
  const { data } = await client.post<
    RequestUploadPartParams,
    { data: RequestUploadPartResponse }
  >("project-deployments/request-upload-part", params);
  return data;
};

export const triggerRunOnDeployment = async ({
  client,
  ...params
}: CompleteAssetUploadParams & {
  client: MeticulousClient;
}): Promise<CompleteAssetUploadResponse> => {
  const { data } = await client.post<
    CompleteAssetUploadParams,
    { data: CompleteAssetUploadResponse }
  >("project-deployments/trigger-run", params);
  return data;
};

export const completeAssetUpload = async ({
  client,
  ...params
}: CompleteAssetUploadParams & {
  client: MeticulousClient;
}): Promise<CompleteAssetUploadResponse> => {
  const { data } = await client.post<
    CompleteAssetUploadParams,
    { data: CompleteAssetUploadResponse }
  >("project-deployments/complete-asset-upload-and-maybe-trigger-run", params);
  return data;
};

export const completeContainerUpload = async ({
  client,
  ...params
}: CompleteContainerUploadParams & {
  client: MeticulousClient;
}): Promise<CompleteContainerUploadResponse> => {
  const { data } = await client.post<
    CompleteContainerUploadParams,
    { data: CompleteContainerUploadResponse }
  >("project-deployments/complete-container-upload", params);
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
