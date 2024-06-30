import axios from "axios";
import axiosRetry from "axios-retry";
import extract from "extract-zip";
import { createWriteStream, existsSync } from "fs";
import { rm } from "fs/promises";
import { Stream, finished } from "stream";
import { promisify } from "util";

const promisifiedFinished = promisify(finished);

export const downloadFile = async (
  fileUrl: string,
  path: string,
  { firstDataTimeoutInMs, downloadCompleteTimeoutInMs } = {
    firstDataTimeoutInMs: 60_000,
    downloadCompleteTimeoutInMs: 120_000,
  }
): Promise<void> => {
  // Using the same timeout as the standard client in meticulous-sdk/packages/client/src/client.ts
  const client = axios.create({ timeout: firstDataTimeoutInMs });
  axiosRetry(client, { retries: 3, shouldResetTimeout: true });
  const source = axios.CancelToken.source();

  const writer = createWriteStream(path);

  const response = await client.request({
    method: "GET",
    url: fileUrl,
    responseType: "stream",
    cancelToken: source.token,
  });

  (response.data as Stream).pipe(writer);
  let timeoutId: NodeJS.Timeout;
  const timeout = new Promise<void>((_, reject) => {
    timeoutId = setTimeout(async () => {
      const error = new Error(
        `Download timed out after ${downloadCompleteTimeoutInMs}ms`
      );
      source.cancel("Download timeout");
      response.data.destroy(error);
      if (existsSync(path)) {
        await rm(path);
      }
      reject(error);
    }, downloadCompleteTimeoutInMs);
  });

  await Promise.race([
    promisifiedFinished(writer)
      .then(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      })
      .catch(async (err) => {
        await new Promise((resolve) => writer.close(resolve));
        throw err;
      }),
    timeout,
  ]);
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
