import axios from "axios";
import axiosRetry from "axios-retry";
import { unzipSingleEntryToJson } from "./unzip-single-entry";

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 60_000;

/**
 * Downloads an archive containing a single JSON entry and parses it without
 * writing anything to disk.
 *
 * Despite the `.gz` filename and `application/gzip` content-type these
 * artifacts are written with, they are really ZIP archives containing one JSON
 * file, so this unzips rather than gunzips — matching how the backend
 * (`AwsS3Service.fetchAndMaybeUnzipS3File`) and `post-processing-utils` read
 * them back.
 */
export const downloadAndUnzipJson = async <T>(
  downloadUrl: string,
  options?: { timeoutMs?: number },
): Promise<T> => {
  const client = axios.create();
  axiosRetry(client, { retries: 3 });

  const response = await client.get<ArrayBuffer>(downloadUrl, {
    responseType: "arraybuffer",
    timeout: options?.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  return unzipSingleEntryToJson<T>(
    new Uint8Array(response.data),
    // Not the URL itself: these are usually presigned, and the name ends up in
    // error messages.
    archiveNameFromUrl(downloadUrl),
  );
};

const archiveNameFromUrl = (downloadUrl: string): string => {
  const path = downloadUrl.split("?")[0];
  return path.slice(path.lastIndexOf("/") + 1) || "downloaded archive";
};
