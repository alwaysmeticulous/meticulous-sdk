import { createWriteStream } from "fs";
import { mkdtemp, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { constants as zlibConstants } from "zlib";
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
import { DeflateRaw } from "fast-zlib";
import { c as tarCreate } from "tar";

/**
 * Matches the deflate level used by the non-chunked tar.d uploader so the
 * two encoding paths produce comparable artifacts (see
 * `MultipartCompressingUploader`).
 */
const COMPRESSION_LEVEL = 3;

export interface UploadAssetChunkOptions {
  apiToken: string | null | undefined;
  chunkName: string;
  chunkVersionId: string;
  chunkAssetsDirectory: string;
  chunkAssetsDirectoryPrefix?: string | undefined;
  commitSha?: string | undefined;
  /**
   * When true, the server re-issues a presigned URL even if the chunk is
   * already `uploaded`. Use for recovery from corrupted S3 objects.
   */
  force?: boolean;
}

/**
 * Tars `chunkAssetsDirectory` (prepending `chunkAssetsDirectoryPrefix` to
 * each entry's path inside the tar), compresses it with raw deflate (the
 * same encoding the non-chunked tar.d path uses), uploads to S3 via a
 * presigned URL, then marks the chunk as uploaded. The asset server
 * inflates each chunk on demand and serves files through a tar-aware
 * facade — there is no server-side index sidecar.
 */
export const uploadAssetChunk = async ({
  apiToken: apiToken_,
  chunkName,
  chunkVersionId,
  chunkAssetsDirectory,
  chunkAssetsDirectoryPrefix,
  commitSha,
  force,
}: UploadAssetChunkOptions): Promise<void> => {
  const logger = initLogger();

  const resolvedDir = resolve(chunkAssetsDirectory);
  const dirStat = await stat(resolvedDir).catch(() => null);
  if (!dirStat?.isDirectory()) {
    throw new Error(`chunkAssetsDirectory does not exist or is not a directory: ${resolvedDir}`);
  }

  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    throw new Error("You must provide an API token by using the --apiToken parameter");
  }

  const client = createClient({ apiToken });

  const tempDir = await mkdtemp(join(tmpdir(), "asset-chunk-"));
  const tarballPath = join(tempDir, "chunk.tar.d");
  try {
    logger.info(`Building asset chunk tarball for ${chunkName}@${chunkVersionId}...`);
    const { filePaths } = await writeCompressedTar({
      cwd: resolvedDir,
      destination: tarballPath,
      ...(chunkAssetsDirectoryPrefix ? { prefix: chunkAssetsDirectoryPrefix } : {}),
    });

    const { size: tarballSize } = await stat(tarballPath);
    logger.info(`Tarball built (${tarballSize} bytes). Requesting upload URL...`);

    const response = await requestAssetChunkUpload({
      client,
      chunkName,
      chunkVersionId,
      tarballSize,
      ...(commitSha ? { commitSha } : {}),
      ...(force ? { force: true } : {}),
    });

    if (response.alreadyUploaded) {
      logger.info(`Asset chunk ${chunkName}@${chunkVersionId} already uploaded; skipping upload.`);
      return;
    }

    const { tarballUploadUrl, filesIndexUploadUrl, previousStatus } = response;
    switch (previousStatus) {
      case null:
        break;
      case "deleted":
        logger.info(
          `Asset chunk ${chunkName}@${chunkVersionId} was previously deleted by retention policy; re-uploading.`,
        );
        break;
      case "failed_uploading":
        logger.info(
          `Asset chunk ${chunkName}@${chunkVersionId} had a prior failed upload attempt; re-uploading.`,
        );
        break;
      case "pending_upload":
        logger.warn(
          `Asset chunk ${chunkName}@${chunkVersionId} appears to have a concurrent upload in progress; this upload will race.`,
        );
        break;
      case "uploaded":
        logger.warn(
          `Force-overwriting existing asset chunk ${chunkName}@${chunkVersionId}.`,
        );
        break;
    }

    const filesIndexPath = join(tempDir, "files.json");
    await writeFile(filesIndexPath, JSON.stringify(filePaths));
    const { size: filesIndexSize } = await stat(filesIndexPath);

    logger.info(
      `Uploading tarball and files index to S3 (${filePaths.length} files)...`,
    );
    const onRetry = (attempt: number, error: unknown) => {
      const reason =
        error instanceof UploadError
          ? `HTTP ${error.statusCode}`
          : error instanceof Error
            ? error.message
            : String(error);
      logger.warn(
        `Transient upload error on attempt ${attempt} (${reason}); will retry...`,
      );
    };
    await Promise.all([
      retryTransientUploadErrors(
        () =>
          putFileToSignedUrl({
            filePath: tarballPath,
            signedUrl: tarballUploadUrl,
            size: tarballSize,
            contentType: "application/octet-stream",
          }),
        { onRetry },
      ),
      retryTransientUploadErrors(
        () =>
          putFileToSignedUrl({
            filePath: filesIndexPath,
            signedUrl: filesIndexUploadUrl,
            size: filesIndexSize,
            contentType: "application/json",
          }),
        { onRetry },
      ),
    ]);

    logger.info("Finalizing chunk upload...");
    await completeAssetChunkUpload({
      client,
      chunkName,
      chunkVersionId,
      ...(commitSha ? { commitSha } : {}),
    });

    logger.info(`Asset chunk ${chunkName}@${chunkVersionId} uploaded.`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

/**
 * Streams a tar of `cwd` through `DeflateRaw` and writes the compressed
 * bytes to `destination`. Produces the same on-disk format as the
 * non-chunked `tar.d` archives (raw deflate, no zlib header) so the asset
 * server can decompress chunks with the existing
 * `streamDownloadAndInflateTar` helper.
 */
const writeCompressedTar = ({
  cwd,
  destination,
  prefix,
}: {
  cwd: string;
  destination: string;
  prefix?: string;
}): Promise<{ filePaths: string[] }> => {
  return new Promise<{ filePaths: string[] }>((resolvePromise, reject) => {
    const deflate = new DeflateRaw({ level: COMPRESSION_LEVEL });
    const outStream = createWriteStream(destination);
    const filePaths: string[] = [];
    const tarStream = tarCreate(
      {
        cwd,
        portable: true,
        ...(prefix ? { prefix } : {}),
        onWriteEntry(entry) {
          if (entry.type === "File") {
            filePaths.push(entry.path);
          }
        },
      },
      ["."],
    );

    const onError = (err: unknown) => {
      tarStream.removeAllListeners();
      outStream.removeAllListeners();
      outStream.destroy();
      reject(err);
    };

    tarStream.on("data", (chunk: Buffer) => {
      const compressed = deflate.process(chunk);
      if (compressed.length > 0) {
        outStream.write(compressed);
      }
    });
    tarStream.on("error", onError);
    outStream.on("error", onError);
    tarStream.on("end", () => {
      const finalChunk = deflate.process(Buffer.alloc(0), zlibConstants.Z_FINISH);
      if (finalChunk.length > 0) {
        outStream.write(finalChunk);
      }
      outStream.end(() => resolvePromise({ filePaths }));
    });
  });
};
