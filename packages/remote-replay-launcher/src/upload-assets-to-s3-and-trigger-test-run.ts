import { createWriteStream, createReadStream, statSync, unlinkSync } from "fs";
import { IncomingMessage } from "http";
import { request as httpsRequest } from "https";
import { tmpdir } from "os";
import { join } from "path";
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
  UploadAssetsToS3AndTriggerTestRunOptions,
  ExecuteRemoteTestRunResult,
} from "./types";

export const uploadAssetsToS3AndTriggerTestRun = async ({
  apiToken: apiToken_,
  appDirectory,
  commitSha,
  rewrites,
}: UploadAssetsToS3AndTriggerTestRunOptions): Promise<ExecuteRemoteTestRunResult> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);

  const apiToken = getApiToken(apiToken_);
  if (!apiToken) {
    logger.error(
      "You must provide an API token by using the --apiToken parameter"
    );
    process.exit(1);
  }

  const client = createClient({ apiToken });

  const zipPath = join(tmpdir(), `assets-${Date.now()}.zip`);
  await createZipFromFolder(appDirectory, zipPath);

  try {
    const stats = statSync(zipPath);
    const fileSize = stats.size;
    const { uploadId, uploadUrl } = await requestAssetUpload({
      client,
      size: fileSize,
    });
    await uploadFileToSignedUrl(zipPath, uploadUrl);
    const result = await completeAssetUpload({
      client,
      uploadId,
      commitSha,
      rewrites: rewrites ?? [],
    });

    return {
      testRun: result.testRun ?? null,
    };
  } finally {
    try {
      unlinkSync(zipPath);
    } catch {
      // Ignore errors when deleting the temporary file
    }
  }
};

const createZipFromFolder = async (
  folderPath: string,
  archivePath: string
): Promise<void> => {
  const fileStream = createWriteStream(archivePath);
  const archive = archiver("zip");

  await new Promise((resolve, reject) => {
    archive.on("error", (err) => reject(err));
    fileStream.on("close", () => {
      resolve(null);
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
  signedUrl: string
): Promise<void> => {
  const fileStream = createReadStream(filePath);

  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      signedUrl,
      {
        method: "PUT",
        headers: {
          "Content-Length": statSync(filePath).size,
          "Content-Type": "application/zip",
        },
      },
      (response: IncomingMessage) => {
        if (response.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Failed to upload file: ${response.statusCode}`));
        }

        response.on("data", () => {});
        response.on("end", () => {});
      }
    );

    req.on("error", reject);
    fileStream.pipe(req);
  });
};
