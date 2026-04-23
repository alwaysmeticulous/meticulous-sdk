import { createReadStream, existsSync } from "fs";
import { stat, unlink } from "fs/promises";
import { IncomingMessage } from "http";
import { request as httpsRequest } from "https";
import { join, resolve } from "path";
import { AssetUploadMetadata, TestRun } from "@alwaysmeticulous/api";
import {
  getApiToken,
  requestAssetUpload,
  requestGitDiffUpload,
  createClient,
  completeAssetUpload,
  getProxyAgent,
  requestMultipartAssetUpload,
  MultiPartUploadInfo,
} from "@alwaysmeticulous/client";
import { triggerRunOnDeployment } from "@alwaysmeticulous/client/dist/api/project-deployments.api";
import { initLogger } from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import { pollWhileBaseNotFound } from "./poll-for-base-test-run";
import { MultipartCompressingUploader, UPLOAD_ARCHIVE_FILE_FORMAT } from "./upload-utils/multipart-compressing-uploader";
import {
  S3UploadError,
  retryTransientS3Errors,
} from "./upload-utils/retry-transient-s3-errors";

export interface UploadAssetsOptions {
  apiToken: string | null | undefined;
  commitSha: string;
  baseSha?: string | undefined;
  gitDiffOutput?: string | undefined;
  withUncommittedChanges?: boolean | undefined;
  waitForBase?: boolean;
  rewrites?: AssetUploadMetadata["rewrites"];
  createDeployment?: boolean;
}

export interface UploadAssetsResult {
  uploadId: string;
  testRun?: TestRun | null;
  message?: string;
}

/**
 * Uploads assets from a directory and returns the upload ID and client for further operations
 */
export const uploadAssets = async (
  opts: UploadAssetsOptions & {
    appDirectory: string;
    warnIfNoIndexHtml?: boolean;
  },
): Promise<UploadAssetsResult> => {
  const logger = initLogger();
  const { appDirectory, warnIfNoIndexHtml, apiToken: apiToken_ } = opts;

  const resolvedAppDirectory = resolve(appDirectory);
  if (!existsSync(resolvedAppDirectory)) {
    throw new Error(`Directory does not exist: ${resolvedAppDirectory}`);
  }

  if (warnIfNoIndexHtml) {
    const indexHtmlPath = join(resolvedAppDirectory, "index.html");
    if (!existsSync(indexHtmlPath)) {
      logger.warn(
        `Warning: No index.html found in the app directory (${resolvedAppDirectory}). ` +
        `This may indicate that your build output is not properly configured for static hosting, unless you expect that the root url is invalid. ` +
        `If you're using Next.js or another framework that requires server-side rendering, ` +
        `you should use the \`cloud-compute\` GitHub Action or the \`run-all-tests-in-cloud\` command instead.`,
      );
    }
  }

  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    logger.error(
      "You must provide an API token by using the --apiToken parameter",
    );
    process.exit(1);
  }

  const client = createClient({ apiToken });

  return uploadAssetsStreaming({
    ...opts,
    client,
    folderPath: resolvedAppDirectory,
  });
};

const completeUploadAndWaitForBase = async ({
  client,
  uploadId,
  commitSha,
  baseSha,
  hasGitDiff,
  withUncommittedChanges,
  waitForBase,
  rewrites,
  createDeployment,
  multipartUploadInfo,
}: {
  client: ReturnType<typeof createClient>;
  uploadId: string;
  commitSha: string;
  baseSha?: string | undefined;
  hasGitDiff?: boolean | undefined;
  withUncommittedChanges?: boolean | undefined;
  waitForBase: boolean;
  rewrites: AssetUploadMetadata["rewrites"];
  createDeployment: boolean;
  multipartUploadInfo?: MultiPartUploadInfo;
}): Promise<{
  testRun: TestRun | null;
  message?: string;
}> => {
  const logger = initLogger();

  const completeAssetUploadArgs = {
    client,
    uploadId,
    commitSha,
    ...(baseSha ? { baseSha } : {}),
    ...(hasGitDiff ? { hasGitDiff } : {}),
    ...(withUncommittedChanges ? { withUncommittedChanges } : {}),
    mustHaveBase: waitForBase,
    rewrites,
    createDeployment,
    archiveType: UPLOAD_ARCHIVE_FILE_FORMAT,
    ...(multipartUploadInfo ? { multipartUploadInfo } : {}),
  };

  const initialResult = await completeAssetUpload(completeAssetUploadArgs);
  const { testRun, baseNotFound, message } = await pollWhileBaseNotFound({
    initialResult: {
      testRun: initialResult?.testRun ?? null,
      baseNotFound: initialResult?.baseNotFound,
      message: initialResult?.message,
    },
    retryFn: () => triggerRunOnDeployment(completeAssetUploadArgs),
    fallbackFn: () =>
      triggerRunOnDeployment({
        ...completeAssetUploadArgs,
        mustHaveBase: false,
      }),
  });

  Sentry.captureMessage("Deployment assets marked as uploaded", {
    level: "debug",
    extra: {
      uploadId: uploadId,
      commitSha: commitSha,
      testRunId: testRun?.id,
      baseNotFound: baseNotFound,
    },
  });
  logger.info(`Deployment assets ${uploadId} marked as uploaded`);

  return {
    testRun: testRun ?? null,
    ...(message ? { message } : {}),
  };
};

const uploadAssetsStreaming = async ({
  client,
  folderPath,
  commitSha,
  baseSha,
  gitDiffOutput,
  withUncommittedChanges,
  waitForBase = false,
  rewrites = [],
  createDeployment = true,
}: UploadAssetsOptions & {
  client: ReturnType<typeof createClient>;
  folderPath: string;
}): Promise<UploadAssetsResult> => {
  const logger = initLogger();

  const { uploadId, awsUploadId, uploadPartUrls, uploadChunkSize } =
    await requestMultipartAssetUpload({ client, archiveType: UPLOAD_ARCHIVE_FILE_FORMAT });

  logger.info(`Starting streaming upload for deployment ${uploadId}`);

  const uploader = new MultipartCompressingUploader({
    folderPath,
    uploadPartUrls,
    uploadChunkSize,
    awsUploadId,
    uploadId,
    client,
    uploadBufferToSignedUrl,
  });
  const multipartUploadInfo = await uploader.execute();

  logger.info(`Deployment assets ${uploadId} uploaded successfully`);

  if (gitDiffOutput) {
    await uploadGitDiffToS3({ client, uploadId, gitDiffOutput });
  }

  const { testRun, message } = await completeUploadAndWaitForBase({
    client,
    uploadId,
    commitSha,
    baseSha,
    hasGitDiff: !!gitDiffOutput,
    withUncommittedChanges,
    waitForBase,
    rewrites,
    createDeployment,
    multipartUploadInfo,
  });

  return {
    uploadId,
    testRun,
    ...(message ? { message } : {}),
  };
};

const uploadBufferToSignedUrl = async (
  signedUrl: string,
  buffer: Buffer,
  options?: { contentType?: string },
): Promise<string> => {
  const logger = initLogger();
  return retryTransientS3Errors(
    () => putBufferToSignedUrl(signedUrl, buffer, options),
    {
      onRetry: (attempt, error) => {
        const reason =
          error instanceof S3UploadError
            ? `HTTP ${error.statusCode}`
            : error instanceof Error
              ? error.message
              : String(error);
        logger.warn(
          `Transient S3 upload error (${reason}); retrying (attempt ${attempt + 1})...`,
        );
      },
    },
  );
};

const putBufferToSignedUrl = async (
  signedUrl: string,
  buffer: Buffer,
  options?: { contentType?: string },
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {
      "Content-Length": buffer.length,
    };
    if (options?.contentType) {
      headers["Content-Type"] = options.contentType;
    }

    const req = httpsRequest(
      signedUrl,
      {
        agent: getProxyAgent(),
        method: "PUT",
        headers,
      },
      (response: IncomingMessage) => {
        let responseData = "";

        response.on("data", (chunk) => {
          responseData += chunk;
        });

        response.on("end", () => {
          if (response.statusCode === 200) {
            resolve(response.headers["etag"] ?? "");
          } else {
            reject(
              new S3UploadError(response.statusCode ?? 0, responseData),
            );
          }
        });
      },
    );

    req.on("error", (error) => {
      reject(error);
    });

    req.write(buffer);
    req.end();
  });
};

export const uploadGitDiffToS3 = async ({
  client,
  uploadId,
  gitDiffOutput,
}: {
  client: ReturnType<typeof createClient>;
  uploadId: string;
  gitDiffOutput: string;
}): Promise<void> => {
  const logger = initLogger();
  const buffer = Buffer.from(gitDiffOutput, "utf-8");

  logger.info(`Uploading git diff to S3 (${buffer.length} bytes)...`);

  const { uploadUrl } = await requestGitDiffUpload({
    client,
    uploadId,
    size: buffer.length,
  });

  await uploadBufferToSignedUrl(uploadUrl, buffer, {
    contentType: "text/plain",
  });

  logger.info("Git diff uploaded to S3 successfully");
};

export const uploadAssetsFromZip = async ({
  apiToken: apiToken_,
  zipPath,
  commitSha,
  baseSha,
  gitDiffOutput,
  withUncommittedChanges,
  waitForBase = false,
  rewrites = [],
  createDeployment = true,
  deleteAfterUpload = false,
}: UploadAssetsOptions & {
  zipPath: string;
  deleteAfterUpload?: boolean;
}): Promise<UploadAssetsResult> => {
  const logger = initLogger();

  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    logger.error(
      "You must provide an API token by using the --apiToken parameter",
    );
    process.exit(1);
  }

  const client = createClient({ apiToken });

  try {
    const fileStats = await stat(zipPath);
    const fileSize = fileStats.size;
    const { uploadId, uploadUrl } = await requestAssetUpload({
      client,
      size: fileSize,
    });
    await uploadFileToSignedUrl(zipPath, uploadUrl, fileSize);
    logger.info(`Deployment assets ${uploadId} uploaded successfully`);

    if (gitDiffOutput) {
      await uploadGitDiffToS3({ client, uploadId, gitDiffOutput });
    }

    const { testRun, message } = await completeUploadAndWaitForBase({
      client,
      uploadId,
      commitSha,
      baseSha,
      hasGitDiff: !!gitDiffOutput,
      withUncommittedChanges,
      waitForBase,
      rewrites,
      createDeployment,
    });

    return {
      uploadId,
      testRun,
      ...(message ? { message } : {}),
    };
  } finally {
    if (deleteAfterUpload) {
      try {
        await unlink(zipPath);
      } catch (error) {
        logger.warn(`Failed to delete temporary file ${zipPath}: ${error}`);
      }
    }
  }
};

const uploadFileToSignedUrl = async (
  filePath: string,
  signedUrl: string,
  expectedFileSize: number,
): Promise<void> => {
  const logger = initLogger();
  const fileStats = await stat(filePath);
  const fileSize = fileStats.size;
  if (fileSize !== expectedFileSize) {
    throw new Error(
      `File size mismatch: expected ${expectedFileSize} bytes, got ${fileSize} bytes`,
    );
  }
  logger.info(`Uploading deployment assets (${fileSize} bytes)...`);

  await retryTransientS3Errors(
    () => putFileToSignedUrl(filePath, signedUrl, fileSize),
    {
      onRetry: (attempt, error) => {
        const reason =
          error instanceof S3UploadError
            ? `HTTP ${error.statusCode}`
            : error instanceof Error
              ? error.message
              : String(error);
        logger.warn(
          `Transient S3 upload error (${reason}); retrying (attempt ${attempt + 1})...`,
        );
      },
    },
  );
  logger.info("Successfully uploaded deployment assets");
};

const putFileToSignedUrl = async (
  filePath: string,
  signedUrl: string,
  fileSize: number,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    // A new read stream is required on every attempt — streams cannot be replayed.
    const fileStream = createReadStream(filePath);
    const req = httpsRequest(
      signedUrl,
      {
        agent: getProxyAgent(),
        method: "PUT",
        headers: {
          "Content-Length": fileSize,
          "Content-Type": "application/zip",
        },
      },
      (response: IncomingMessage) => {
        let responseData = "";

        response.on("data", (chunk) => {
          responseData += chunk;
        });

        response.on("end", () => {
          if (response.statusCode === 200) {
            resolve();
          } else {
            reject(
              new S3UploadError(response.statusCode ?? 0, responseData),
            );
          }
        });
      },
    );

    req.on("error", (error) => {
      reject(error);
    });

    fileStream.on("error", (error) => {
      req.destroy(error);
      reject(error);
    });

    fileStream.pipe(req);
  });
};
