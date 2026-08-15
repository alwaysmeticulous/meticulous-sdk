import { existsSync } from "fs";
import { stat, unlink } from "fs/promises";
import type { IncomingMessage } from "http";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { join, resolve } from "path";
import type {
  AssetUploadMetadata,
  DeploymentArchiveType,
  TestRun,
} from "@alwaysmeticulous/api";
import type {
  ProjectIdentifier,
  MultiPartUploadInfo,
} from "@alwaysmeticulous/client";
import {
  getApiToken,
  requestAssetUpload,
  requestGitDiffUpload,
  requestAgenticInstructionsUpload,
  createClient,
  completeAssetUpload,
  getProxyAgent,
  putFileToSignedUrl,
  requestMultipartAssetUpload,
  UploadError,
  retryTransientUploadErrors,
} from "@alwaysmeticulous/client";
import { triggerRunOnDeployment } from "@alwaysmeticulous/client/dist/api/project-deployments.api";
import { executeWithRetry, initLogger } from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import { pollWhileBaseNotFound } from "./poll-for-base-test-run";
import {
  MultipartCompressingUploader,
  UPLOAD_ARCHIVE_FILE_FORMAT,
} from "./upload-utils/multipart-compressing-uploader";

export interface UploadAssetsOptions extends ProjectIdentifier {
  apiToken: string | null | undefined;
  commitSha: string;
  baseSha?: string | undefined;
  gitDiffOutput?: string | undefined;
  waitForBase?: boolean;
  rewrites?: AssetUploadMetadata["rewrites"];
  createDeployment?: boolean;
}

export interface UploadAssetsResult {
  uploadId: string;
  archiveType: DeploymentArchiveType;
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
  const client = createClient({ apiToken });

  return uploadAssetsStreaming({
    ...opts,
    client,
    folderPath: resolvedAppDirectory,
  });
};

/**
 * Uploads an already-built tar (e.g. read directly out of a Docker image) as
 * a deployment's assets. Same end-to-end flow as {@link uploadAssets}
 * (upload bytes, optionally attach a git diff, complete + wait for base) but
 * for a tar stream instead of a directory on disk.
 */
export const uploadAssetsFromTarStream = async (
  opts: UploadAssetsOptions & { tarStream: NodeJS.ReadableStream },
): Promise<UploadAssetsResult> => {
  const { tarStream, apiToken: apiToken_ } = opts;

  const apiToken = getApiToken(apiToken_);
  const client = createClient({ apiToken });

  const {
    commitSha,
    baseSha,
    gitDiffOutput,
    waitForBase = false,
    rewrites = [],
    createDeployment = true,
    projectId,
  } = opts;

  const { uploadId, multipartUploadInfo } = await uploadAssetBytesFromTarStream(
    {
      client,
      tarStream,
      ...(projectId ? { projectId } : {}),
    },
  );

  if (gitDiffOutput) {
    await uploadGitDiffToS3({
      client,
      uploadId,
      gitDiffOutput,
      ...(projectId ? { projectId } : {}),
    });
  }

  const { testRun, message } = await completeUploadAndWaitForBase({
    client,
    uploadId,
    commitSha,
    baseSha,
    hasGitDiff: !!gitDiffOutput,
    waitForBase,
    rewrites,
    createDeployment,
    archiveType: UPLOAD_ARCHIVE_FILE_FORMAT,
    multipartUploadInfo,
    ...(projectId ? { projectId } : {}),
  });

  return {
    uploadId,
    archiveType: UPLOAD_ARCHIVE_FILE_FORMAT,
    testRun,
    ...(message ? { message } : {}),
  };
};

/**
 * Matches errors where a gateway/proxy in front of the backend gave up
 * waiting for the response (502/503/504). In that case the request very
 * likely kept executing server-side, so retrying the idempotent completion
 * call picks up its committed result rather than duplicating work.
 */
const isGatewayError = (error: unknown): boolean => {
  const status = (error as { response?: { status?: unknown } } | null)?.response
    ?.status;
  return status === 502 || status === 503 || status === 504;
};

const completeUploadAndWaitForBase = async ({
  client,
  uploadId,
  commitSha,
  baseSha,
  hasGitDiff,
  waitForBase,
  rewrites,
  createDeployment,
  archiveType,
  multipartUploadInfo,
  projectId,
}: ProjectIdentifier & {
  client: ReturnType<typeof createClient>;
  uploadId: string;
  commitSha: string;
  baseSha?: string | undefined;
  hasGitDiff?: boolean | undefined;
  waitForBase: boolean;
  rewrites: AssetUploadMetadata["rewrites"];
  createDeployment: boolean;
  archiveType: DeploymentArchiveType;
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
    mustHaveBase: waitForBase,
    rewrites,
    createDeployment,
    archiveType,
    ...(multipartUploadInfo ? { multipartUploadInfo } : {}),
    ...(projectId ? { projectId } : {}),
  };

  // `completeAssetUpload` runs the whole deployment trigger synchronously on
  // the backend, which can outlast the gateway's response timeout: CloudFront
  // returns a 504 after 30s while the backend keeps working and eventually
  // commits the deployment and test run. The client's built-in retries are
  // quick attempts that all fall inside that same window, so they exhaust
  // (~2 minutes) before a slow original has committed. The endpoint is
  // idempotent — a retry that finds the committed deployment returns the
  // existing test run immediately — so on gateway errors we keep retrying on
  // a longer schedule instead of failing a run that very likely succeeded.
  const initialResult = await executeWithRetry(
    () => completeAssetUpload(completeAssetUploadArgs),
    {
      maxRetries: 2,
      retryDelay: 20_000,
      maxRetryDelay: 60_000,
      shouldRetry: isGatewayError,
      logger,
    },
  );
  const { testRun, baseNotFound, message } = await pollWhileBaseNotFound({
    initialResult: {
      testRun: initialResult?.testRun ?? null,
      baseNotFound: initialResult?.baseNotFound,
      extraBasePollTimeoutMs: initialResult?.extraBasePollTimeoutMs,
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

/**
 * Streams a directory's assets to the Meticulous bundle store and returns the
 * `uploadId` + multipart info. This is the "upload the bytes" half of an asset
 * build — it does NOT register a deployment or trigger a run. Shared by the
 * deprecated fused path and the build/trigger split (`uploadBuild`).
 */
export const uploadAssetBytesFromDirectory = async ({
  client,
  folderPath,
  projectId,
}: ProjectIdentifier & {
  client: ReturnType<typeof createClient>;
  folderPath: string;
}): Promise<{ uploadId: string; multipartUploadInfo: MultiPartUploadInfo }> =>
  uploadAssetBytesFromTarSource({ client, folderPath, projectId });

/**
 * Streams an already-built tar (e.g. read directly out of a Docker image) to
 * the Meticulous bundle store and returns the `uploadId` + multipart info.
 * Same wire format as {@link uploadAssetBytesFromDirectory}, but skips ever
 * tarring anything from disk ourselves — the caller supplies the tar bytes.
 */
export const uploadAssetBytesFromTarStream = async ({
  client,
  tarStream,
  projectId,
}: ProjectIdentifier & {
  client: ReturnType<typeof createClient>;
  tarStream: NodeJS.ReadableStream;
}): Promise<{ uploadId: string; multipartUploadInfo: MultiPartUploadInfo }> =>
  uploadAssetBytesFromTarSource({ client, tarStream, projectId });

const uploadAssetBytesFromTarSource = async ({
  client,
  folderPath,
  tarStream,
  projectId,
}: ProjectIdentifier & {
  client: ReturnType<typeof createClient>;
  folderPath?: string | undefined;
  tarStream?: NodeJS.ReadableStream | undefined;
}): Promise<{ uploadId: string; multipartUploadInfo: MultiPartUploadInfo }> => {
  const logger = initLogger();

  const { uploadId, awsUploadId, uploadPartUrls, uploadChunkSize } =
    await requestMultipartAssetUpload({
      client,
      archiveType: UPLOAD_ARCHIVE_FILE_FORMAT,
      ...(projectId ? { projectId } : {}),
    });

  logger.info(`Starting streaming upload for deployment ${uploadId}`);

  const uploader = new MultipartCompressingUploader({
    ...(folderPath ? { folderPath } : {}),
    ...(tarStream ? { tarStream } : {}),
    uploadPartUrls,
    uploadChunkSize,
    awsUploadId,
    uploadId,
    client,
    uploadBufferToSignedUrl,
    ...(projectId ? { projectId } : {}),
  });
  const multipartUploadInfo = await uploader.execute();

  logger.info(`Deployment assets ${uploadId} uploaded successfully`);

  return { uploadId, multipartUploadInfo };
};

const uploadAssetsStreaming = async ({
  client,
  folderPath,
  commitSha,
  baseSha,
  gitDiffOutput,
  waitForBase = false,
  rewrites = [],
  createDeployment = true,
  projectId,
}: UploadAssetsOptions & {
  client: ReturnType<typeof createClient>;
  folderPath: string;
}): Promise<UploadAssetsResult> => {
  const { uploadId, multipartUploadInfo } = await uploadAssetBytesFromDirectory(
    {
      client,
      folderPath,
      ...(projectId ? { projectId } : {}),
    },
  );

  if (gitDiffOutput) {
    await uploadGitDiffToS3({
      client,
      uploadId,
      gitDiffOutput,
      ...(projectId ? { projectId } : {}),
    });
  }

  const { testRun, message } = await completeUploadAndWaitForBase({
    client,
    uploadId,
    commitSha,
    baseSha,
    hasGitDiff: !!gitDiffOutput,
    waitForBase,
    rewrites,
    createDeployment,
    archiveType: UPLOAD_ARCHIVE_FILE_FORMAT,
    multipartUploadInfo,
    ...(projectId ? { projectId } : {}),
  });

  return {
    uploadId,
    archiveType: UPLOAD_ARCHIVE_FILE_FORMAT,
    testRun,
    ...(message ? { message } : {}),
  };
};

export const uploadBufferToSignedUrl = async (
  signedUrl: string,
  buffer: Buffer,
  options?: { contentType?: string },
): Promise<string> => {
  return retryTransientUploadErrors(
    () => putBufferToSignedUrl(signedUrl, buffer, options),
    { onRetry: logTransientUploadRetry },
  );
};

const logTransientUploadRetry = (attempt: number, error: unknown): void => {
  const logger = initLogger();
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

    const requestFn = signedUrl.startsWith("https:")
      ? httpsRequest
      : httpRequest;
    const req = requestFn(
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
            reject(new UploadError(response.statusCode ?? 0, responseData));
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
  projectId,
}: ProjectIdentifier & {
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
    ...(projectId ? { projectId } : {}),
  });

  await uploadBufferToSignedUrl(uploadUrl, buffer, {
    contentType: "text/plain",
  });

  logger.info("Git diff uploaded to S3 successfully");
};

export const uploadAgenticInstructionsToS3 = async ({
  client,
  instructions,
  projectId,
}: ProjectIdentifier & {
  client: ReturnType<typeof createClient>;
  instructions: string;
}): Promise<string> => {
  const logger = initLogger();
  const buffer = Buffer.from(instructions, "utf-8");

  logger.info(`Uploading agent instructions to S3 (${buffer.length} bytes)...`);

  const { uploadUrl, instructionsId } = await requestAgenticInstructionsUpload({
    client,
    size: buffer.length,
    ...(projectId ? { projectId } : {}),
  });

  await uploadBufferToSignedUrl(uploadUrl, buffer, {
    contentType: "text/markdown",
  });

  logger.info("Agent instructions uploaded to S3 successfully");
  return instructionsId;
};

/**
 * Uploads a zip of assets to the Meticulous bundle store and returns the
 * `uploadId`. The "upload the bytes" half of a zip asset build — does NOT
 * register a deployment or trigger a run.
 */
export const uploadAssetBytesFromZip = async ({
  client,
  zipPath,
  projectId,
}: ProjectIdentifier & {
  client: ReturnType<typeof createClient>;
  zipPath: string;
}): Promise<{ uploadId: string }> => {
  const logger = initLogger();
  const fileStats = await stat(zipPath);
  const fileSize = fileStats.size;
  const { uploadId, uploadUrl } = await requestAssetUpload({
    client,
    size: fileSize,
    ...(projectId ? { projectId } : {}),
  });
  await uploadFileToSignedUrl(zipPath, uploadUrl, fileSize);
  logger.info(`Deployment assets ${uploadId} uploaded successfully`);
  return { uploadId };
};

export const uploadAssetsFromZip = async ({
  apiToken: apiToken_,
  zipPath,
  commitSha,
  baseSha,
  gitDiffOutput,
  waitForBase = false,
  rewrites = [],
  createDeployment = true,
  deleteAfterUpload = false,
  projectId,
}: UploadAssetsOptions & {
  zipPath: string;
  deleteAfterUpload?: boolean;
}): Promise<UploadAssetsResult> => {
  const logger = initLogger();

  const apiToken = getApiToken(apiToken_);
  const client = createClient({ apiToken });

  const projectIdentifier = projectId ? { projectId } : {};

  try {
    const { uploadId } = await uploadAssetBytesFromZip({
      client,
      zipPath,
      ...projectIdentifier,
    });

    if (gitDiffOutput) {
      await uploadGitDiffToS3({
        client,
        uploadId,
        gitDiffOutput,
        ...projectIdentifier,
      });
    }

    const { testRun, message } = await completeUploadAndWaitForBase({
      client,
      uploadId,
      commitSha,
      baseSha,
      hasGitDiff: !!gitDiffOutput,
      waitForBase,
      rewrites,
      createDeployment,
      archiveType: "zip",
      ...projectIdentifier,
    });

    return {
      uploadId,
      archiveType: "zip",
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

  await retryTransientUploadErrors(
    () =>
      putFileToSignedUrl({
        filePath,
        signedUrl,
        size: fileSize,
        contentType: "application/zip",
      }),
    { onRetry: logTransientUploadRetry },
  );
  logger.info("Successfully uploaded deployment assets");
};
