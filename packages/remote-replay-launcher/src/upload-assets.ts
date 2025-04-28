import { createReadStream, createWriteStream, statSync, unlinkSync } from "fs";
import { IncomingMessage } from "http";
import { request as httpsRequest } from "https";
import { tmpdir } from "os";
import { join } from "path";
import { AssetUploadMetadata } from "@alwaysmeticulous/api";
import {
  TestRun,
  requestAssetUpload,
  completeAssetUpload,
} from "@alwaysmeticulous/client";
import archiver from "archiver";
import { AxiosInstance } from "axios";

export interface UploadAssetsToS3Options {
  folder: string;
  client: AxiosInstance;
  commitSha: string;
  rewrites: AssetUploadMetadata["rewrites"];
}

export interface UploadAssetsToS3Result {
  testRun: TestRun | null;
}

export const uploadAssetsToS3 = async ({
  folder,
  client,
  commitSha,
  rewrites,
}: UploadAssetsToS3Options): Promise<UploadAssetsToS3Result> => {
  const zipPath = join(tmpdir(), `assets-${Date.now()}.zip`);
  await createZipFromFolder(folder, zipPath);

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
      rewrites,
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
