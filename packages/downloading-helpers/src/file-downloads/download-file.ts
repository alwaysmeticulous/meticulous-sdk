import { createWriteStream, existsSync } from "fs";
import { rm } from "fs/promises";
import { Stream, finished, Transform } from "stream";
import { promisify } from "util";
import axios from "axios";
import axiosRetry from "axios-retry";
import cliProgress from "cli-progress";
import extract from "extract-zip";

const promisifiedFinished = promisify(finished);

const shouldShowProgressBar = (): boolean => {
  return process.env.METICULOUS_IS_CLOUD_REPLAY !== "true";
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) {
    return "0 B";
  }
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

interface DownloadFileOptions {
  firstDataTimeoutInMs?: number;
  downloadCompleteTimeoutInMs?: number;
  maxDownloadContentRetries?: number;
  downloadContentRetryDelay?: number;
}

/**
 * Warning: this function is not thread safe. Do not try downloading a file to a path that may already be in use by another process.
 *
 * (for example most downloads are generally done at the test run level rather than the replay level)
 */
export const downloadFile = async (
  fileUrl: string,
  path: string,
  opts: DownloadFileOptions = {},
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

  const contentLength = parseInt(response.headers["content-length"] ?? "0", 10);

  let progressBar: cliProgress.SingleBar | null = null;
  let downloadedBytes = 0;

  if (shouldShowProgressBar() && contentLength > 0) {
    progressBar = new cliProgress.SingleBar(
      {
        format: `Downloading |{bar}| {percentage}% | {downloaded}/{total}`,
        hideCursor: true,
        noTTYOutput: true,
        notTTYSchedule: 5000,
      },
      cliProgress.Presets.shades_classic,
    );
    progressBar.start(contentLength, 0, {
      downloaded: formatBytes(0),
      total: formatBytes(contentLength),
    });
  }

  const progressTransform = new Transform({
    transform(chunk, _encoding, callback) {
      downloadedBytes += chunk.length;
      if (progressBar) {
        progressBar.update(downloadedBytes, {
          downloaded: formatBytes(downloadedBytes),
          total: formatBytes(contentLength),
        });
      }
      callback(null, chunk);
    },
  });

  const writer = createWriteStream(path);
  (response.data as Stream).pipe(progressTransform).pipe(writer);
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
    progressBar?.stop();
  } catch (err) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    progressBar?.stop();

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
      setTimeout(resolve, downloadContentRetryDelay),
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
 * __Warning__: this function is not thread safe.
 *
 * @param fileUrl The URL of the file to download.
 * @param tmpZipFilePath The path to save the downloaded file. Do not try downloading a file to a
 * `tmpZipFilePath` that may already be in use by another process b/c this can corrupt the data.
 * @param extractPath The path to a directory which we will extract files from a gzip into.
 * Do not try extracting to a dir that may already be in use by another process b/c overlapping
 * file names can cause data corruption.
 * @param extractTimeoutInMs The timeout for the zip extraction, in milliseconds.
 * @returns The list of the extracted files.
 */
export const downloadAndExtractFile: (
  fileUrl: string,
  tmpZipFilePath: string,
  extractPath: string,
  extractTimeoutInMs?: number,
) => Promise<string[]> = async (
  fileUrl,
  tmpZipFilePath,
  extractPath,
  extractTimeoutInMs = 300_000,
) => {
  await downloadFile(fileUrl, tmpZipFilePath);
  const entries: string[] = [];

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`Zip extraction timed out after ${extractTimeoutInMs}ms`),
          ),
        extractTimeoutInMs,
      ),
    );
    const extractPromise = extract(tmpZipFilePath, {
      dir: extractPath,
      onEntry: (entry) => entries.push(entry.fileName),
    });
    await Promise.race([extractPromise, timeoutPromise]);
  } finally {
    await rm(tmpZipFilePath);
  }

  return entries;
};
