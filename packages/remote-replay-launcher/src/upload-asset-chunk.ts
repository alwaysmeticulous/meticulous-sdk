import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  completeAssetChunkUpload,
  createClient,
  getApiToken,
  putFileToSignedUrl,
  requestAssetChunkUpload,
  retryTransientUploadErrors,
  UploadError,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { c as tarCreate } from "tar";

export interface UploadAssetChunkOptions {
  apiToken: string | null | undefined;
  chunkName: string;
  chunkVersionId: string;
  chunkAssetsDirectory: string;
  chunkAssetsDirectoryPrefix?: string | undefined;
  commitSha?: string | undefined;
}

/**
 * Tars `chunkAssetsDirectory` (prepending `chunkAssetsDirectoryPrefix` to
 * each entry's path inside the tar), uploads the tarball to S3 via a
 * presigned URL, and asks the backend to mark the chunk as uploaded — at
 * which point the backend walks the tar headers to produce the per-chunk
 * index JSON.
 */
export const uploadAssetChunk = async ({
  apiToken: apiToken_,
  chunkName,
  chunkVersionId,
  chunkAssetsDirectory,
  chunkAssetsDirectoryPrefix,
  commitSha,
}: UploadAssetChunkOptions): Promise<void> => {
  const logger = initLogger();

  const resolvedDir = resolve(chunkAssetsDirectory);
  const dirStat = await stat(resolvedDir).catch(() => null);
  if (!dirStat?.isDirectory()) {
    throw new Error(
      `chunkAssetsDirectory does not exist or is not a directory: ${resolvedDir}`,
    );
  }

  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    throw new Error(
      "You must provide an API token by using the --apiToken parameter",
    );
  }

  const client = createClient({ apiToken });

  const tempDir = await mkdtemp(join(tmpdir(), "asset-chunk-"));
  const tarballPath = join(tempDir, "chunk.tar");
  try {
    logger.info(
      `Building asset chunk tarball for ${chunkName}@${chunkVersionId}...`,
    );
    await tarCreate(
      {
        file: tarballPath,
        cwd: resolvedDir,
        portable: true,
        ...(chunkAssetsDirectoryPrefix
          ? { prefix: chunkAssetsDirectoryPrefix }
          : {}),
      },
      ["."],
    );

    const { size: tarballSize } = await stat(tarballPath);
    logger.info(`Tarball built (${tarballSize} bytes). Requesting upload URL...`);

    const { tarballUploadUrl } = await requestAssetChunkUpload({
      client,
      chunkName,
      chunkVersionId,
      tarballSize,
      ...(commitSha ? { commitSha } : {}),
    });

    logger.info("Uploading tarball to S3...");
    await retryTransientUploadErrors(
      () =>
        putFileToSignedUrl({
          filePath: tarballPath,
          signedUrl: tarballUploadUrl,
          size: tarballSize,
          contentType: "application/x-tar",
        }),
      {
        onRetry: (attempt, error) => {
          const reason =
            error instanceof UploadError
              ? `HTTP ${error.statusCode}`
              : error instanceof Error
                ? error.message
                : String(error);
          logger.warn(
            `Transient upload error on attempt ${attempt} (${reason}); will retry...`,
          );
        },
      },
    );

    logger.info("Finalizing chunk upload...");
    await completeAssetChunkUpload({
      client,
      chunkName,
      chunkVersionId,
      uploadStatus: "uploaded",
      ...(commitSha ? { commitSha } : {}),
    });

    logger.info(`Asset chunk ${chunkName}@${chunkVersionId} uploaded.`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};
