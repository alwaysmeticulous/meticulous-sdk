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
import { downloadFile } from "../file-downloads/download-file";
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
 *
 * Warning: this function is not thread safe. Do not try downloading a file to a path that may already be in use by another process.
 *
 * (for example most downloads are generally done at the test run level rather than the replay level)
 */
export const fetchAsset = async (path: string): Promise<string> => {
  const { snippetsBaseUrl, urlToDownloadFrom, fileNameToDownloadAs } =
    getAssetDownloadPaths(path);

  const jsFilePath = await fetchAndCacheFile(
    urlToDownloadFrom,
    fileNameToDownloadAs
  );
  if (
    snippetsBaseUrl.includes("localhost") &&
    process.env.CI !== "true" &&
    jsFilePath.endsWith(".js")
  ) {
    await fetchAndCacheFile(
      `${urlToDownloadFrom}.map`,
      `${basename(new URL(urlToDownloadFrom).pathname)}.map`
    );
  }

  return jsFilePath;
};

/**
 * Returns a record from asset path to a boolean indicating if the asset is outdated.
 */
export const checkIfAssetsOutdated = async (
  assetPaths: string[]
): Promise<Record<string, boolean>> => {
  const client = axios.create({ timeout: 60_000 });
  axiosRetry(client, { retries: 3 });

  const withEtags = await Promise.all(
    assetPaths.map(async (path) => {
      // Get latest etag for the asset
      const { urlToDownloadFrom, fileNameToDownloadAs } =
        getAssetDownloadPaths(path);
      const etag = (await client.head(urlToDownloadFrom)).headers["etag"] || "";
      return { path, etag, fileNameToDownloadAs };
    })
  );

  // Get etag for downloaded assets
  const assetMetadata = await readAssetMetadata();
  return Object.fromEntries(
    withEtags.map(({ path, etag, fileNameToDownloadAs }) => {
      const entry = assetMetadata.assets.find(
        (item) => item.fileName === fileNameToDownloadAs
      );
      return [path, !entry || !entry.etag || etag !== entry.etag];
    })
  );
};

const readAssetMetadata = async (): Promise<AssetMetadata> => {
  const releaseLock = await waitToAcquireLockOnFile(await getAssetsFilePath());
  try {
    const assetMetadata = await loadAssetMetadata();
    await releaseLock();
    return assetMetadata;
  } catch (err) {
    await releaseLock();
    throw err;
  }
};

const getAssetDownloadPaths = (path: string) => {
  const snippetsBaseUrl = getSnippetsBaseUrl();
  const urlToDownloadFrom = new URL(path, snippetsBaseUrl).href;
  const assetFileName = basename(new URL(urlToDownloadFrom).pathname);
  const assetFileNameAsCjsFile = convertJsExtensionToCJS(assetFileName);
  return {
    snippetsBaseUrl,
    urlToDownloadFrom,
    fileNameToDownloadAs: assetFileNameAsCjsFile,
  };
};

const fetchAndCacheFile = async (
  urlToDownloadFrom: string,
  fileNameToDownloadAs: string
): Promise<string> => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const client = axios.create({ timeout: 60_000 });
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
      await releaseLock();
      return filePath;
    }

    await downloadFile(urlToDownloadFrom, filePath);
    if (entry) {
      logger.debug(`${urlToDownloadFrom} updated`);
      entry.etag = etag;
    } else {
      logger.debug(`${urlToDownloadFrom} downloaded`);
      assetMetadata.assets.push({
        fileName: fileNameToDownloadAs,
        etag,
        fetchUrl: urlToDownloadFrom,
      });
    }
    await saveAssetMetadata(assetMetadata);
    await releaseLock();
    return filePath;
  } catch (err) {
    await releaseLock();
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
