import { createWriteStream, renameSync } from "fs";
import { rm } from "fs/promises";
import { finished } from "stream";
import { promisify } from "util";
import axios from "axios";
import axiosRetry from "axios-retry";
import extract from "extract-zip";
import { fileSync } from "tmp";

const promisifiedFinished = promisify(finished);

export const downloadFile: (
  fileUrl: string,
  path: string
) => Promise<void> = async (fileUrl, path) => {
  // Using the same timeout as the standard client in meticulous-sdk/packages/client/src/client.ts
  const client = axios.create({ timeout: 60_000 });
  axiosRetry(client, { retries: 3, shouldResetTimeout: true });

  const tmpFile = fileSync(
    // Create the temporary file in the same directory. This is needed because cloud-replay
    // has the default temporary directory in a different file system which causes the rename
    // below to fail if we don't set this.
    { dir: path.substring(0, path.lastIndexOf("/")) }
  );
  const writer = createWriteStream(tmpFile.name);

  await client
    .request({ method: "GET", url: fileUrl, responseType: "stream" })
    .then(async (response) => {
      response.data.pipe(writer);
      return promisifiedFinished(writer);
    });

  renameSync(tmpFile.name, path);
};

/**
 * Download a file from a URL and extract it to a directory.
 * The zip file will be deleted after extraction, keeping only the extracted files.
 *
 * Returns a list of the extracted files.
 */
export const downloadAndExtractFile: (
  fileUrl: string,
  tmpZipFilePath: string,
  extractPath: string
) => Promise<string[]> = async (fileUrl, filePath, extractPath) => {
  await downloadFile(fileUrl, filePath);
  const entries: string[] = [];

  try {
    await extract(filePath, {
      dir: extractPath,
      onEntry: (entry) => entries.push(entry.fileName),
    });
  } finally {
    await rm(filePath);
  }

  return entries;
};
