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
import { MultipartZipUploader } from "./upload-utils/multipart-zip-uploader";

const POLL_FOR_BASE_TEST_RUN_INTERVAL_MS = 10_000;
const POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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

  let testRun: TestRun | null = null;
  let message: string | undefined = undefined;

  const completeAssetUploadArgs = {
    client,
    uploadId,
    commitSha,
    mustHaveBase: waitForBase,
    rewrites,
    createDeployment,
    ...(multipartUploadInfo ? { multipartUploadInfo } : {}),
  };

  const startTime = Date.now();
  let result = await completeAssetUpload(completeAssetUploadArgs);
  testRun = result?.testRun ?? null;
  let baseNotFound = result?.baseNotFound;
  let lastTimeElapsed = 0;

  while (!testRun && baseNotFound) {
    const timeElapsed = Date.now() - startTime;
    if (timeElapsed > POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS) {
      logger.warn(
        `Timed out after ${
          POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS / 1000
        } seconds waiting for test run`,
      );
      break;
    }
    if (lastTimeElapsed == 0 || timeElapsed - lastTimeElapsed >= 30_000) {
      logger.info(
        `Waiting for base test run to be created. Time elapsed: ${timeElapsed}ms`,
      );
      lastTimeElapsed = timeElapsed;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, POLL_FOR_BASE_TEST_RUN_INTERVAL_MS),
    );
    result = await triggerRunOnDeployment(completeAssetUploadArgs);
    testRun = result?.testRun ?? null;
    baseNotFound = result?.baseNotFound;
  }

  if (baseNotFound) {
    logger.info(`Base test run not found, proceeding without it.`);
    testRun =
      (
        await triggerRunOnDeployment({
          ...completeAssetUploadArgs,
          mustHaveBase: false,
        })
      ).testRun ?? null;
  }

  Sentry.captureMessage("Deployment assets marked as uploaded", {
    level: "debug",
    extra: {
      uploadId: uploadId,
      commitSha: commitSha,
      testRunId: testRun?.id,
      baseNotFound: baseNotFound,
    },
  });
  message = result?.message;
  logger.info(`Deployment assets ${uploadId} marked as uploaded`);

  return {
    testRun,
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
  const multipartUploadInfo = await uploader.execute();

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
