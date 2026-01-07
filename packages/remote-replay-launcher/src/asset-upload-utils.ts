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
import { initLogger } from "@alwaysmeticulous/common";
import * as Sentry from "@sentry/node";
import archiver from "archiver";

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
  const { appDirectory, warnIfNoIndexHtml } = opts;

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

  const zipPath = join(tmpdir(), `assets-${Date.now()}.zip`);
  await createZipFromFolder(resolvedAppDirectory, zipPath);
  return uploadAssetsFromZip({ ...opts, zipPath, deleteAfterUpload: true });
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

interface DirectoryStackEntry {
  absolutePath: string;
  pathInArchive: string;
  ancestors: Set<string>; // ancestors are always absolute paths
}

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
    for (const entry of entries) {
      const entryAbsolutePath = join(absolutePath, entry);
      const entryPathInArchive = join(pathInArchive, entry);
      const entryStats = await lstat(entryAbsolutePath);

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
      .catch(reject);
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
