import { AssetUploadMetadata } from "@alwaysmeticulous/api";
import { MeticulousClient } from "../types/client.types";
import { TestRun } from "./test-run.api";

export interface RequestAssetUploadParams {
  size: number;
}

export interface RequestAssetUploadResponse {
  uploadId: string;
  uploadUrl: string;
}

export interface CompleteAssetUploadParams {
  uploadId: string;
  commitSha: string;
  rewrites: AssetUploadMetadata["rewrites"];
  mustHaveBase: boolean;
  createDeployment?: boolean;
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
}

export interface CompleteContainerUploadResponse {
  testRun?: TestRun;
  message?: string;
  baseNotFound?: boolean;
}

export interface DownloadDeploymentResponse {
  assetsUrl: string;
  metadataUrl: string;
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
