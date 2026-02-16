import {
  createWriteStream,
  createReadStream,
  existsSync,
  fsync,
  close,
} from "fs";
import { stat, unlink, lstat, readdir, realpath } from "fs/promises";
import { IncomingMessage } from "http";
import { request as httpsRequest } from "https";
import { join, resolve } from "path";
import { Writable } from "stream";
import { AssetUploadMetadata } from "@alwaysmeticulous/api";
import {
  getApiToken,
  requestAssetUpload,
  createClient,
  completeAssetUpload,
  TestRun,
  getProxyAgent,
  requestMultipartAssetUpload,
  requestUploadPart,
  MultiPartUploadInfo,
} from "@alwaysmeticulous/client";
import { triggerRunOnDeployment } from "@alwaysmeticulous/client/dist/api/project-deployments.api";
import { initLogger } from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import archiver from "archiver";
import pLimit from "p-limit";

const POLL_FOR_BASE_TEST_RUN_INTERVAL_MS = 10_000;
const POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CONCURRENT_UPLOADS = 4; // AWS S3 best practice for multipart uploads
const FS_CONCURRENCY = 10; // Concurrency limit for filesystem operations

/**
 * Similar to Promise.all, but with a limit on the number of concurrent promises.
 */
const allWithLimit = async <I, O>(
  items: I[],
  limit: number,
  handler: (item: I) => Promise<O>,
): Promise<Awaited<O>[]> => {
  const limited = pLimit(limit);
  return Promise.all(items.map((item) => limited(() => handler(item))));
};

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

  const multipartUploadInfo = await streamZipAndUploadMultipart({
    folderPath,
    uploadPartUrls,
    uploadChunkSize,
    awsUploadId,
    uploadId,
    client,
  });

  logger.info(`Deployment assets ${uploadId} uploaded successfully`);

  let testRun: TestRun | null = null;
  let message: string | undefined = undefined;

  const completeAssetUploadArgs = {
    client,
    uploadId,
    commitSha,
    mustHaveBase: waitForBase,
    rewrites,
    createDeployment,
    multipartUploadInfo,
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
    uploadId,
    testRun,
    ...(message ? { message } : {}),
  };
};

interface DirectoryStackEntry {
  absolutePath: string;
  pathInArchive: string;
  ancestors: Set<string>;
}

interface PendingUpload {
  partNumber: number;
  eTag: string;
}

const streamZipAndUploadMultipart = async ({
  folderPath,
  uploadPartUrls,
  uploadChunkSize,
  awsUploadId,
  uploadId,
  client,
}: {
  folderPath: string;
  uploadPartUrls: string[];
  uploadChunkSize: number;
  awsUploadId: string;
  uploadId: string;
  client: ReturnType<typeof createClient>;
}): Promise<MultiPartUploadInfo> => {
  const logger = initLogger();

  const pendingUploads: Promise<PendingUpload>[] = [];
  let currentPartNumber = 1;
  let currentBuffer: Buffer[] = [];
  let currentBufferSize = 0;
  let totalUploadedBytes = 0;
  let preSignedUrlIndex = 0;
  const uploadLimiter = pLimit(MAX_CONCURRENT_UPLOADS);

  const uploadPart = async (
    buffer: Buffer,
    partNumber: number,
    isLastPart: boolean,
  ) => {
    let uploadUrl: string;
    const isFullSizeChunk = buffer.length === uploadChunkSize;

    if (
      isFullSizeChunk &&
      !isLastPart &&
      preSignedUrlIndex < uploadPartUrls.length
    ) {
      uploadUrl = uploadPartUrls[preSignedUrlIndex];
      preSignedUrlIndex++;
    } else {
      const { uploadPartUrl } = await requestUploadPart({
        client,
        uploadId,
        awsUploadId,
        partNumber,
        size: buffer.length,
      });
      uploadUrl = uploadPartUrl;
    }

    const eTag = await uploadBufferToSignedUrl(uploadUrl, buffer);
    totalUploadedBytes += buffer.length;
    logger.info(
      `Uploaded part ${partNumber} (${buffer.length} bytes, ${totalUploadedBytes} total)`,
    );
    return eTag;
  };

  const flushBuffer = async (isLastPart: boolean) => {
    if (currentBuffer.length === 0) {
      return;
    }

    const combinedBuffer = Buffer.concat(currentBuffer);

    if (!isLastPart && combinedBuffer.length < uploadChunkSize) {
      return;
    }

    let bufferToUpload: Buffer;
    let remainingBuffer: Buffer | null = null;

    if (!isLastPart && combinedBuffer.length > uploadChunkSize) {
      bufferToUpload = combinedBuffer.subarray(0, uploadChunkSize);
      remainingBuffer = combinedBuffer.subarray(uploadChunkSize);
    } else {
      bufferToUpload = combinedBuffer;
    }

    const partNumber = currentPartNumber++;
    const uploadPromise = uploadLimiter(() =>
      uploadPart(bufferToUpload, partNumber, isLastPart),
    ).then((eTag) => ({ partNumber, eTag }));
    pendingUploads.push(uploadPromise);

    if (remainingBuffer) {
      currentBuffer = [remainingBuffer];
      currentBufferSize = remainingBuffer.length;
    } else {
      currentBuffer = [];
      currentBufferSize = 0;
    }
  };

  return new Promise<MultiPartUploadInfo>((resolve, reject) => {
    const archive = archiver("zip", {
      zlib: { level: 3 },
    });

    const uploadStream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        currentBuffer.push(chunk);
        currentBufferSize += chunk.length;

        if (currentBufferSize >= uploadChunkSize) {
          flushBuffer(false)
            .then(() => callback())
            .catch(callback);
        } else {
          callback();
        }
      },
      final(callback) {
        flushBuffer(true)
          .then(() => Promise.all(pendingUploads))
          .then((results) => {
            results.sort((a, b) => a.partNumber - b.partNumber);
            const sortedETags = results.map((r) => r.eTag);
            resolve({ awsUploadId, eTags: sortedETags });
            callback();
          })
          .catch((err) => {
            callback(err);
            reject(err);
          });
      },
    });

    archive.on("error", reject);
    uploadStream.on("error", reject);
    archive.pipe(uploadStream);

    const walkAndZip = async () => {
      let fileCount = 0;
      const stack: DirectoryStackEntry[] = [
        {
          absolutePath: await realpath(folderPath),
          pathInArchive: "",
          ancestors: new Set<string>(),
        },
      ];

      while (stack.length > 0) {
        const { absolutePath, pathInArchive, ancestors } = stack.pop()!;
        if (ancestors.has(absolutePath)) {
          continue;
        }

        const newAncestors = new Set([...ancestors, absolutePath]);
        const entries = await readdir(absolutePath);
        const entriesWithStats = await allWithLimit(
          entries,
          FS_CONCURRENCY,
          async (entry) => {
            const entryAbsolutePath = join(absolutePath, entry);
            const entryPathInArchive = join(pathInArchive, entry);
            const entryStats = await lstat(entryAbsolutePath);
            return { entry, entryAbsolutePath, entryPathInArchive, entryStats };
          },
        );

        for (const {
          entryAbsolutePath,
          entryPathInArchive,
          entryStats,
        } of entriesWithStats) {
          if (entryStats.isSymbolicLink()) {
            const targetAbsolutePath = await realpath(entryAbsolutePath);
            const targetStats = await stat(targetAbsolutePath);

            if (targetStats.isFile()) {
              archive.file(targetAbsolutePath, { name: entryPathInArchive });
              fileCount++;
            } else if (
              targetStats.isDirectory() &&
              !newAncestors.has(targetAbsolutePath)
            ) {
              stack.push({
                absolutePath: entryAbsolutePath,
                pathInArchive: entryPathInArchive,
                ancestors: newAncestors,
              });
            }
          } else if (entryStats.isFile()) {
            archive.file(entryAbsolutePath, { name: entryPathInArchive });
            fileCount++;
          } else if (entryStats.isDirectory()) {
            stack.push({
              absolutePath: entryAbsolutePath,
              pathInArchive: entryPathInArchive,
              ancestors: newAncestors,
            });
          }
        }
      }

      logger.info(`Uploading ${fileCount} files...`);
      await archive.finalize();
    };

    walkAndZip().catch(reject);
  });
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

    let testRun: TestRun | null = null;
    let message: string | undefined = undefined;

    const completeAssetUploadArgs = {
      client,
      uploadId,
      commitSha,
      mustHaveBase: waitForBase,
      rewrites,
      createDeployment,
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
        // Log at most once every 30 seconds
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

const walkDirectoryAndAddToArchive = async (
  folderPath: string,
  archive: archiver.Archiver,
): Promise<void> => {
  const stack: Array<DirectoryStackEntry> = [
    {
      absolutePath: await realpath(folderPath),
      pathInArchive: "",
      ancestors: new Set<string>(),
    },
  ];

  while (stack.length > 0) {
    const { absolutePath, pathInArchive, ancestors } = stack.pop()!;
    if (ancestors.has(absolutePath)) {
      continue;
    }

    const newAncestors = new Set([...ancestors, absolutePath]);
    const entries = await readdir(absolutePath);

    const entriesWithStats = await allWithLimit(
      entries,
      FS_CONCURRENCY,
      async (entry) => {
        const entryAbsolutePath = join(absolutePath, entry);
        const entryPathInArchive = join(pathInArchive, entry);
        const entryStats = await lstat(entryAbsolutePath);
        return { entry, entryAbsolutePath, entryPathInArchive, entryStats };
      },
    );

    for (const {
      entryAbsolutePath,
      entryPathInArchive,
      entryStats,
    } of entriesWithStats) {
      if (entryStats.isSymbolicLink()) {
        const targetAbsolutePath = await realpath(entryAbsolutePath);
        const targetStats = await stat(targetAbsolutePath);

        if (targetStats.isFile()) {
          archive.file(targetAbsolutePath, { name: entryPathInArchive });
        } else if (
          targetStats.isDirectory() &&
          !newAncestors.has(targetAbsolutePath)
        ) {
          stack.push({
            absolutePath: entryAbsolutePath,
            pathInArchive: entryPathInArchive,
            ancestors: newAncestors,
          });
        }
      } else if (entryStats.isFile()) {
        archive.file(entryAbsolutePath, { name: entryPathInArchive });
      } else if (entryStats.isDirectory()) {
        stack.push({
          absolutePath: entryAbsolutePath,
          pathInArchive: entryPathInArchive,
          ancestors: newAncestors,
        });
      }
    }
  }
};

export const createZipFromFolder = async (
  folderPath: string,
  archivePath: string,
): Promise<void> => {
  // autoClose: false is required to prevent the file descriptor from being
  // closed before we can fsync it
  const fileStream = createWriteStream(archivePath, { autoClose: false });
  const archive = archiver("zip");

  await new Promise<void>((resolve, reject) => {
    let fd: number | null = null;
    let rejected = false;

    // Helper to close fd and reject, ensuring we only reject once
    const closeAndReject = (err: Error) => {
      if (rejected) return;
      rejected = true;
      if (fd !== null) {
        close(fd, () => reject(err));
      } else {
        reject(err);
      }
    };

    archive.on("error", (err) => closeAndReject(err));

    fileStream.on("error", (err) => closeAndReject(err));

    fileStream.on("open", (descriptor) => {
      fd = descriptor;
    });
    fileStream.on("finish", async () => {
      if (rejected) return;
      try {
        await new Promise<void>((fsyncResolve, fsyncReject) => {
          if (fd !== null) {
            fsync(fd, (err) => {
              if (err) fsyncReject(err);
              else fsyncResolve();
            });
          } else {
            fsyncReject(new Error("File descriptor not found"));
          }
        });
        // Manually close the fd since autoClose is disabled
        // Note: We use fs.close(fd) instead of fileStream.close() because
        // WriteStream.close() doesn't invoke its callback when autoClose is false
        close(fd!, (closeErr) => {
          if (closeErr) reject(closeErr);
          else resolve();
        });
      } catch (fsyncError) {
        if (fd !== null) close(fd, () => {});
        reject(fsyncError);
      }
    });
    archive.pipe(fileStream);
    walkDirectoryAndAddToArchive(folderPath, archive)
      .then(() => archive.finalize())
      .catch(closeAndReject);
  });
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
