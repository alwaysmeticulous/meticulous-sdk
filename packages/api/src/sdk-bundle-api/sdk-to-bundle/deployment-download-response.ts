import type { AssetUploadMetadata } from "./asset-upload-metadata";
import type { DeploymentArchiveType } from "./deployment-archive-type";

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
  /**
   * Presigned download URLs for each chunk's `files.json` (the paths its
   * tarball holds), at the same index as `assetChunkTarballUrls`. Only present
   * when the download was requested with `includeChunkFilesIndex`.
   */
  assetChunkFilesIndexUrls?: string[];
  /**
   * Each chunk's name, at the same index as `assetChunkTarballUrls`. A name
   * identifies the same chunk across deployments, unlike its index or URL.
   */
  assetChunkNames?: string[];
  metadata: AssetUploadMetadata;
}

export type DownloadDeploymentResponse =
  | SingleArchiveDownloadResponse
  | ChunkedDownloadResponse;
