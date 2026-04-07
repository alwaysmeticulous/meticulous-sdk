import { createWriteStream, existsSync } from "fs";
import { mkdir, rm } from "fs/promises";
import { Readable, Stream, finished, Transform } from "stream";
import { pipeline } from "stream/promises";
import { promisify } from "util";
import { constants as zlibConstants } from "zlib";
import axios from "axios";
import axiosRetry from "axios-retry";
import cliProgress from "cli-progress";
import extract from "extract-zip";
import { InflateRaw } from "fast-zlib";
import { extract as tarExtract } from "tar";

const promisifiedFinished = promisify(finished);

/**
 * Larger buffer sizes reduce the number of syscalls and context switches
 * in the streaming pipeline, improving throughput for large (>1GB) files.
 */
const STREAMING_HIGH_WATER_MARK = 256 * 1024;

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

const MIN_BYTES_TO_SHOW_PROGRESS_BAR = 10_000;

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

  if (
    shouldShowProgressBar() &&
    contentLength >= MIN_BYTES_TO_SHOW_PROGRESS_BAR
  ) {
    progressBar = new cliProgress.SingleBar(
      {
        format: `Downloading |{bar}| {percentage}% | {downloaded}/{totalSize}`,
        hideCursor: true,
        noTTYOutput: false,
        notTTYSchedule: 5000,
      },
      cliProgress.Presets.shades_classic,
    );
    progressBar.start(contentLength, 0, {
      downloaded: formatBytes(0),
      totalSize: formatBytes(contentLength),
    });
  }

  const progressTransform = new Transform({
    transform(chunk, _encoding, callback) {
      downloadedBytes += chunk.length;
      if (progressBar) {
        progressBar.update(downloadedBytes, {
          downloaded: formatBytes(downloadedBytes),
          totalSize: formatBytes(contentLength),
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
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () =>
          reject(
            new Error(`Zip extraction timed out after ${extractTimeoutInMs}ms`),
          ),
        extractTimeoutInMs,
      );
    });
    try {
      const extractPromise = extract(tmpZipFilePath, {
        dir: extractPath,
        onEntry: (entry) => entries.push(entry.fileName),
      });
      await Promise.race([extractPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  } finally {
    await rm(tmpZipFilePath);
  }

  return entries;
};

export interface StreamDownloadAndExtractTarOptions {
  firstDataTimeoutInMs?: number;
  totalTimeoutInMs?: number;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Streams a raw-deflated tar blob from a URL directly through inflate and
 * tar extraction without writing the archive to disk first.
 *
 * This eliminates the temp file that the legacy `downloadAndExtractTar` used,
 * halving disk I/O and allowing download and extraction to overlap. Uses
 * fast-zlib for decompression and tuned buffer sizes for better throughput
 * on large (>1GB) files.
 *
 * __Warning__: this function is not thread safe. Do not extract to a
 * directory that may already be in use by another process.
 *
 * @param fileUrl The URL of the deflated tar blob to download.
 * @param extractPath The directory to extract tar entries into.
 * @param opts Timeout, retry, and buffer configuration.
 * @returns The list of extracted file paths.
 */
export const streamDownloadAndExtractTar = async (
  fileUrl: string,
  extractPath: string,
  opts: StreamDownloadAndExtractTarOptions = {},
): Promise<string[]> => {
  const firstDataTimeoutInMs = opts.firstDataTimeoutInMs ?? 60_000;
  const totalTimeoutInMs = opts.totalTimeoutInMs ?? 600_000;
  const maxRetries = opts.maxRetries ?? 3;
  const retryDelay = opts.retryDelay ?? 1000;

  for (let attempt = 0; ; attempt++) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort(
        new Error(
          `Streaming download and extraction timed out after ${totalTimeoutInMs}ms`,
        ),
      );
    }, totalTimeoutInMs);

    try {
      const client = axios.create({ timeout: firstDataTimeoutInMs });
      axiosRetry(client, { retries: 3, shouldResetTimeout: true });

      const entries: string[] = [];
      await mkdir(extractPath, { recursive: true });

      const response = await client.request({
        method: "GET",
        url: fileUrl,
        responseType: "stream",
        signal: abortController.signal,
      });

      await pipeline(
        response.data as Readable,
        createFastInflateRawStream(),
        tarExtract({
          cwd: extractPath,
          onReadEntry: (entry) => entries.push(entry.path),
        }),
        { signal: abortController.signal },
      );

      return entries;
    } catch (error) {
      const wasAbortedBeforeCleanup = abortController.signal.aborted;
      const reasonBeforeCleanup = abortController.signal.reason;
      abortController.abort();
      await rm(extractPath, { recursive: true, force: true }).catch(() => {});

      if (attempt >= maxRetries) {
        const errToThrow =
          wasAbortedBeforeCleanup && reasonBeforeCleanup instanceof Error
            ? reasonBeforeCleanup
            : error instanceof Error
              ? error
              : new Error(String(error));
        throw errToThrow;
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    } finally {
      clearTimeout(timeoutId);
    }
  }
};

/**
 * Wraps fast-zlib's synchronous InflateRaw in a Transform stream with
 * a tuned highWaterMark for better large-file throughput.
 *
 * fast-zlib processes chunks synchronously via zlib's _processChunk,
 * avoiding the thread-pool overhead of Node's built-in async zlib streams.
 */
const createFastInflateRawStream = (): Transform => {
  const inflate = new InflateRaw();
  let inflateClosed = false;
  const closeInflateOnce = (): void => {
    if (inflateClosed) {
      return;
    }
    inflateClosed = true;
    inflate.close();
  };
  return new Transform({
    highWaterMark: STREAMING_HIGH_WATER_MARK,
    transform(chunk: Buffer, _encoding: BufferEncoding, callback) {
      try {
        const result = inflate.process(chunk);
        if (result.length > 0) {
          this.push(result);
        }
        callback();
      } catch (err) {
        callback(err as Error);
      }
    },
    flush(callback) {
      try {
        const result = inflate.process(Buffer.alloc(0), zlibConstants.Z_FINISH);
        if (result.length > 0) {
          this.push(result);
        }
        closeInflateOnce();
        callback();
      } catch (err) {
        callback(err as Error);
      }
    },
    destroy(_err, callback) {
      closeInflateOnce();
      callback(_err);
    },
  });
};
