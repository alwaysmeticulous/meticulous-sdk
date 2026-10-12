import axios from "axios";
import axiosRetry, { exponentialDelay } from "axios-retry";
import { unzipSingleEntry, unzipSingleEntryToJson } from "./unzip-single-entry";

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
  options?: {
    timeoutMs?: number;
    /**
     * Parses the unzipped bytes. Defaults to a UTF-8 decode + `JSON.parse`,
     * which throws `ERR_STRING_TOO_LONG` once the JSON exceeds V8's ~512MiB
     * string cap; pass a buffer-level parser for artifacts that can be that big.
     */
    parseJson?: (json: Buffer) => unknown;
  },
): Promise<T> => {
  const client = axios.create();
  axiosRetry(client, {
    retries: 3,
    retryDelay: (retryCount, error) =>
      exponentialDelay(retryCount, error, 1000),
  });

  const response = await client.get<ArrayBuffer>(downloadUrl, {
    responseType: "arraybuffer",
    timeout: options?.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  // Not the URL itself: these are usually presigned, and the name ends up in
  // error messages.
  const archiveName = archiveNameFromUrl(downloadUrl);
  const bytes = new Uint8Array(response.data);
  if (options?.parseJson == null) {
    return unzipSingleEntryToJson<T>(bytes, archiveName);
  }
  return options.parseJson(await unzipSingleEntry(bytes, archiveName)) as T;
};

const archiveNameFromUrl = (downloadUrl: string): string => {
  const path = downloadUrl.split("?")[0];
  return path.slice(path.lastIndexOf("/") + 1) || "downloaded archive";
};
