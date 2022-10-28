import { mkdir, readFile, writeFile } from "fs/promises";
import { basename, join } from "path";
import {
  getMeticulousLocalDataDir,
  METICULOUS_LOGGER_NAME,
} from "@alwaysmeticulous/common";
import axios from "axios";
import log from "loglevel";
import { getSnippetsBaseUrl } from "../config/snippets";

export interface AssetMetadataItem {
  fileName: string;
  etag: string;
  fetchUrl: string;
}

export interface AssetMetadata {
  assets: AssetMetadataItem[];
}

const ASSETS_FOLDER_NAME = "assets";
const ASSET_METADATA_FILE_NAME = "assets.json";

export const getOrCreateAssetsDir: () => Promise<string> = async () => {
  const assetsDir = join(getMeticulousLocalDataDir(), ASSETS_FOLDER_NAME);
  await mkdir(assetsDir, { recursive: true });
  return assetsDir;
};

export const loadAssetMetadata: () => Promise<AssetMetadata> = async () => {
  const assetsFile = join(
    await getOrCreateAssetsDir(),
    ASSET_METADATA_FILE_NAME
  );

  const existingMetadata = await readFile(assetsFile)
    .then((data) => JSON.parse(data.toString("utf-8")))
    .catch(() => null);
  if (existingMetadata) {
    return existingMetadata;
  }

  return { assets: [] };
};

export const saveAssetMetadata: (
  assetMetadata: AssetMetadata
) => Promise<void> = async (assetMetadata) => {
  const assetsFile = join(
    await getOrCreateAssetsDir(),
    ASSET_METADATA_FILE_NAME
  );

  await writeFile(assetsFile, JSON.stringify(assetMetadata, null, 2));
};

export const fetchAsset: (path: string) => Promise<string> = async (path) => {
  const logger = log.getLogger(METICULOUS_LOGGER_NAME);
  const fetchUrl = new URL(path, getSnippetsBaseUrl()).href;
  const assetFileName = basename(new URL(fetchUrl).pathname);

  const assetMetadata = await loadAssetMetadata();
  const etag = (await axios.head(fetchUrl)).headers["etag"] || "";

  const entry = assetMetadata.assets.find(
    (item) => item.fileName === assetFileName
  );
  const filePath = join(await getOrCreateAssetsDir(), assetFileName);

  if (entry && etag !== "" && etag === entry.etag) {
    logger.debug(`${fetchUrl} already present`);
    return filePath;
  }

  const contents = (await axios.get(fetchUrl)).data;
  await writeFile(filePath, contents);
  if (entry) {
    logger.debug(`${fetchUrl} updated`);
    entry.etag = etag;
  } else {
    logger.debug(`${fetchUrl} downloaded`);
    assetMetadata.assets.push({ fileName: assetFileName, etag, fetchUrl });
  }
  await saveAssetMetadata(assetMetadata);
  return filePath;
};
