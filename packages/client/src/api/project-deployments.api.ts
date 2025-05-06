import { AssetUploadMetadata } from "@alwaysmeticulous/api";
import { AxiosInstance } from "axios";
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
}

export interface CompleteAssetUploadResponse {
  testRun?: TestRun;
}

export interface DownloadDeploymentResponse {
  assetsUrl: string;
  metadataUrl: string;
}

export const requestAssetUpload = async ({
  client,
  ...params
}: RequestAssetUploadParams & {
  client: AxiosInstance;
}): Promise<RequestAssetUploadResponse> => {
  const { data } = await client.post<
    RequestAssetUploadParams,
    { data: RequestAssetUploadResponse }
  >("project-deployments/request-asset-upload", params);
  return data;
};

export const completeAssetUpload = async ({
  client,
  ...params
}: CompleteAssetUploadParams & {
  client: AxiosInstance;
}): Promise<CompleteAssetUploadResponse> => {
  const { data } = await client.post<
    CompleteAssetUploadParams,
    { data: CompleteAssetUploadResponse }
  >("project-deployments/complete-asset-upload-and-maybe-trigger-run", params);
  return data;
};

export const downloadProjectDeployment = async ({
  client,
  deploymentUploadId,
}: {
  client: AxiosInstance;
  deploymentUploadId: string;
}): Promise<DownloadDeploymentResponse> => {
  const { data } = await client.get<
    unknown,
    { data: DownloadDeploymentResponse }
  >(`project-deployments/${deploymentUploadId}`);
  return data;
};
