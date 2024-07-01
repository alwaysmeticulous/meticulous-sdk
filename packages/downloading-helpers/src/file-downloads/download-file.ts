import { createWriteStream, existsSync } from "fs";
import { rm } from "fs/promises";
import { Stream, finished } from "stream";
import { promisify } from "util";
import axios from "axios";
import axiosRetry from "axios-retry";
import extract from "extract-zip";

const promisifiedFinished = promisify(finished);

/**
 * Warning: this function is not thread safe. Do not try downloading a file to a path that may already be in use by another process.
 *
 * (for example most downloads are generally done at the test run level rather than the replay level)
 */
export const downloadFile = async (
  fileUrl: string,
  path: string,
  opts: {
    firstDataTimeoutInMs?: number;
    downloadCompleteTimeoutInMs?: number;
    maxDownloadContentRetries?: number;
    downloadContentRetryDelay?: number;
  } = {}
): Promise<void> => {
  // Using the same timeout as the standard client in meticulous-sdk/packages/client/src/client.ts
  const firstDataTimeoutInMs = opts.firstDataTimeoutInMs ?? 60_000;
  const downloadCompleteTimeoutInMs =
    opts.downloadCompleteTimeoutInMs ?? 120_000;
  const maxDownloadContentRetries = opts.maxDownloadContentRetries ?? 3;
  const downloadContentRetryDelay = opts.downloadContentRetryDelay ?? 1000;

  const client = axios.create({ timeout: firstDataTimeoutInMs });
  axiosRetry(client, { retries: 3, shouldResetTimeout: true });
  const source = axios.CancelToken.source();

  const response = await client.request({
    method: "GET",
    url: fileUrl,
    responseType: "stream",
    cancelToken: source.token,
  });

  const writer = createWriteStream(path);
  (response.data as Stream).pipe(writer);
  const timeoutId = setTimeout(async () => {
    const error = `Download timed out after ${downloadCompleteTimeoutInMs}ms`;
    source.cancel(error);
    writer.destroy(new Error(error));
  }, downloadCompleteTimeoutInMs);

  try {
    await promisifiedFinished(writer);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    await new Promise((resolve) => writer.close(resolve));

    if (existsSync(path)) {
      // If we errored at this stage and not earlier then we've likely already written to and corrupted the file,
      // so let's delete it.
      await rm(path);
    }

    if (maxDownloadContentRetries === 0) {
      throw err;
    }

    // Let's try again after a short delay
    await new Promise((resolve) =>
      setTimeout(resolve, downloadContentRetryDelay)
    );
    await downloadFile(fileUrl, path, {
      firstDataTimeoutInMs,
      downloadCompleteTimeoutInMs,
      maxDownloadContentRetries: maxDownloadContentRetries - 1,
    });
  }
};

/**
 * Download a file from a URL and extract it to a directory.
 * The zip file will be deleted after extraction, keeping only the extracted files.
 *
 * Returns a list of the extracted files.
 *
 * Warning: this function is not thread safe. Do not try downloading a file to an extractPath that may already be in use by another process.
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
