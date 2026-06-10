import { AssetUploadMetadata } from "./asset-upload-metadata";
import { DeploymentArchiveType } from "./deployment-archive-type";

export interface DownloadedAssetChunk {
  name: string;
  versionId: string;
  tarballUrl: string;
  indexUrl: string;
}

export interface SingleArchiveDownloadResponse {
  kind: "singleArchive";
  assetsUrl: string;
  metadataUrl: string;
  archiveType: DeploymentArchiveType;
}

export interface ChunkedDownloadResponse {
  kind: "chunked";
  assetChunks: DownloadedAssetChunk[];
  metadata: AssetUploadMetadata;
}

export type DownloadDeploymentResponse =
  | SingleArchiveDownloadResponse
  | ChunkedDownloadResponse;
