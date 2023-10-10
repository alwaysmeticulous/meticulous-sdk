import { createWriteStream } from "fs";
import { rm } from "fs/promises";
import { finished } from "stream";
import { promisify } from "util";
import axios from "axios";
import axiosRetry from "axios-retry";
import extract from "extract-zip";

const promisifiedFinished = promisify(finished);

export const downloadFile: (
  fileUrl: string,
  path: string
) => Promise<void> = async (fileUrl, path) => {
  // Using the same timeout as the standard client in meticulous-sdk/packages/client/src/client.ts
  const client = axios.create({ timeout: 60_000 });
  axiosRetry(client, { retries: 3, shouldResetTimeout: true });

  const writer = createWriteStream(path);

  return client
    .request({ method: "GET", url: fileUrl, responseType: "stream" })
    .then(async (response) => {
      response.data.pipe(writer);
      return promisifiedFinished(writer);
    });
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

  await extract(filePath, {
    dir: extractPath,
    onEntry: (entry) => entries.push(entry.fileName),
  });
  await rm(filePath);

  return entries;
};
