import { createWriteStream, createReadStream, existsSync, fsync } from "fs";
import { stat, unlink, lstat, readdir, realpath } from "fs/promises";
import { IncomingMessage } from "http";
import { request as httpsRequest } from "https";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { AssetUploadMetadata } from "@alwaysmeticulous/api";
import {
  getApiToken,
  requestAssetUpload,
  createClient,
  completeAssetUpload,
  TestRun,
  getProxyAgent,
} from "@alwaysmeticulous/client";
import { triggerRunOnDeployment } from "@alwaysmeticulous/client/dist/api/project-deployments.api";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import archiver from "archiver";
import log from "loglevel";

const POLL_FOR_BASE_TEST_RUN_INTERVAL_MS = 10_000;
const POLL_FOR_BASE_TEST_RUN_MAX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface UploadAssetsOptions {
  apiToken: string | null | undefined;
  appDirectory: string;
  commitSha: string;
  waitForBase?: boolean;
  rewrites?: AssetUploadMetadata["rewrites"];
  warnIfNoIndexHtml?: boolean;
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
export const uploadAssets = async ({
  apiToken: apiToken_,
  appDirectory,
  commitSha,
  waitForBase = false,
  rewrites = [],
  warnIfNoIndexHtml = false,
  createDeployment = true,
}: UploadAssetsOptions): Promise<UploadAssetsResult> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    logger.error(
      "You must provide an API token by using the --apiToken parameter",
    );
    process.exit(1);
  }

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

  const client = createClient({ apiToken });

  const zipPath = join(tmpdir(), `assets-${Date.now()}.zip`);
  await createZipFromFolder(resolvedAppDirectory, zipPath);
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

      message = result?.message;
      logger.info(`Deployment assets ${uploadId} marked as uploaded`);
    }

    return {
      uploadId,
      testRun,
      ...(message ? { message } : {}),
    };
  } finally {
    try {
      await unlink(zipPath);
    } catch (error) {
      logger.warn(`Failed to delete temporary file ${zipPath}: ${error}`);
    }
  }
};

const walkDirectoryFollowingSymlinks = async (
  dirPath: string,
  visitedPaths = new Set<string>(),
): Promise<Array<{ sourcePath: string; relativePath: string }>> => {
  const resolvedPath = await realpath(dirPath);

  if (visitedPaths.has(resolvedPath)) {
    return [];
  }
  visitedPaths.add(resolvedPath);

  const files: Array<{ sourcePath: string; relativePath: string }> = [];
  const entries = await readdir(dirPath);

  for (const entry of entries) {
    const entryPath = join(dirPath, entry);
    const stats = await lstat(entryPath);

    if (stats.isSymbolicLink()) {
      const targetPath = await realpath(entryPath);
      const targetStats = await stat(targetPath);

      if (targetStats.isFile()) {
        files.push({
          sourcePath: targetPath,
          relativePath: entry,
        });
      } else if (targetStats.isDirectory()) {
        const subFiles = await walkDirectoryFollowingSymlinks(
          entryPath,
          visitedPaths,
        );
        files.push(
          ...subFiles.map((file) => ({
            ...file,
            relativePath: join(entry, file.relativePath),
          })),
        );
      }
    } else if (stats.isFile()) {
      files.push({
        sourcePath: entryPath,
        relativePath: entry,
      });
    } else if (stats.isDirectory()) {
      const subFiles = await walkDirectoryFollowingSymlinks(
        entryPath,
        visitedPaths,
      );
      files.push(
        ...subFiles.map((file) => ({
          ...file,
          relativePath: join(entry, file.relativePath),
        })),
      );
    }
  }

  return files;
};

const createZipFromFolder = async (
  folderPath: string,
  archivePath: string,
): Promise<void> => {
  const fileStream = createWriteStream(archivePath);
  const archive = archiver("zip");

  await new Promise<void>((resolve, reject) => {
    archive.on("error", (err) => reject(err));

    let fd: number | null = null;
    fileStream.on("open", (descriptor) => {
      fd = descriptor;
    });
    fileStream.on("finish", async () => {
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
        resolve();
      } catch (fsyncError) {
        reject(fsyncError);
      }
    });
    archive.pipe(fileStream);
    walkDirectoryFollowingSymlinks(folderPath)
      .then((files) => {
        for (const file of files) {
          archive.file(file.sourcePath, { name: file.relativePath });
        }
        return archive.finalize();
      })
      .catch(reject);
  });
};

const uploadFileToSignedUrl = async (
  filePath: string,
  signedUrl: string,
  expectedFileSize: number,
): Promise<void> => {
  const fileStream = createReadStream(filePath);
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
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
