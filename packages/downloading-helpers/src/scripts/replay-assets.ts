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

export const fetchAsset: (path: string) => Promise<string> = async (path) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const fetchUrl = new URL(path, getSnippetsBaseUrl()).href;
  let assetFileName = basename(new URL(fetchUrl).pathname);
  if (assetFileName.endsWith(".js")) {
    assetFileName = `${assetFileName.slice(0, -3)}.cjs`;
  }
  const client = axios.create();
  axiosRetry(client, { retries: 3 });

  const releaseLock = await waitToAcquireLockOnFile(await getAssetsFilePath());
  try {
    const assetMetadata = await loadAssetMetadata();

    const etag = (await client.head(fetchUrl)).headers["etag"] || "";

    const entry = assetMetadata.assets.find(
      (item) => item.fileName === assetFileName
    );
    const filePath = join(await getOrCreateAssetsDir(), assetFileName);

    if (entry && etag !== "" && etag === entry.etag) {
      logger.debug(`${fetchUrl} already present`);
      releaseLock();
      await fetchSourceMapIfDebugging(fetchUrl);
      return filePath;
    }

    let contents = (await client.get(fetchUrl)).data;
    if (path.endsWith(".map")) {
      contents = JSON.stringify(contents);
    }
    await writeFile(filePath, contents);
    if (entry) {
      logger.debug(`${fetchUrl} updated`);
      entry.etag = etag;
    } else {
      logger.debug(`${fetchUrl} downloaded`);
      assetMetadata.assets.push({ fileName: assetFileName, etag, fetchUrl });
    }
    await saveAssetMetadata(assetMetadata);
    releaseLock();
    await fetchSourceMapIfDebugging(path);
    return filePath;
  } catch (err) {
    releaseLock();
    logger.error(`Error fetching asset from ${fetchUrl}`);
    throw err;
  }
};

async function fetchSourceMapIfDebugging(path: string) {
  if (
    process.env.METICULOUS_SNIPPETS_BASE_URL?.includes("localhost") &&
    path.endsWith(".js")
  ) {
    await fetchAsset(`${path}.map`);
  }
}

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
