import { createReadStream, existsSync } from "fs";
import { stat, unlink } from "fs/promises";
import { IncomingMessage } from "http";
import { request as httpsRequest } from "https";
import { join, resolve } from "path";
import { AssetUploadMetadata } from "@alwaysmeticulous/api";
import {
  getApiToken,
  requestAssetUpload,
  createClient,
  completeAssetUpload,
  TestRun,
  getProxyAgent,
  requestMultipartAssetUpload,
  MultiPartUploadInfo,
} from "@alwaysmeticulous/client";
import { triggerRunOnDeployment } from "@alwaysmeticulous/client/dist/api/project-deployments.api";
import { initLogger } from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import { pollWhileBaseNotFound } from "./poll-for-base-test-run";
import { MultipartZipUploader } from "./upload-utils/multipart-zip-uploader";

export interface UploadAssetsOptions {
  apiToken: string | null | undefined;
  commitSha: string;
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
  waitForBase,
  rewrites,
  createDeployment,
  multipartUploadInfo,
}: {
  client: ReturnType<typeof createClient>;
  uploadId: string;
  commitSha: string;
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
    mustHaveBase: waitForBase,
    rewrites,
    createDeployment,
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
  waitForBase = false,
  rewrites = [],
  createDeployment = true,
}: UploadAssetsOptions & {
  client: ReturnType<typeof createClient>;
  folderPath: string;
}): Promise<UploadAssetsResult> => {
  const logger = initLogger();

  const { uploadId, awsUploadId, uploadPartUrls, uploadChunkSize } =
    await requestMultipartAssetUpload({ client });

  logger.info(`Starting streaming upload for deployment ${uploadId}`);

  const uploader = new MultipartZipUploader({
    folderPath,
    uploadPartUrls,
    uploadChunkSize,
    awsUploadId,
    uploadId,
    client,
    uploadBufferToSignedUrl,
  });

  logger.info(`Deployment assets ${uploadId} uploaded successfully`);


  const { testRun, message } = await completeUploadAndWaitForBase({
    client,
    uploadId,
    commitSha,
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
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      signedUrl,
      {
        agent: getProxyAgent(),
        method: "PUT",
        headers: {
          "Content-Length": buffer.length,
        },
      },
      (response: IncomingMessage) => {
        let responseData = "";

        response.on("data", (chunk) => {
          responseData += chunk;
        });

        response.on("end", () => {
          if (response.statusCode === 200) {
            const eTag = response.headers["etag"];
            if (!eTag) {
              reject(new Error("No ETag returned from S3"));
              return;
            }
            resolve(eTag);
          } else {
            const errorMessage = `Failed to upload part!\nStatus ${response.statusCode}.\nResponse:\n${responseData}`;
            reject(new Error(errorMessage));
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

export const uploadAssetsFromZip = async ({
  apiToken: apiToken_,
  zipPath,
  commitSha,
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

    const { testRun, message } = await completeUploadAndWaitForBase({
      client,
      uploadId,
      commitSha,
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
  const fileStream = createReadStream(filePath);
  const logger = initLogger();
  const fileStats = await stat(filePath);
  const fileSize = fileStats.size;
  if (fileSize !== expectedFileSize) {
    throw new Error(
      `File size mismatch: expected ${expectedFileSize} bytes, got ${fileSize} bytes`,
    );
  }
  logger.info(`Uploading deployment assets (${fileSize} bytes)...`);

  return new Promise((resolve, reject) => {
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
            logger.info("Successfully uploaded deployment assets");
            resolve();
          } else {
            const errorMessage = `Failed to upload assets!\nSigned URL: ${signedUrl}\nStatus ${response.statusCode}.\nResponse:\n${responseData}`;
            logger.error(errorMessage);
            reject(new Error(errorMessage));
          }
        });
      },
    );

    req.on("error", (error) => {
      logger.error(`Upload request error: ${error.message}`);
      reject(error);
    });

    fileStream.on("error", (error) => {
      logger.error(`File stream error: ${error.message}`);
      req.destroy(error);
      reject(error);
    });

    fileStream.pipe(req);
  });
};
