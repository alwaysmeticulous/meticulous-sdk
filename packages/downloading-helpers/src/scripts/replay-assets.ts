import { mkdir, readFile, writeFile } from "fs/promises";
import { basename, join } from "path";
import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import axios from "axios";
import axiosRetry from "axios-retry";
import log from "loglevel";
import { getSnippetsBaseUrl } from "../config/snippets";
import { waitToAcquireLockOnFile } from "../file-downloads/local-data.utils";

interface AssetMetadataItem {
  fileName: string;
  etag: string;
  fetchUrl: string;
}

interface AssetMetadata {
  assets: AssetMetadataItem[];
}

const ASSETS_FOLDER_NAME = "assets";
const ASSET_METADATA_FILE_NAME = "assets.json";

/**
 * Downloads the given 'module' JS file as an MJS file (to force correct interpretation when loading the JS file).
 *
 * The associated source map will also be downloaded if present to sit alongside the main JS file and if the base snippets URL is a localhost URL.
 */
export const fetchAsset = async (path: string): Promise<string> => {
  const snippetsBaseUrl = getSnippetsBaseUrl();
  const fetchUrl = new URL(path, getSnippetsBaseUrl()).href;
  const assetFileName = basename(new URL(fetchUrl).pathname);
  const assetFileNameAsCjsFile = convertJsExtensionToCJS(assetFileName);

  const jsFilePath = await fetchAndCacheFile(fetchUrl, assetFileNameAsCjsFile);
  if (snippetsBaseUrl.includes("localhost")) {
    await fetchAndCacheFile(`${fetchUrl}.map`, `${assetFileName}.map`);
  }

  return jsFilePath;
};

export const getAssetUrl = (path: string): string => {
  return new URL(path, getSnippetsBaseUrl()).href;
};

const fetchAndCacheFile = async (
  urlToDownloadFrom: string,
  fileNameToDownloadAs: string
): Promise<string> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const client = axios.create();
  axiosRetry(client, { retries: 3 });

  const releaseLock = await waitToAcquireLockOnFile(await getAssetsFilePath());
  try {
    const assetMetadata = await loadAssetMetadata();

    const etag = (await client.head(urlToDownloadFrom)).headers["etag"] || "";

    const entry = assetMetadata.assets.find(
      (item) => item.fileName === fileNameToDownloadAs
    );
    const filePath = join(await getOrCreateAssetsDir(), fileNameToDownloadAs);

    if (entry && etag !== "" && etag === entry.etag) {
      logger.debug(`${urlToDownloadFrom} already present`);
      releaseLock();
      return filePath;
    }

    let contents = (await client.get(urlToDownloadFrom)).data;
    if (typeof contents !== "string") {
      // axios sometimes returns an object if the response body is JSON, as is the case for
      // instance when the asset we requested was a source map
      contents = JSON.stringify(contents);
    }
    await writeFile(filePath, contents);
    if (entry) {
      logger.debug(`${urlToDownloadFrom} updated`);
      entry.etag = etag;
    } else {
      logger.debug(`${urlToDownloadFrom} downloaded`);
      assetMetadata.assets.push({
        fileName: urlToDownloadFrom,
        etag,
        fetchUrl: urlToDownloadFrom,
      });
    }
    await saveAssetMetadata(assetMetadata);
    releaseLock();
    return filePath;
  } catch (err) {
    releaseLock();
    logger.error(`Error fetching asset from ${urlToDownloadFrom}`);
    throw err;
  }
};

const getOrCreateAssetsDir: () => Promise<string> = async () => {
  const assetsDir = join(getMeticulousLocalDataDir(), ASSETS_FOLDER_NAME);
  await mkdir(assetsDir, { recursive: true });
  return assetsDir;
};

const loadAssetMetadata: () => Promise<AssetMetadata> = async () => {
  const assetsFile = await getAssetsFilePath();

  const existingMetadata = await readFile(assetsFile)
    .then((data) => JSON.parse(data.toString("utf-8")))
    .catch(() => null);
  if (existingMetadata) {
    return existingMetadata;
  }

  return { assets: [] };
};

const saveAssetMetadata: (
  assetMetadata: AssetMetadata
) => Promise<void> = async (assetMetadata) => {
  const assetsFile = join(
    await getOrCreateAssetsDir(),
    ASSET_METADATA_FILE_NAME
  );

  await writeFile(assetsFile, JSON.stringify(assetMetadata, null, 2));
};

const getAssetsFilePath = async (): Promise<string> => {
  const assetsDir = await getOrCreateAssetsDir();
  return join(assetsDir, ASSET_METADATA_FILE_NAME);
};

const convertJsExtensionToCJS = (path: string) => {
  if (path.endsWith(".js")) {
    return `${path.slice(0, -3)}.cjs`;
  }
  return path;
};
