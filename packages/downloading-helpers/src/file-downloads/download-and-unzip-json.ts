import axios from "axios";
import axiosRetry from "axios-retry";
import JSZip from "jszip";

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

  const zip = await JSZip.loadAsync(response.data);
  const entries = Object.keys(zip.files);
  if (entries.length !== 1) {
    throw new Error(
      `Expected downloaded archive to contain exactly one file, but found: ${entries.join(
        ", ",
      )}`,
    );
  }

  const fileContent = await zip.files[entries[0]].async("string");
  return JSON.parse(fileContent) as T;
};
