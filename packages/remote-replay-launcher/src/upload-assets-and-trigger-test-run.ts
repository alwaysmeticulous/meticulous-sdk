import { createWriteStream, createReadStream, existsSync, fsync } from "fs";
import { stat, unlink } from "fs/promises";
import { IncomingMessage } from "http";
import { request as httpsRequest } from "https";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  completeAssetUpload,
  getApiToken,
  requestAssetUpload,
  createClient,
} from "@alwaysmeticulous/client";
import { METICULOUS_LOGGER_NAME } from "@alwaysmeticulous/common";
import archiver from "archiver";
import log from "loglevel";
import {
  UploadAssetsAndTriggerTestRunOptions,
  ExecuteRemoteTestRunResult,
} from "./types";

export const uploadAssetsAndTriggerTestRun = async ({
  apiToken: apiToken_,
  appDirectory,
  commitSha,
  rewrites,
}: UploadAssetsAndTriggerTestRunOptions): Promise<ExecuteRemoteTestRunResult> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    logger.error(
      "You must provide an API token by using the --apiToken parameter"
    );
    process.exit(1);
  }

  const resolvedAppDirectory = resolve(appDirectory);
  if (!existsSync(resolvedAppDirectory)) {
    throw new Error(`Directory does not exist: ${resolvedAppDirectory}`);
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
    const result = await completeAssetUpload({
      client,
      uploadId,
      commitSha,
      rewrites: rewrites ?? [],
    });
    logger.info(`Deployment assets ${uploadId} marked as uploaded`);
    if (result.testRun) {
      logger.info(`Test run ${result.testRun.id} triggered`);
    }

    return {
      testRun: result.testRun ?? null,
    };
  } finally {
    try {
      await unlink(zipPath);
    } catch (error) {
      logger.warn(`Failed to delete temporary file ${zipPath}: ${error}`);
    }
  }
};

const createZipFromFolder = async (
  folderPath: string,
  archivePath: string
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
    archive.directory(folderPath, false);
    archive.finalize().catch((error) => {
      throw error;
    });
  });
};

const uploadFileToSignedUrl = async (
  filePath: string,
  signedUrl: string,
  expectedFileSize: number
): Promise<void> => {
  const fileStream = createReadStream(filePath);
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const fileStats = await stat(filePath);
  const fileSize = fileStats.size;
  if (fileSize !== expectedFileSize) {
    throw new Error(
      `File size mismatch: expected ${expectedFileSize} bytes, got ${fileSize} bytes`
    );
  }
  logger.info(`Uploading deployment assets (${fileSize} bytes)...`);

  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      signedUrl,
      {
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
      }
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
