import { AssetUploadMetadata } from "./asset-upload-metadata";
import { DeploymentArchiveType } from "./deployment-archive-type";

export interface SingleArchiveDownloadResponse {
  kind: "singleArchive";
  assetsUrl: string;
  metadataUrl: string;
  archiveType: DeploymentArchiveType;
}

export interface ChunkedDownloadResponse {
  kind: "chunked";
  /**
   * Presigned tarball download URLs, one per chunk, in manifest order.
   * Order is significant: later chunks override earlier ones on path
   * collision (last-wins), so consumers must preserve it.
   */
  assetChunkTarballUrls: string[];
  metadata: AssetUploadMetadata;
}

export type DownloadDeploymentResponse = SingleArchiveDownloadResponse | ChunkedDownloadResponse;
